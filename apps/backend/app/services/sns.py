from datetime import UTC, datetime
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sns import SnsChannelSetting
from app.models.tenant import Tenant
from app.schemas.sns import SnsSettingsUpdate
from app.services import site_cache

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


# 노출 위치 (T-038-A) — 채널 수 한도에는 세지 않는다
_DISPLAY_FIELDS = ["show_in_footer", "show_floating", "floating_position"]


def _merged_channels(
    setting: SnsChannelSetting | None, data: SnsSettingsUpdate
) -> dict[str, str | None]:
    """저장 후 채널 주소 — None 은 그대로, 빈 문자열은 지우기.

    한도는 요청에 실린 칸 수가 아니라 저장 후 '주소가 있는' 채널 수로 센다.
    (관리자 화면은 빈 칸도 "" 로 보내 예전엔 6칸이 모두 세어져 저장이 막혔다 — T-038-A)
    """
    merged: dict[str, str | None] = {}
    for field in _CHANNEL_FIELDS:
        val = getattr(data, field, None)
        if val is None:
            merged[field] = getattr(setting, field, None) if setting else None
        else:
            merged[field] = val.strip() or None
    return merged


async def _get_plan_type(db: AsyncSession, tenant_id: UUID) -> str:
    result = await db.execute(select(Tenant.plan_type).where(Tenant.id == tenant_id))
    return result.scalar_one_or_none() or "BASIC"


async def get_sns_settings(db: AsyncSession) -> SnsChannelSetting | None:
    result = await db.execute(select(SnsChannelSetting))
    return result.scalar_one_or_none()


async def update_sns_settings(
    db: AsyncSession,
    tenant_id: UUID,
    data: SnsSettingsUpdate,
) -> SnsChannelSetting:
    result = await db.execute(select(SnsChannelSetting))
    setting = result.scalar_one_or_none()

    channels = _merged_channels(setting, data)
    channel_count = sum(1 for v in channels.values() if v)
    if channel_count > 0:
        plan = await _get_plan_type(db, tenant_id)
        limit = _PLAN_CHANNEL_LIMIT.get(plan, 2)
        if channel_count > limit:
            raise ValueError(
                f"현재 요금제({plan})에서는 최대 {limit}개 채널만 설정할 수 있습니다."
            )

    if setting:
        for field, val in channels.items():
            setattr(setting, field, val)
        for field in _DISPLAY_FIELDS:
            val = getattr(data, field, None)
            if val is not None:
                setattr(setting, field, val)
        setting.updated_at = datetime.now(UTC)
    else:
        setting = SnsChannelSetting(
            tenant_id=tenant_id,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            **channels,
            **{
                f: getattr(data, f)
                for f in _DISPLAY_FIELDS
                if getattr(data, f) is not None
            },
        )
        db.add(setting)

    await db.commit()
    # SNS 링크 · SEO 메타는 공개 사이트 응답에 들어간다 — 캐시 비우기 (T-066-A)
    await site_cache.purge_site(db, tenant_id)
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
