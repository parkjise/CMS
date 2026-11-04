from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.client_info import rate_limit_key
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
    TotpEnrollRequest,
    TotpSetupResponse,
    UserResponse,
    Verify2faRequest,
)
from app.schemas.common import ApiResponse
from app.services import auth as auth_service

limiter = Limiter(key_func=rate_limit_key)

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


def _challenge_user_id(challenge_token: str) -> UUID:
    try:
        payload = decode_token(challenge_token)
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
    return UUID(payload["sub"])


@router.post("/login", response_model=ApiResponse[SuperLoginResponse])
@limiter.limit(lambda: settings.login_rate_limit)
async def super_login(
    request: Request,
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

    if settings.super_admin_require_2fa:
        # 2FA 필수인데 미등록 — 비밀번호만으로는 토큰을 주지 않는다 (기획서 14.8)
        return ApiResponse.ok(
            SuperLoginResponse(
                requires_2fa=False,
                requires_2fa_setup=True,
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
@limiter.limit(lambda: settings.login_rate_limit)
async def verify_2fa(
    request: Request,
    body: Verify2faRequest,
    db: AsyncSession = Depends(get_db),
):
    """challenge_token + TOTP 코드 검증 후 액세스 토큰 발급."""
    user_id = _challenge_user_id(body.challenge_token)
    try:
        user = await auth_service.verify_2fa_code(db, user_id, body.code)
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


def _totp_conflict() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT, detail="이미 2FA 를 사용 중입니다."
    )


def _invalid_code() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="인증 코드가 올바르지 않습니다.",
    )


@router.post("/2fa/setup", response_model=ApiResponse[TotpSetupResponse])
async def setup_2fa(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_super_admin),
):
    """TOTP secret 발급 + otpauth URI 반환 (QR용). 아직 활성화 아님."""
    try:
        secret, uri = await auth_service.setup_totp(db, current_user)
    except ValueError as exc:
        raise _totp_conflict() from exc
    await log_action(db, current_user, "TOTP_SETUP", "user", current_user.id)
    await db.commit()
    return ApiResponse.ok(TotpSetupResponse(secret=secret, otpauth_uri=uri))


@router.post("/2fa/confirm", response_model=ApiResponse[dict])
@limiter.limit(lambda: settings.login_rate_limit)
async def confirm_2fa(
    request: Request,
    body: TotpConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_super_admin),
):
    """설정 코드 검증 후 2FA 활성화."""
    try:
        await auth_service.confirm_totp(db, current_user, body.code)
    except ValueError as exc:
        raise _invalid_code() from exc
    await log_action(db, current_user, "TOTP_ENABLED", "user", current_user.id)
    await db.commit()
    return ApiResponse.ok({"enabled": True})


async def _challenge_user(db: AsyncSession, challenge_token: str) -> User:
    """비밀번호를 통과하고 2FA 미등록인 계정 — 켠 계정은 앱을 바꿀 수 없다."""
    user = await auth_service.get_super_admin_by_id(
        db, _challenge_user_id(challenge_token)
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 인증 세션입니다.",
        )
    if user.totp_enabled:
        raise _totp_conflict()
    return user


@router.post("/2fa/enroll", response_model=ApiResponse[TotpSetupResponse])
@limiter.limit(lambda: settings.login_rate_limit)
async def enroll_2fa(
    request: Request,
    body: TotpEnrollRequest,
    db: AsyncSession = Depends(get_db),
):
    """2FA 필수 첫 로그인 — challenge_token 으로 인증 앱 등록 시작 (T-136)."""
    user = await _challenge_user(db, body.challenge_token)
    secret, uri = await auth_service.setup_totp(db, user)
    await log_action(db, user, "TOTP_SETUP", "user", user.id)
    await db.commit()
    return ApiResponse.ok(TotpSetupResponse(secret=secret, otpauth_uri=uri))


@router.post("/2fa/enroll/confirm", response_model=ApiResponse[LoginResponse])
@limiter.limit(lambda: settings.login_rate_limit)
async def confirm_enroll_2fa(
    request: Request,
    body: Verify2faRequest,
    db: AsyncSession = Depends(get_db),
):
    """등록 확인 — 맞는 코드를 넣어야 켜지고 그때 로그인된다 (T-136)."""
    user = await _challenge_user(db, body.challenge_token)
    try:
        await auth_service.confirm_totp(db, user, body.code)
    except ValueError as exc:
        raise _invalid_code() from exc
    await log_action(db, user, "TOTP_ENABLED", "user", user.id)
    await db.commit()
    await auth_service.update_last_login(db, user.id)
    return ApiResponse.ok(
        LoginResponse(
            user=UserResponse.model_validate(user),
            access_token=_issue_token(user),
        )
    )


@router.get("/me", response_model=ApiResponse[UserResponse])
async def super_me(
    current_user: User = Depends(get_super_admin),
):
    return ApiResponse.ok(UserResponse.model_validate(current_user))
