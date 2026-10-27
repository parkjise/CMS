import json

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.core.redis import get_redis
from app.db.session import set_rls_context, set_super_admin_context
from app.models.section import Section
from app.models.seo import SeoSetting
from app.models.sns import SnsChannelSetting
from app.models.template import Template, TenantTemplateOverride
from app.models.tenant import Tenant
from app.schemas.common import ApiResponse
from app.schemas.public_site import (
    PublicMemberFlags,
    PublicSectionResponse,
    PublicSeoResponse,
    PublicSiteResponse,
    PublicSnsResponse,
    PublicTemplateResponse,
    PublicTenantResponse,
)
from app.services import member_features

router = APIRouter(tags=["public"])

_CACHE_TTL = 600  # 10분


def _site_cache_key(tenant_slug: str) -> str:
    return f"site:{tenant_slug}"


async def _get_tenant(db: AsyncSession, tenant_slug: str) -> Tenant | None:
    result = await db.execute(
        select(Tenant).where(Tenant.slug == tenant_slug, Tenant.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def _resolve_template(
    db: AsyncSession, tenant: Tenant
) -> tuple[Template | None, dict]:
    """적용된 템플릿(override) 우선, 없으면 업종 기본(테마형). RLS 는 호출 쪽에서."""
    # 적용된 템플릿(override)을 우선 사용하고, 없으면 업종 기본 템플릿으로 폴백
    override = (
        await db.execute(
            select(TenantTemplateOverride).where(
                TenantTemplateOverride.tenant_id == tenant.id
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
                    # 코드형 템플릿은 업종 기본값으로 고르지 않음 (직접 적용만)
                    Template.renderer == "theme",
                )
                .limit(1)
            )
        ).scalar_one_or_none()

    return template, css_overrides


async def _build_site_data(db: AsyncSession, tenant: Tenant) -> PublicSiteResponse:
    tid = tenant.id

    await set_rls_context(db, tid)

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

    template, css_overrides = await _resolve_template(db, tenant)

    template_payload: PublicTemplateResponse | None = None
    if template is not None:
        template_payload = PublicTemplateResponse.model_validate(template)
        # CSS 커스터마이징을 템플릿 변수 위에 병합
        if css_overrides:
            template_payload.css_variables = {
                **template_payload.css_variables,
                **css_overrides,
            }

    flags = await member_features.flags_for(db, tenant)
    return PublicSiteResponse(
        tenant=PublicTenantResponse.model_validate(tenant),
        sections=[PublicSectionResponse.model_validate(s) for s in sections],
        seo_settings=PublicSeoResponse.model_validate(seo) if seo else None,
        sns_settings=PublicSnsResponse.model_validate(sns) if sns else None,
        template=template_payload,
        member=PublicMemberFlags(
            enabled=flags.enabled,
            reservations=flags.reservations,
            social_login=flags.social_login,
        ),
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

    await set_super_admin_context(db)
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
    await set_super_admin_context(db)
    tenant = await _get_tenant(db, tenant_slug)
    if not tenant or not tenant.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")

    await set_rls_context(db, tenant.id)
    result = await db.execute(
        select(Section)
        .where(Section.deleted_at.is_(None))
        .order_by(Section.display_order)
        .options(selectinload(Section.settings))
    )
    sections = list(result.scalars().all())
    return ApiResponse.ok([PublicSectionResponse.model_validate(s) for s in sections])


class PublicTemplateRef(BaseModel):
    """미들웨어용 — 템플릿 코드 (기획서 11.11 #26) + 회원 기능 (T-115)."""

    code: str | None
    renderer: str
    # 회원 기능(SITE_MEMBER) — 꺼져 있으면 미들웨어가 /{slug}/member/* 를 404 로
    member_enabled: bool = False


@router.get(
    "/site/{tenant_slug}/template", response_model=ApiResponse[PublicTemplateRef]
)
async def get_site_template(
    tenant_slug: str,
    db: AsyncSession = Depends(get_db),
):
    """홈페이지 미들웨어가 템플릿별 라우트로 나눌 때 쓰는 가벼운 조회.

    사이트 캐시가 있으면 그 값을, 없으면 템플릿만 계산한다 (섹션은 읽지 않음).
    """
    redis = await get_redis()
    cached = await redis.get(_site_cache_key(tenant_slug))
    if cached:
        data = json.loads(cached)
        template = data.get("template") or {}
        return ApiResponse.ok(
            PublicTemplateRef(
                code=template.get("code"),
                renderer=template.get("renderer", "theme"),
                member_enabled=bool((data.get("member") or {}).get("enabled")),
            )
        )

    await set_super_admin_context(db)
    tenant = await _get_tenant(db, tenant_slug)
    if not tenant or not tenant.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    template, _ = await _resolve_template(db, tenant)
    flags = await member_features.flags_for(db, tenant)
    return ApiResponse.ok(
        PublicTemplateRef(
            member_enabled=flags.enabled,
            code=template.code if template else None,
            renderer=template.renderer if template else "theme",
        )
    )
