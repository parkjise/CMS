"""T-032 알림 발송 Celery 태스크.

문의 접수 시 비동기로 알림톡/SMS를 발송하고 성공 시
`inquiries.is_notified=True`로 업데이트한다.
"""

import asyncio

from sqlalchemy import select, text, update

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
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))

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
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
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
