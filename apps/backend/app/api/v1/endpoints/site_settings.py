from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls, get_tenant_id
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.site import SiteSettingsResponse, SiteSettingsUpdate
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
