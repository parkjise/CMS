from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls, get_tenant_id
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.sns import (
    NotificationSettingsResponse,
    NotificationSettingsUpdate,
    NotificationTestResponse,
)
from app.services import notification_settings as svc

router = APIRouter(prefix="/notification-settings", tags=["notification-settings"])


@router.get("", response_model=ApiResponse[NotificationSettingsResponse])
async def get_settings(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    setting = await svc.get_or_create_settings(db, tenant_id)
    return ApiResponse.ok(NotificationSettingsResponse.model_validate(setting))


@router.put("", response_model=ApiResponse[NotificationSettingsResponse])
async def update_settings(
    body: NotificationSettingsUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    setting = await svc.update_settings(db, tenant_id, body)
    return ApiResponse.ok(NotificationSettingsResponse.model_validate(setting))


@router.post("/test", response_model=ApiResponse[NotificationTestResponse])
async def send_test(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    sent, channels, message = await svc.prepare_test(db, tenant_id)
    return ApiResponse.ok(
        NotificationTestResponse(sent=sent, channels=channels, message=message)
    )
