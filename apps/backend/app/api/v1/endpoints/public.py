import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.core.redis import get_redis
from app.models.section import Section
from app.models.seo import SeoSetting
from app.models.sns import SnsChannelSetting
from app.models.template import Template, TenantTemplateOverride
from app.models.tenant import Tenant
from app.schemas.common import ApiResponse
from app.schemas.public_site import (
    PublicSectionResponse,
    PublicSeoResponse,
    PublicSiteResponse,
    PublicSnsResponse,
    PublicTemplateResponse,
    PublicTenantResponse,
)

router = APIRouter(tags=["public"])

_CACHE_TTL = 600  # 10분


def _site_cache_key(tenant_slug: str) -> str:
    return f"site:{tenant_slug}"


async def _get_tenant(db: AsyncSession, tenant_slug: str) -> Tenant | None:
    result = await db.execute(
        select(Tenant).where(Tenant.slug == tenant_slug, Tenant.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def _build_site_data(db: AsyncSession, tenant: Tenant) -> PublicSiteResponse:
    tid = tenant.id

    await db.execute(
        text("SELECT set_config('app.current_tenant_id', :tid, true)"),
        {"tid": str(tid)},
    )

    sections_result = await db.execute(
        select(Section)
        .where(Section.deleted_at.is_(None))
        .order_by(Section.display_order)
        .options(selectinload(Section.settings))
    )
    sections = list(sections_result.scalars().all())

    seo_result = await db.execute(select(SeoSetting))
    seo = seo_result.scalar_one_or_none()

    sns_result = await db.execute(select(SnsChannelSetting))
    sns = sns_result.scalar_one_or_none()

    # 적용된 템플릿(override)을 우선 사용하고, 없으면 업종 기본 템플릿으로 폴백
    override = (
        await db.execute(
            select(TenantTemplateOverride).where(
                TenantTemplateOverride.tenant_id == tid
            )
        )
    ).scalar_one_or_none()

    template: Template | None = None
    css_overrides: dict = {}
    if override is not None:
        template = await db.get(Template, override.template_id)
        css_overrides = dict(override.css_overrides or {})
    if template is None:
        template = (
            await db.execute(
                select(Template)
                .where(
                    Template.template_type == tenant.template_type,
                    Template.is_active == True,  # noqa: E712
                )
                .limit(1)
            )
        ).scalar_one_or_none()

    template_payload: PublicTemplateResponse | None = None
    if template is not None:
        template_payload = PublicTemplateResponse.model_validate(template)
        # CSS 커스터마이징을 템플릿 변수 위에 병합
        if css_overrides:
            template_payload.css_variables = {
                **template_payload.css_variables,
                **css_overrides,
            }

    return PublicSiteResponse(
        tenant=PublicTenantResponse.model_validate(tenant),
        sections=[PublicSectionResponse.model_validate(s) for s in sections],
        seo_settings=PublicSeoResponse.model_validate(seo) if seo else None,
        sns_settings=PublicSnsResponse.model_validate(sns) if sns else None,
        template=template_payload,
    )


@router.get("/site/{tenant_slug}", response_model=ApiResponse[PublicSiteResponse])
async def get_site(
    tenant_slug: str,
    db: AsyncSession = Depends(get_db),
):
    redis = await get_redis()
    cache_key = _site_cache_key(tenant_slug)

    cached = await redis.get(cache_key)
    if cached:
        return ApiResponse.ok(json.loads(cached))

    await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    tenant = await _get_tenant(db, tenant_slug)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    if not tenant.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")

    data = await _build_site_data(db, tenant)
    serialized = json.dumps(data.model_dump(mode="json"), default=str)
    await redis.setex(cache_key, _CACHE_TTL, serialized)

    return ApiResponse.ok(data)


@router.get(
    "/site/{tenant_slug}/sections",
    response_model=ApiResponse[list[PublicSectionResponse]],
)
async def get_site_sections(
    tenant_slug: str,
    db: AsyncSession = Depends(get_db),
):
    await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    tenant = await _get_tenant(db, tenant_slug)
    if not tenant or not tenant.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")

    await db.execute(
        text("SELECT set_config('app.current_tenant_id', :tid, true)"),
        {"tid": str(tenant.id)},
    )
    result = await db.execute(
        select(Section)
        .where(Section.deleted_at.is_(None))
        .order_by(Section.display_order)
        .options(selectinload(Section.settings))
    )
    sections = list(result.scalars().all())
    return ApiResponse.ok([PublicSectionResponse.model_validate(s) for s in sections])
