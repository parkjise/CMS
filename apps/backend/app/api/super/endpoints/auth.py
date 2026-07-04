from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db, get_super_admin
from app.core.security import (
    create_2fa_challenge_token,
    create_access_token,
    decode_token,
)
from app.models.user import User
from app.schemas.auth import (
    LoginResponse,
    SuperLoginRequest,
    SuperLoginResponse,
    TotpConfirmRequest,
    TotpSetupResponse,
    UserResponse,
    Verify2faRequest,
)
from app.schemas.common import ApiResponse
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["super-auth"])

_EXPIRE = settings.super_admin_token_expire_minutes


def _issue_token(user: User) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=None,
        role=user.role,
        is_super_admin=True,
        expires_minutes=_EXPIRE,
    )


@router.post("/login", response_model=ApiResponse[SuperLoginResponse])
async def super_login(
    body: SuperLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """슈퍼 어드민 로그인. 2FA 활성 계정은 challenge_token만 반환한다."""
    try:
        user = await auth_service.authenticate_super_admin(
            db, body.email, body.password
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
        ) from exc

    if user.totp_enabled:
        # 2FA 필요 — 액세스 토큰 미발급
        return ApiResponse.ok(
            SuperLoginResponse(
                requires_2fa=True,
                challenge_token=create_2fa_challenge_token(user.id),
            )
        )

    await auth_service.update_last_login(db, user.id)
    return ApiResponse.ok(
        SuperLoginResponse(
            requires_2fa=False,
            user=UserResponse.model_validate(user),
            access_token=_issue_token(user),
        )
    )


@router.post("/verify-2fa", response_model=ApiResponse[LoginResponse])
async def verify_2fa(
    body: Verify2faRequest,
    db: AsyncSession = Depends(get_db),
):
    """challenge_token + TOTP 코드 검증 후 액세스 토큰 발급."""
    try:
        payload = decode_token(body.challenge_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 인증 세션입니다.",
        ) from exc

    if not payload.get("pending_2fa"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 인증 세션입니다.",
        )

    from uuid import UUID

    try:
        user = await auth_service.verify_2fa_code(db, UUID(payload["sub"]), body.code)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증 코드가 올바르지 않습니다.",
        ) from exc

    await auth_service.update_last_login(db, user.id)
    return ApiResponse.ok(
        LoginResponse(
            user=UserResponse.model_validate(user),
            access_token=_issue_token(user),
        )
    )


@router.post("/2fa/setup", response_model=ApiResponse[TotpSetupResponse])
async def setup_2fa(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_super_admin),
):
    """TOTP secret 발급 + otpauth URI 반환 (QR용). 아직 활성화 아님."""
    secret, uri = await auth_service.setup_totp(db, current_user)
    return ApiResponse.ok(TotpSetupResponse(secret=secret, otpauth_uri=uri))


@router.post("/2fa/confirm", response_model=ApiResponse[dict])
async def confirm_2fa(
    body: TotpConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_super_admin),
):
    """설정 코드 검증 후 2FA 활성화."""
    try:
        await auth_service.confirm_totp(db, current_user, body.code)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="인증 코드가 올바르지 않습니다.",
        ) from exc
    return ApiResponse.ok({"enabled": True})


@router.get("/me", response_model=ApiResponse[UserResponse])
async def super_me(
    current_user: User = Depends(get_super_admin),
):
    return ApiResponse.ok(UserResponse.model_validate(current_user))
