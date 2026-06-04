from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.seo import SeoSetting
from app.models.tenant import Tenant
from app.schemas.seo import SeoSettingsUpdate

_META_TITLE_MAX = 60
_META_DESC_MAX = 160


def _validate(data: SeoSettingsUpdate) -> None:
    if data.meta_title is not None and len(data.meta_title) > _META_TITLE_MAX:
        raise ValueError(f"페이지 제목은 {_META_TITLE_MAX}자 이하여야 합니다.")
    desc_len = len(data.meta_description) if data.meta_description else 0
    if desc_len > _META_DESC_MAX:
        raise ValueError(f"메타 설명은 {_META_DESC_MAX}자 이하여야 합니다.")


async def get_seo_settings(db: AsyncSession) -> SeoSetting | None:
    result = await db.execute(select(SeoSetting))
    return result.scalar_one_or_none()


async def update_seo_settings(
    db: AsyncSession,
    tenant_id: UUID,
    data: SeoSettingsUpdate,
) -> SeoSetting:
    _validate(data)

    result = await db.execute(select(SeoSetting))
    setting = result.scalar_one_or_none()

    update_fields = [
        "meta_title",
        "meta_description",
        "og_image_url",
        "robots_txt",
        "google_analytics_id",
        "naver_site_verification",
    ]

    if setting:
        for field in update_fields:
            val = getattr(data, field, None)
            if val is not None:
                setattr(setting, field, val)
        setting.updated_at = datetime.now(UTC)
    else:
        setting = SeoSetting(
            tenant_id=tenant_id,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            **{f: getattr(data, f) for f in update_fields},
        )
        db.add(setting)

    await db.commit()
    db.expire_all()
    result = await db.execute(select(SeoSetting))
    return result.scalar_one()


async def generate_sitemap_xml(db: AsyncSession, tenant_slug: str) -> str:

    result = await db.execute(
        select(Tenant).where(Tenant.slug == tenant_slug, Tenant.is_active == True)  # noqa: E712
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        return ""

    from app.core.config import settings as app_settings
    base_url = f"{app_settings.client_base_url}/{tenant_slug}"

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        f"  <url><loc>{base_url}</loc>"
        "<changefreq>weekly</changefreq><priority>1.0</priority></url>",
        "</urlset>",
    ]
    return "\n".join(lines)
