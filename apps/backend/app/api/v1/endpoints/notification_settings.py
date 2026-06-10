from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls
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
):
    setting = await svc.get_or_create_settings(db, current_user.tenant_id)
    return ApiResponse.ok(NotificationSettingsResponse.model_validate(setting))


@router.put("", response_model=ApiResponse[NotificationSettingsResponse])
async def update_settings(
    body: NotificationSettingsUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    setting = await svc.update_settings(db, current_user.tenant_id, body)
    return ApiResponse.ok(NotificationSettingsResponse.model_validate(setting))


@router.post("/test", response_model=ApiResponse[NotificationTestResponse])
async def send_test(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    sent, channels, message = await svc.prepare_test(db, current_user.tenant_id)
    return ApiResponse.ok(
        NotificationTestResponse(sent=sent, channels=channels, message=message)
    )
