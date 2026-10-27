"""T-111 방문자 마이페이지 — 내 정보 · 비밀번호 · 알림 설정 · 탈퇴 (기획서 16.7 · 16.8).

- 연락처 변경 · 소셜 가입자 첫 비밀번호 설정은 휴대폰 인증(MYPAGE) 필수
- 비밀번호 변경 시 password_changed_at 기록 → 다른 기기 토큰 무효 (T-109), 보안 알림
- 탈퇴: 진행 중 예약이 있으면 차단. 소프트 삭제 + 개인정보 즉시 익명화 (개인정보보호법),
  예약 · 소셜 연결 소프트 삭제, 문의는 사업체 기록으로 남기고 회원 연결만 해제.
  탈퇴 안내는 익명화 전에 원래 연락처로 보낸다.
"""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import member_errors as errors
from app.core.member_errors import MemberAuthError
from app.core.security import hash_password, verify_password
from app.models.inquiry import Inquiry
from app.models.site_member import (
    MemberPasswordResetToken,
    MemberReservation,
    MemberSocialAccount,
    SiteMember,
)
from app.models.tenant import Tenant
from app.schemas.site_member import (
    MemberNotificationSettings,
    MemberPasswordChangeRequest,
    MemberUpdateRequest,
    MemberWithdrawRequest,
)
from app.services import member_verification

ACTIVE_RESERVATION_STATUSES = ("PENDING", "CONFIRMED")
WITHDRAWN_NAME = "탈퇴회원"


def _now() -> datetime:
    return datetime.now(UTC)


async def social_providers_of(db: AsyncSession, member: SiteMember) -> list[str]:
    rows = await db.execute(
        select(MemberSocialAccount.provider)
        .where(
            MemberSocialAccount.member_id == member.id,
            MemberSocialAccount.deleted_at.is_(None),
        )
        .order_by(MemberSocialAccount.created_at)
    )
    return list(rows.scalars().all())


# ── 내 정보 ────────────────────────────────────────────────────────────────


async def update_profile(
    db: AsyncSession, member: SiteMember, body: MemberUpdateRequest
) -> SiteMember:
    if body.name is not None:
        member.name = body.name
    if "birth_date" in body.model_fields_set:
        member.birth_date = body.birth_date
    if body.phone is not None:
        phone = member_verification.normalize_phone(body.phone)
        if phone != member.phone:
            if body.phone_verification_id is None:
                raise MemberAuthError(
                    400, "PHONE_NOT_VERIFIED", errors.PHONE_NOT_VERIFIED, field="phone"
                )
            await member_verification.take_verified(
                db, member.tenant_id, body.phone_verification_id, "MYPAGE", phone=phone
            )
            member.phone = phone
    await db.commit()
    await db.refresh(member)
    return member


async def update_notifications(
    db: AsyncSession, member: SiteMember, body: MemberNotificationSettings
) -> SiteMember:
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(member, field, value)
    await db.commit()
    await db.refresh(member)
    return member


# ── 비밀번호 ───────────────────────────────────────────────────────────────


async def change_password(
    db: AsyncSession, member: SiteMember, body: MemberPasswordChangeRequest
) -> SiteMember:
    if member.password_hash:
        if not body.current_password:
            raise MemberAuthError(
                400,
                "VALIDATION_ERROR",
                errors.CURRENT_PASSWORD_REQUIRED,
                field="current_password",
            )
        if not verify_password(body.current_password, member.password_hash):
            raise MemberAuthError(
                401,
                "INVALID_CREDENTIALS",
                errors.WRONG_PASSWORD,
                field="current_password",
            )
    else:
        # 소셜 가입자 첫 비밀번호 — 토큰만으로는 설정할 수 없게 본인 확인
        if body.phone_verification_id is None or not member.phone:
            raise MemberAuthError(
                400, "PHONE_NOT_VERIFIED", errors.PHONE_NOT_VERIFIED, field="phone"
            )
        await member_verification.take_verified(
            db,
            member.tenant_id,
            body.phone_verification_id,
            "MYPAGE",
            phone=member.phone,
        )

    member.password_hash = hash_password(body.password)
    member.password_changed_at = _now()
    member.failed_login_count = 0
    member.locked_until = None
    await db.commit()
    await db.refresh(member)
    _enqueue_password_changed(member.tenant_id, member.id)
    return member


def _enqueue_password_changed(tenant_id: UUID, member_id: UUID) -> None:
    try:
        from app.workers.notification import send_member_password_changed

        send_member_password_changed.delay(str(tenant_id), str(member_id))
    except Exception:
        pass


# ── 탈퇴 ──────────────────────────────────────────────────────────────────


async def has_active_reservation(db: AsyncSession, member: SiteMember) -> bool:
    now = _now()
    row = await db.execute(
        select(MemberReservation.id)
        .where(
            MemberReservation.member_id == member.id,
            MemberReservation.deleted_at.is_(None),
            MemberReservation.status.in_(ACTIVE_RESERVATION_STATUSES),
            (MemberReservation.reserved_at.is_(None))
            | (MemberReservation.reserved_at >= now),
        )
        .limit(1)
    )
    return row.first() is not None


async def withdraw(
    db: AsyncSession, tenant: Tenant, member: SiteMember, body: MemberWithdrawRequest
) -> None:
    if member.password_hash and (
        not body.password or not verify_password(body.password, member.password_hash)
    ):
        raise MemberAuthError(
            401, "INVALID_CREDENTIALS", errors.WRONG_PASSWORD, field="password"
        )
    if await has_active_reservation(db, member):
        raise MemberAuthError(
            409, "ACTIVE_RESERVATION_EXISTS", errors.ACTIVE_RESERVATION_EXISTS
        )

    # 안내 발송용 원래 연락처 (익명화 전에 확보)
    contact = {"email": member.email, "phone": member.phone, "name": member.name}
    now = _now()

    await db.execute(
        update(MemberReservation)
        .where(
            MemberReservation.member_id == member.id,
            MemberReservation.deleted_at.is_(None),
        )
        .values(deleted_at=now)
    )
    await db.execute(
        update(MemberSocialAccount)
        .where(
            MemberSocialAccount.member_id == member.id,
            MemberSocialAccount.deleted_at.is_(None),
        )
        .values(deleted_at=now)
    )
    await db.execute(
        update(MemberPasswordResetToken)
        .where(
            MemberPasswordResetToken.member_id == member.id,
            MemberPasswordResetToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    # 문의는 사업체 기록으로 남기고 회원 연결만 해제
    await db.execute(
        update(Inquiry).where(Inquiry.member_id == member.id).values(member_id=None)
    )

    reason: str | None = body.reason
    if reason and body.reason_detail:
        reason = f"{reason}: {body.reason_detail.strip()}"
    member.withdrawal_reason = reason
    member.email = f"withdrawn-{member.id}@deleted.invalid"
    member.name = WITHDRAWN_NAME
    member.phone = None
    member.birth_date = None
    member.password_hash = None
    member.social_id = None
    member.marketing_agree = False
    member.sms_agree = False
    member.email_agree = False
    member.is_active = False
    member.password_changed_at = now  # 남은 토큰 무효
    member.deleted_at = now
    await db.commit()
    _enqueue_withdrawn(tenant.name, contact)


def _enqueue_withdrawn(site_name: str, contact: dict) -> None:
    try:
        from app.workers.notification import send_member_withdrawn

        send_member_withdrawn.delay(
            site_name, contact["name"], contact["email"], contact["phone"]
        )
    except Exception:
        pass
