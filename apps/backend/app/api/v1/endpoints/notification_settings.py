from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls, get_tenant_id
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.site_member import (
    PhoneSendResponse,
    PhoneVerifyRequest,
    PhoneVerifyResponse,
)
from app.schemas.sns import (
    AlertPhoneSendRequest,
    NotificationSettingsResponse,
    NotificationSettingsUpdate,
    NotificationTestResponse,
)
from app.services import member_verification
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


@router.post("/phone/send-code", response_model=ApiResponse[PhoneSendResponse])
async def send_phone_code(
    body: AlertPhoneSendRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """알림 받을 번호 인증번호 문자 (T-204, AD-03) — 3분 · 하루 5회 · 60초 간격."""
    verification, resend_after = await svc.send_phone_code(db, tenant_id, body.phone)
    return ApiResponse.ok(
        PhoneSendResponse(
            verification_id=verification.id,
            expires_at=verification.expires_at,
            resend_after_seconds=resend_after,
            debug_code=(
                verification.code if member_verification.debug_code_enabled() else None
            ),
        )
    )


@router.post("/phone/verify", response_model=ApiResponse[PhoneVerifyResponse])
async def verify_phone_code(
    body: PhoneVerifyRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """인증번호 확인 — 받은 id 를 설정 저장(phone_verification_id)에 함께 보낸다."""
    verification = await svc.verify_phone_code(
        db, tenant_id, body.verification_id, body.code
    )
    return ApiResponse.ok(
        PhoneVerifyResponse(verification_id=verification.id, verified=True)
    )


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
