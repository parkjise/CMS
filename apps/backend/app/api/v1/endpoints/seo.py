from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import (
    get_current_user,
    get_db,
    get_db_with_rls,
    get_tenant_id,
    require_feature,
)
from app.db.session import set_super_admin_context
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.seo import (
    AeoResponse,
    AeoUpdate,
    GeoResponse,
    GeoSettings,
    SeoLimitsResponse,
    SeoSettingsResponse,
    SeoSettingsUpdate,
)
from app.services import seo as seo_service

router = APIRouter(prefix="/seo-settings", tags=["seo"])
public_router = APIRouter(tags=["public"])


@router.get("", response_model=ApiResponse[SeoSettingsResponse | None])
async def get_seo_settings(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    setting = await seo_service.get_seo_settings(db)
    return ApiResponse.ok(
        SeoSettingsResponse.model_validate(setting) if setting else None
    )


@router.get("/limits", response_model=ApiResponse[SeoLimitsResponse])
async def get_seo_limits(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return ApiResponse.ok(await seo_service.get_limits(db, tenant_id))


@router.put(
    "",
    response_model=ApiResponse[SeoSettingsResponse],
    dependencies=[Depends(require_feature("SEO_WIZARD"))],
)
async def update_seo_settings(
    body: SeoSettingsUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    try:
        setting = await seo_service.update_seo_settings(db, tenant_id, body)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return ApiResponse.ok(SeoSettingsResponse.model_validate(setting))


@router.get("/aeo", response_model=ApiResponse[AeoResponse])
async def get_aeo(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    """FAQ 게시판 글과 구조화 데이터 연결 (T-221, 사이트 관리 SM-05)"""
    return ApiResponse.ok(await seo_service.get_aeo(db))


@router.put(
    "/aeo",
    response_model=ApiResponse[AeoResponse],
    dependencies=[Depends(require_feature("SEO_WIZARD"))],
)
async def update_aeo(
    body: AeoUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return ApiResponse.ok(await seo_service.update_aeo(db, tenant_id, body))


@router.get("/geo", response_model=ApiResponse[GeoResponse])
async def get_geo(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    """기업 정보 · 출처 · AI 크롤러 정책 (T-221, 사이트 관리 SM-06)"""
    return ApiResponse.ok(await seo_service.get_geo(db))


@router.put(
    "/geo",
    response_model=ApiResponse[GeoResponse],
    dependencies=[Depends(require_feature("SEO_WIZARD"))],
)
async def update_geo(
    body: GeoSettings,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return ApiResponse.ok(await seo_service.update_geo(db, tenant_id, body))


@public_router.get("/sitemap/{tenant_slug}.xml", response_class=RedirectResponse)
async def get_sitemap(
    tenant_slug: str,
    db: AsyncSession = Depends(get_db),
):
    """예전 사이트맵 주소 — 홈페이지 사이트맵으로 넘긴다 (T-225)

    이미 등록한 곳도 맞는 결과를 받게 주소는 남겨 둔다.
    """
    await set_super_admin_context(db)
    url = await seo_service.sitemap_url(db, tenant_slug)
    if not url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    return RedirectResponse(url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
