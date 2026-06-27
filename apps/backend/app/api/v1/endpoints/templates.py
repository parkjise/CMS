import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, get_db_with_rls
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.public_site import PublicSiteResponse
from app.schemas.template import (
    TemplateApplyRequest,
    TemplateCssOverrideUpdate,
    TemplateListItem,
    TemplateListResponse,
    TemplateResponse,
    TenantTemplateOverrideResponse,
)
from app.services import template as template_service

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=ApiResponse[TemplateListResponse])
async def list_templates(
    industry: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    items, current_id = await template_service.list_templates(
        db, current_user.tenant_id, industry
    )
    templates = [
        TemplateListItem(
            **TemplateResponse.model_validate(t).model_dump(),
            locked=locked,
        )
        for t, locked in items
    ]
    return ApiResponse.ok(
        TemplateListResponse(templates=templates, current_template_id=current_id)
    )


@router.post("/apply", response_model=ApiResponse[TenantTemplateOverrideResponse])
async def apply_template(
    body: TemplateApplyRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    override = await template_service.apply_template(
        db, current_user.tenant_id, body.template_id, current_user.id
    )
    return ApiResponse.ok(TenantTemplateOverrideResponse.model_validate(override))


@router.post("/rollback", response_model=ApiResponse[TenantTemplateOverrideResponse])
async def rollback_template(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    override = await template_service.rollback_template(db, current_user.tenant_id)
    return ApiResponse.ok(TenantTemplateOverrideResponse.model_validate(override))


@router.patch("/customize", response_model=ApiResponse[TenantTemplateOverrideResponse])
async def customize_template(
    body: TemplateCssOverrideUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    override = await template_service.customize_template(
        db, current_user.tenant_id, body.css_overrides, current_user.id
    )
    return ApiResponse.ok(TenantTemplateOverrideResponse.model_validate(override))


# ── 공개 미리보기 (인증 불필요, /api/public 에 마운트) ──
public_router = APIRouter(tags=["public"])


@public_router.get(
    "/preview/{tenant_slug}", response_model=ApiResponse[PublicSiteResponse]
)
async def preview_template(
    tenant_slug: str,
    tpl: uuid.UUID = Query(..., description="미리볼 템플릿 ID"),
    db: AsyncSession = Depends(get_db),
):
    data = await template_service.build_preview(db, tenant_slug, tpl)
    return ApiResponse.ok(data)
