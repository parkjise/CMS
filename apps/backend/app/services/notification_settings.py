from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sns import NotificationSetting
from app.schemas.sns import NotificationSettingsUpdate


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
    if data.recipient_phone is not None:
        setting.recipient_phone = data.recipient_phone
    if data.recipient_email is not None:
        setting.recipient_email = str(data.recipient_email)

    await db.commit()
    await db.refresh(setting)
    return setting


async def prepare_test(
    db: AsyncSession, tenant_id: UUID
) -> tuple[bool, list[str], str]:
    """
    설정된 채널을 점검하고 발송 가능 여부 반환.
    실제 알림 발송은 T-031에서 wire-up 예정 — 현재는 simulation 응답.
    """
    setting = await get_or_create_settings(db, tenant_id)

    channels: list[str] = []
    if setting.alimtalk_enabled and setting.recipient_phone:
        channels.append("KAKAO")
    if setting.sms_enabled and setting.recipient_phone:
        channels.append("SMS")
    if setting.email_enabled and setting.recipient_email:
        channels.append("EMAIL")

    if not channels:
        return (False, [], "활성화된 알림 채널이 없습니다.")
    return (
        True,
        channels,
        f"{', '.join(channels)} 채널로 테스트 알림이 발송 큐에 등록되었습니다.",
    )
