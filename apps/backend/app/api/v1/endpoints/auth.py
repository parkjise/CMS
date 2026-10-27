import hashlib
import time

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db
from app.core.redis import get_redis
from app.core.security import decode_token
from app.db.session import set_super_admin_context
from app.schemas.auth import LoginRequest, LoginResponse, RefreshResponse, UserResponse
from app.schemas.common import ApiResponse
from app.services.auth import (
    authenticate_user,
    get_user_by_id,
    issue_tokens,
    update_last_login,
)

limiter = Limiter(key_func=get_remote_address)

LOGIN_FAILED = "이메일 또는 비밀번호가 올바르지 않습니다"

router = APIRouter(prefix="/auth", tags=["auth"])

_REFRESH_COOKIE = "refresh_token"
_COOKIE_MAX_AGE = 60 * 60 * 24 * 7  # 7일


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=(settings.app_env != "development"),
        samesite="lax",
        domain=settings.cookie_domain_value,
        max_age=_COOKIE_MAX_AGE,
    )


def _delete_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=_REFRESH_COOKIE,
        httponly=True,
        domain=settings.cookie_domain_value,
    )


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# 갱신(rotation)으로 바뀐 옛 refresh token 을 잠시 더 받아 주는 시간 (초)
# — 갱신 응답이 도착하기 전에 페이지를 이동하면 브라우저는 새 쿠키를 못 받고
#   옛 쿠키를 그대로 쓴다. 유예가 없으면 다음 갱신이 401 → 로그아웃
#   (T-082-A, CI E2E 에서 발견)
ROTATION_GRACE_SECONDS = 30
_ROTATED_PREFIX = "rotated:"
_REVOKED = "1"  # 로그아웃 — 유예 없음


def _blacklist_key(token: str) -> str:
    return f"blacklist:{_token_hash(token)}"


async def _mark_rotated(redis, token: str) -> None:
    await redis.setex(
        _blacklist_key(token), _COOKIE_MAX_AGE, f"{_ROTATED_PREFIX}{int(time.time())}"
    )


async def _is_revoked(redis, token: str) -> bool:
    """로그아웃된 토큰, 또는 갱신된 지 유예 시간이 지난 토큰이면 True."""
    value = await redis.get(_blacklist_key(token))
    if not value:
        return False
    if isinstance(value, bytes):
        value = value.decode()
    if value.startswith(_ROTATED_PREFIX):
        rotated_at = int(value[len(_ROTATED_PREFIX) :])
        return time.time() - rotated_at > ROTATION_GRACE_SECONDS
    return True


@router.post("/login", response_model=ApiResponse[LoginResponse])
@limiter.limit("10/minute")
async def login(
    request: Request,
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    try:
        user = await authenticate_user(db, body.email, body.password, body.tenant_slug)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": LOGIN_FAILED},
        )

    access_token, refresh_token = issue_tokens(user)
    _set_refresh_cookie(response, refresh_token)
    await update_last_login(db, user.id)

    return ApiResponse.ok(
        LoginResponse(
            user=UserResponse.model_validate(user),
            access_token=access_token,
        )
    )


@router.post("/refresh", response_model=ApiResponse[RefreshResponse])
async def refresh(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=_REFRESH_COOKIE),
):
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED"
        )

    # 블랙리스트 확인 (갱신 직후 유예 시간 안이면 통과)
    redis = await get_redis()
    if await _is_revoked(redis, refresh_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED"
        )

    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED"
        )

    from uuid import UUID

    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        await set_super_admin_context(db)
        user = await get_user_by_id(db, UUID(payload["sub"]))

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED"
        )

    new_access, new_refresh = issue_tokens(user)
    # refresh token rotation
    _set_refresh_cookie(response, new_refresh)
    # 구 refresh token 블랙리스트 등록 — 유예 시간 동안은 한 번 더 받아 준다
    await _mark_rotated(redis, refresh_token)

    return ApiResponse.ok(RefreshResponse(access_token=new_access))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=_REFRESH_COOKIE),
):
    if refresh_token:
        redis = await get_redis()
        await redis.setex(_blacklist_key(refresh_token), _COOKIE_MAX_AGE, _REVOKED)
    _delete_refresh_cookie(response)


@router.get("/me", response_model=ApiResponse[UserResponse])
async def me(
    request: Request,
    refresh_token: str | None = Cookie(default=None, alias=_REFRESH_COOKIE),
):
    """Bearer 토큰 우선, 없으면 refresh cookie로 자동 인증 (페이지 로드 initialize용)"""
    from app.core.security import decode_token as _decode

    # 1) Authorization 헤더 Bearer 토큰 시도
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        bearer = auth_header[7:]
        try:
            payload = _decode(bearer)
            from uuid import UUID

            from app.db.session import AsyncSessionLocal

            async with AsyncSessionLocal() as db:
                await set_super_admin_context(db)
                user = await get_user_by_id(db, UUID(payload["sub"]))
            if user:
                return ApiResponse.ok(UserResponse.model_validate(user))
        except ValueError:
            pass

    # 2) Bearer 없음 → refresh cookie 로 시도
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED"
        )

    redis = await get_redis()
    if await _is_revoked(redis, refresh_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED"
        )

    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED"
        )

    from uuid import UUID

    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        await set_super_admin_context(db)
        user = await get_user_by_id(db, UUID(payload["sub"]))

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED"
        )

    return ApiResponse.ok(UserResponse.model_validate(user))
