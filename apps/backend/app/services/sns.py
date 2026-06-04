from datetime import UTC, datetime
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sns import SnsChannelSetting
from app.models.tenant import Tenant
from app.schemas.sns import SnsSettingsUpdate

_PLAN_CHANNEL_LIMIT: dict[str, int] = {
    "BASIC": 2,
    "STANDARD": 4,
    "PREMIUM": 999,
}
_CHANNEL_FIELDS = [
    "kakao_url",
    "instagram_url",
    "facebook_url",
    "youtube_url",
    "blog_url",
    "naver_url",
]


def _count_channels(data: SnsSettingsUpdate) -> int:
    return sum(
        1
        for field in _CHANNEL_FIELDS
        if getattr(data, field, None) is not None
    )


async def _get_plan_type(db: AsyncSession, tenant_id: UUID) -> str:
    result = await db.execute(
        select(Tenant.plan_type).where(Tenant.id == tenant_id)
    )
    return result.scalar_one_or_none() or "BASIC"


async def get_sns_settings(db: AsyncSession) -> SnsChannelSetting | None:
    result = await db.execute(select(SnsChannelSetting))
    return result.scalar_one_or_none()


async def update_sns_settings(
    db: AsyncSession,
    tenant_id: UUID,
    data: SnsSettingsUpdate,
) -> SnsChannelSetting:
    channel_count = _count_channels(data)
    if channel_count > 0:
        plan = await _get_plan_type(db, tenant_id)
        limit = _PLAN_CHANNEL_LIMIT.get(plan, 2)
        if channel_count > limit:
            raise ValueError(
                f"현재 요금제({plan})에서는 최대 {limit}개 채널만 설정할 수 있습니다."
            )

    result = await db.execute(select(SnsChannelSetting))
    setting = result.scalar_one_or_none()

    if setting:
        for field in _CHANNEL_FIELDS:
            val = getattr(data, field, None)
            if val is not None:
                setattr(setting, field, val)
            elif val == "":
                setattr(setting, field, None)
        setting.updated_at = datetime.now(UTC)
    else:
        setting = SnsChannelSetting(
            tenant_id=tenant_id,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            **{f: getattr(data, f) for f in _CHANNEL_FIELDS},
        )
        db.add(setting)

    await db.commit()
    db.expire_all()
    result = await db.execute(select(SnsChannelSetting))
    return result.scalar_one()


async def test_url_validity(url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=3, follow_redirects=True) as client:
            resp = await client.head(url)
            return resp.status_code < 400
    except Exception:
        return False
