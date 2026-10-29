from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.seo import SeoSetting
from app.models.tenant import Tenant
from app.schemas.seo import SeoLimitsResponse, SeoSettingsUpdate
from app.services import site_cache

_META_TITLE_MAX = 60
_META_DESC_MAX = 160

# 대표 키워드 (T-040-A, 기획서 4 AD-05 · 2 요금제 표 "고급 (키워드 + 사이트맵)")
KEYWORDS_MAX = 5
KEYWORD_MAX_LENGTH = 30
KEYWORD_PLANS = frozenset({"STANDARD", "PREMIUM"})
KEYWORDS_PLAN_MESSAGE = "대표 키워드는 STANDARD 이상 요금제에서 저장할 수 있습니다."


def keywords_allowed(plan_type: str | None) -> bool:
    return (plan_type or "").upper() in KEYWORD_PLANS


def normalize_keywords(raw: list[str]) -> list[str]:
    """공백 정리, 빈 값 · 중복(대소문자 무시) 제거. 한도를 넘으면 ValueError."""
    result: list[str] = []
    seen: set[str] = set()
    for item in raw:
        word = " ".join(str(item).split())
        if not word or word.lower() in seen:
            continue
        if len(word) > KEYWORD_MAX_LENGTH:
            raise ValueError(f"키워드는 {KEYWORD_MAX_LENGTH}자 이하여야 합니다.")
        seen.add(word.lower())
        result.append(word)
    if len(result) > KEYWORDS_MAX:
        raise ValueError(f"키워드는 최대 {KEYWORDS_MAX}개까지 넣을 수 있습니다.")
    return result


async def get_limits(db: AsyncSession, tenant_id: UUID) -> SeoLimitsResponse:
    tenant = await db.get(Tenant, tenant_id)
    return SeoLimitsResponse(
        keywords_allowed=keywords_allowed(tenant.plan_type if tenant else None),
        keywords_max=KEYWORDS_MAX,
        keyword_max_length=KEYWORD_MAX_LENGTH,
    )


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

    keywords: list[str] | None = None
    if data.keywords is not None:
        keywords = normalize_keywords(data.keywords)
        current = list(setting.keywords or []) if setting else []
        # 요금제를 내려도 저장된 키워드는 그대로 쓰고, 바꾸는 것만 막는다
        if keywords != current:
            tenant = await db.get(Tenant, tenant_id)
            if not keywords_allowed(tenant.plan_type if tenant else None):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=KEYWORDS_PLAN_MESSAGE,
                )

    update_fields = [
        "meta_title",
        "meta_description",
        "og_image_url",
        "robots_txt",
        "google_analytics_id",
        "naver_site_verification",
        "google_site_verification",
    ]

    if setting:
        for field in update_fields:
            val = getattr(data, field, None)
            if val is not None:
                setattr(setting, field, val)
        if keywords is not None:
            setting.keywords = keywords
        setting.updated_at = datetime.now(UTC)
    else:
        setting = SeoSetting(
            tenant_id=tenant_id,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            keywords=keywords or [],
            **{f: getattr(data, f) for f in update_fields},
        )
        db.add(setting)

    await db.commit()
    # SNS 링크 · SEO 메타는 공개 사이트 응답에 들어간다 — 캐시 비우기 (T-066-A)
    await site_cache.purge_site(db, tenant_id)
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
