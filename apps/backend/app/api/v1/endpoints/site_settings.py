from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls, get_tenant_id
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.site import (
    MenuResponse,
    MenuUpdate,
    SiteSettingsResponse,
    SiteSettingsUpdate,
)
from app.services import site_settings as site_settings_service

# 사업체 공통 정보 (T-036-A, 기획서 AD-02-A 공통 설정)
router = APIRouter(prefix="/site-settings", tags=["site-settings"])


@router.get("", response_model=ApiResponse[SiteSettingsResponse | None])
async def get_site_settings(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    setting = await site_settings_service.get_site_settings(db)
    return ApiResponse.ok(
        SiteSettingsResponse.model_validate(setting) if setting else None
    )


@router.put("", response_model=ApiResponse[SiteSettingsResponse])
async def update_site_settings(
    body: SiteSettingsUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    setting = await site_settings_service.update_site_settings(db, tenant_id, body)
    return ApiResponse.ok(SiteSettingsResponse.model_validate(setting))


# ── 상단 메뉴 (T-036-B) ────────────────────────────────────────────────


@router.get("/menu", response_model=ApiResponse[MenuResponse])
async def get_menu(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return ApiResponse.ok(await site_settings_service.get_menu(db, tenant_id))


@router.put("/menu", response_model=ApiResponse[MenuResponse])
async def update_menu(
    body: MenuUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    try:
        menu = await site_settings_service.update_menu(db, tenant_id, body)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return ApiResponse.ok(menu)
