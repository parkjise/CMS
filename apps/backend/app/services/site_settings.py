"""사업체 공통 정보 (T-036-A) — 홈페이지 전체에 한 번만 정하는 값."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.site import SiteSetting
from app.schemas.site import SiteSettingsUpdate
from app.services import site_cache

FIELDS = tuple(SiteSettingsUpdate.model_fields)


async def get_site_settings(db: AsyncSession) -> SiteSetting | None:
    """현재 테넌트(RLS)의 공통 정보"""
    result = await db.execute(select(SiteSetting))
    return result.scalar_one_or_none()


async def update_site_settings(
    db: AsyncSession, tenant_id: UUID, data: SiteSettingsUpdate
) -> SiteSetting:
    setting = await get_site_settings(db)
    if setting is None:
        setting = SiteSetting(tenant_id=tenant_id)
        db.add(setting)
    for field in FIELDS:
        value = getattr(data, field)
        if value is not None:  # None = 바꾸지 않음
            setattr(setting, field, value or None)  # "" = 지우기
    setting.updated_at = datetime.now(UTC)
    await db.commit()
    # 푸터 · 로고 · 구조화 데이터가 공개 사이트 응답에 들어간다
    await site_cache.purge_site(db, tenant_id)
    db.expire_all()
    saved = await get_site_settings(db)
    assert saved is not None
    return saved
