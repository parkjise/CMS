"""T-032 알림 발송 Celery 태스크.

문의 접수 시 비동기로 알림톡/SMS를 발송하고 성공 시
`inquiries.is_notified=True`로 업데이트한다.
"""

import asyncio

from sqlalchemy import select, update

from app.db.session import set_super_admin_context
from app.models.inquiry import Inquiry
from app.models.tenant import Tenant
from app.services import notification as notification_service
from app.workers.celery_app import celery_app


@celery_app.task(
    name="app.workers.notification.send_inquiry_alert",
    bind=True,
    max_retries=3,
    default_retry_delay=2,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def send_inquiry_alert(self, tenant_id: str, inquiry_id: str) -> dict:
    """문의 접수 알림을 비동기로 발송. 지수 백오프 재시도."""
    return asyncio.run(_send_inquiry_alert(tenant_id, inquiry_id))


async def _send_inquiry_alert(tenant_id: str, inquiry_id: str) -> dict:
    """
    inquiry/tenant 조회 → notification_service.notify_inquiry 호출 →
    성공 시 is_notified=True. 반환값: notify_inquiry 결과 + notified 플래그.
    """
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        await set_super_admin_context(db)

        inq_row = await db.execute(select(Inquiry).where(Inquiry.id == inquiry_id))
        inquiry = inq_row.scalar_one_or_none()
        if inquiry is None:
            return {
                "kakao_sent": False,
                "sms_sent": False,
                "skipped": True,
                "reason": "INQUIRY_NOT_FOUND",
                "notified": False,
            }

        tenant_row = await db.execute(select(Tenant.name).where(Tenant.id == tenant_id))
        tenant_name = tenant_row.scalar_one_or_none() or "사이트"

        from uuid import UUID

        result = await notification_service.notify_inquiry(
            db,
            tenant_id=UUID(tenant_id),
            inquiry_name=inquiry.name,
            inquiry_phone=inquiry.phone,
            inquiry_type=inquiry.inquiry_type,
            inquiry_created_at=inquiry.created_at,
            tenant_name=tenant_name,
        )

        notified = bool(result.get("kakao_sent") or result.get("sms_sent"))
        if notified:
            await db.execute(
                update(Inquiry).where(Inquiry.id == inquiry_id).values(is_notified=True)
            )
            await db.commit()

        return {**result, "notified": notified}


@celery_app.task(
    name="app.workers.notification.send_member_joined_alert",
    bind=True,
    max_retries=3,
    default_retry_delay=2,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def send_member_joined_alert(self, tenant_id: str, member_id: str) -> dict:
    """방문자 회원 가입 후 환영 메일 + 관리자 신규 회원 알림 (T-108)."""
    return asyncio.run(_send_member_joined_alert(tenant_id, member_id))


async def _send_member_joined_alert(tenant_id: str, member_id: str) -> dict:
    from app.db.session import AsyncSessionLocal
    from app.models.site_member import SiteMember
    from app.services import email as email_service

    async with AsyncSessionLocal() as db:
        await set_super_admin_context(db)
        member = (
            await db.execute(select(SiteMember).where(SiteMember.id == member_id))
        ).scalar_one_or_none()
        tenant = (
            await db.execute(select(Tenant).where(Tenant.id == tenant_id))
        ).scalar_one_or_none()
        if member is None or tenant is None:
            return {"welcome_sent": False, "skipped": True, "reason": "NOT_FOUND"}

        welcome = await email_service.send_member_welcome(
            member.email, member_name=member.name, site_name=tenant.name
        )
        alert = await notification_service.notify_member_joined(
            db,
            tenant_id=tenant.id,
            member_name=member.name,
            member_phone=member.phone,
            joined_at=member.created_at,
            tenant_name=tenant.name,
        )
    return {"welcome_sent": bool(welcome.get("sent")), **alert}


@celery_app.task(
    name="app.workers.notification.send_member_password_changed",
    bind=True,
    max_retries=3,
    default_retry_delay=2,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def send_member_password_changed(self, tenant_id: str, member_id: str) -> dict:
    """방문자 비밀번호 변경 보안 알림 — 메일 + 문자 (T-109, 기획서 16.11)."""
    return asyncio.run(_send_member_password_changed(tenant_id, member_id))


async def _send_member_password_changed(tenant_id: str, member_id: str) -> dict:
    from app.db.session import AsyncSessionLocal
    from app.models.site_member import SiteMember
    from app.services import email as email_service

    async with AsyncSessionLocal() as db:
        await set_super_admin_context(db)
        member = (
            await db.execute(select(SiteMember).where(SiteMember.id == member_id))
        ).scalar_one_or_none()
        tenant = (
            await db.execute(select(Tenant).where(Tenant.id == tenant_id))
        ).scalar_one_or_none()
    if member is None or tenant is None:
        return {"email_sent": False, "sms_sent": False, "reason": "NOT_FOUND"}

    changed_at = notification_service.format_kr_time(
        member.password_changed_at or member.updated_at
    )
    email = await email_service.send_email(
        member.email,
        subject=f"[{tenant.name}] 비밀번호가 변경되었습니다",
        template="member_password_changed",
        variables={
            "member_name": member.name,
            "site_name": tenant.name,
            "changed_at": changed_at,
        },
    )
    # 보안 알림은 문자 수신 동의(sms_agree)와 관계없이 발송한다
    sms_sent = False
    if member.phone:
        sms_sent = await notification_service.send_sms(
            to=member.phone,
            message=(
                f"[{tenant.name}] 비밀번호가 변경되었습니다. "
                "본인이 아니라면 고객센터에 문의하세요."
            ),
        )
    return {"email_sent": bool(email.get("sent")), "sms_sent": sms_sent, "reason": ""}


@celery_app.task(
    name="app.workers.notification.send_member_withdrawn",
    bind=True,
    max_retries=3,
    default_retry_delay=2,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def send_member_withdrawn(
    self, site_name: str, name: str, email: str, phone: str | None
) -> dict:
    """방문자 탈퇴 안내 — 메일 + 문자 (T-111, 기획서 16.8).

    회원 정보는 이미 익명화돼 있으므로 원래 연락처를 인자로 받는다.
    """
    return asyncio.run(_send_member_withdrawn(site_name, name, email, phone))


async def _send_member_withdrawn(
    site_name: str, name: str, email: str, phone: str | None
) -> dict:
    from app.services import email as email_service

    sent = await email_service.send_email(
        email,
        subject=f"[{site_name}] 회원 탈퇴가 완료되었습니다",
        template="member_withdrawn",
        variables={"member_name": name, "site_name": site_name},
    )
    sms_sent = False
    if phone:
        sms_sent = await notification_service.send_sms(
            to=phone,
            message=(
                f"[{site_name}] 회원 탈퇴가 완료되었습니다."
                " 그동안 이용해주셔서 감사합니다."
            ),
        )
    return {"email_sent": bool(sent.get("sent")), "sms_sent": sms_sent}


RESERVATION_STATUS_LABELS = {"CONFIRMED": "확정", "CANCELLED": "취소"}


@celery_app.task(
    name="app.workers.notification.send_member_reservation_notice",
    bind=True,
    max_retries=3,
    default_retry_delay=2,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def send_member_reservation_notice(
    self, tenant_id: str, reservation_id: str, status: str
) -> dict:
    """회원 예약 확정 · 취소 알림 (T-115) — 회원 알림 설정 · 수신 동의에 따라."""
    return asyncio.run(
        _send_member_reservation_notice(tenant_id, reservation_id, status)
    )


async def _send_member_reservation_notice(
    tenant_id: str, reservation_id: str, status: str
) -> dict:
    from app.db.session import AsyncSessionLocal
    from app.models.site_member import MemberReservation, SiteMember
    from app.services import email as email_service

    async with AsyncSessionLocal() as db:
        await set_super_admin_context(db)
        reservation = await db.get(MemberReservation, reservation_id)
        tenant = (
            await db.execute(select(Tenant).where(Tenant.id == tenant_id))
        ).scalar_one_or_none()
        member = (
            await db.get(SiteMember, reservation.member_id) if reservation else None
        )
    if reservation is None or tenant is None or member is None:
        return {"sms_sent": False, "email_sent": False, "reason": "NOT_FOUND"}
    wants = {
        "CONFIRMED": member.notify_reservation_confirmed,
        "CANCELLED": member.notify_reservation_cancelled,
    }.get(status, False)
    if not wants or member.deleted_at is not None or not member.is_active:
        return {"sms_sent": False, "email_sent": False, "reason": "OPTED_OUT"}

    label = RESERVATION_STATUS_LABELS.get(status, status)
    when = (
        notification_service.format_kr_time(reservation.reserved_at)
        if reservation.reserved_at
        else None
    )
    sms_sent = False
    if member.sms_agree and member.phone:
        sms_sent = await notification_service.send_sms(
            to=member.phone,
            message=(
                f"[{tenant.name}] 예약이 {label}되었습니다."
                + (f" ({when})" if when else "")
            ),
        )
    email_sent = False
    if member.email_agree:
        result = await email_service.send_email(
            member.email,
            subject=f"[{tenant.name}] 예약이 {label}되었습니다",
            template="member_reservation_status",
            variables={
                "member_name": member.name,
                "site_name": tenant.name,
                "status_label": label,
                "reserved_at": when,
            },
        )
        email_sent = bool(result.get("sent"))
    return {"sms_sent": sms_sent, "email_sent": email_sent, "reason": ""}
