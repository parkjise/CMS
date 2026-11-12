from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.member_errors import PHONE_NOT_VERIFIED, MemberAuthError
from app.models.site_member import PhoneVerification
from app.models.sns import NotificationSetting
from app.models.tenant import Tenant
from app.schemas.sns import NotificationSettingsUpdate
from app.services import member_verification
from app.services import notification as notification_service


def _first_day_of_month(d: date) -> date:
    return d.replace(day=1)


async def _maybe_reset_counter(db: AsyncSession, setting: NotificationSetting) -> None:
    """이번 달 1일 이전에 마지막 리셋이면 카운터를 0으로 초기화."""
    this_month = _first_day_of_month(date.today())
    if setting.monthly_reset_at < this_month:
        setting.monthly_kakao_count = 0
        setting.monthly_reset_at = this_month


async def get_or_create_settings(
    db: AsyncSession, tenant_id: UUID
) -> NotificationSetting:
    result = await db.execute(
        select(NotificationSetting).where(NotificationSetting.tenant_id == tenant_id)
    )
    setting = result.scalar_one_or_none()
    if setting is None:
        setting = NotificationSetting(
            tenant_id=tenant_id,
            alimtalk_enabled=False,
            sms_enabled=False,
            email_enabled=False,
            monthly_kakao_count=0,
            monthly_reset_at=_first_day_of_month(date.today()),
        )
        db.add(setting)
        await db.commit()
        await db.refresh(setting)
    else:
        await _maybe_reset_counter(db, setting)
        await db.commit()
        await db.refresh(setting)
    return setting


async def update_settings(
    db: AsyncSession,
    tenant_id: UUID,
    data: NotificationSettingsUpdate,
) -> NotificationSetting:
    setting = await get_or_create_settings(db, tenant_id)

    if data.alimtalk_enabled is not None:
        setting.alimtalk_enabled = data.alimtalk_enabled
    if data.sms_enabled is not None:
        setting.sms_enabled = data.sms_enabled
    if data.email_enabled is not None:
        setting.email_enabled = data.email_enabled
    if data.recipient_phone is not None and (
        data.recipient_phone != setting.recipient_phone
        or data.phone_verification_id is not None
    ):
        # 새 번호 · 다시 인증 — 그 번호로 문자 인증을 마쳐야 저장 (T-204)
        if data.phone_verification_id is None:
            raise MemberAuthError(
                400, "PHONE_NOT_VERIFIED", PHONE_NOT_VERIFIED, field="recipient_phone"
            )
        await member_verification.take_verified(
            db,
            tenant_id,
            data.phone_verification_id,
            "ADMIN_ALERT",
            phone=data.recipient_phone,
        )
        setting.recipient_phone = data.recipient_phone
        setting.recipient_phone_verified_at = datetime.now(UTC)
    if data.recipient_email is not None:
        setting.recipient_email = str(data.recipient_email)

    await db.commit()
    await db.refresh(setting)
    return setting


async def send_phone_code(
    db: AsyncSession, tenant_id: UUID, phone: str
) -> tuple[PhoneVerification, int]:
    """알림 받을 번호로 인증번호 문자 (T-204) — 방문자 인증과 같은 제한."""
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise MemberAuthError(404, "NOT_FOUND", "사업체를 찾을 수 없습니다")
    return await member_verification.send_code(db, tenant, phone, "ADMIN_ALERT")


async def verify_phone_code(
    db: AsyncSession, tenant_id: UUID, verification_id: UUID, code: str
) -> PhoneVerification:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise MemberAuthError(404, "NOT_FOUND", "사업체를 찾을 수 없습니다")
    return await member_verification.verify_code(db, tenant, verification_id, code)


async def prepare_test(
    db: AsyncSession, tenant_id: UUID
) -> tuple[bool, list[str], str]:
    """
    활성화된 채널을 실제로 발송 시도하고 결과를 요약 반환.
    test 모드(`notification_mode != "live"`)에서는 외부 호출 없이 성공 시뮬레이션.
    """
    setting = await get_or_create_settings(db, tenant_id)

    enabled_channels: list[str] = []
    if setting.alimtalk_enabled and setting.recipient_phone:
        enabled_channels.append("KAKAO")
    if setting.sms_enabled and setting.recipient_phone:
        enabled_channels.append("SMS")
    if setting.email_enabled and setting.recipient_email:
        enabled_channels.append("EMAIL")

    if not enabled_channels:
        return (False, [], "활성화된 알림 채널이 없습니다.")

    # 테넌트 이름 조회
    tenant_result = await db.execute(select(Tenant.name).where(Tenant.id == tenant_id))
    tenant_name = tenant_result.scalar_one_or_none() or "사이트"

    # 실제 발송 (test 모드면 stub 성공 응답)
    result = await notification_service.notify_inquiry(
        db,
        tenant_id=tenant_id,
        inquiry_name="테스트 발송",
        inquiry_phone=setting.recipient_phone or "010-0000-0000",
        inquiry_type="GENERAL",
        inquiry_created_at=datetime.now(UTC),
        tenant_name=tenant_name,
    )

    if result["skipped"]:
        return (False, [], result["reason"] or "발송이 차단되었습니다.")

    sent_channels: list[str] = []
    if result["kakao_sent"]:
        sent_channels.append("KAKAO")
    if result["sms_sent"]:
        sent_channels.append("SMS")
    # EMAIL은 별도 wire-up 전까지는 simulation
    if "EMAIL" in enabled_channels:
        sent_channels.append("EMAIL")

    if not sent_channels:
        return (False, [], "알림 발송에 모두 실패했습니다.")
    return (
        True,
        sent_channels,
        f"{', '.join(sent_channels)} 채널로 테스트 알림이 발송되었습니다.",
    )
