import hashlib

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db
from app.core.redis import get_redis
from app.core.security import decode_token
from app.schemas.auth import LoginRequest, LoginResponse, RefreshResponse, UserResponse
from app.schemas.common import ApiResponse
from app.services.auth import authenticate_user, get_user_by_id, issue_tokens, update_last_login

limiter = Limiter(key_func=get_remote_address)

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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED")

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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED")

    # 블랙리스트 확인
    redis = await get_redis()
    if await redis.get(f"blacklist:{_token_hash(refresh_token)}"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED")

    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED")

    from uuid import UUID
    from app.db.session import AsyncSessionLocal
    from sqlalchemy import text

    async with AsyncSessionLocal() as db:
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        user = await get_user_by_id(db, UUID(payload["sub"]))

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED")

    new_access, new_refresh = issue_tokens(user)
    # refresh token rotation
    _set_refresh_cookie(response, new_refresh)
    # 구 refresh token 블랙리스트 등록
    await redis.setex(f"blacklist:{_token_hash(refresh_token)}", _COOKIE_MAX_AGE, "1")

    return ApiResponse.ok(RefreshResponse(access_token=new_access))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=_REFRESH_COOKIE),
):
    if refresh_token:
        redis = await get_redis()
        await redis.setex(f"blacklist:{_token_hash(refresh_token)}", _COOKIE_MAX_AGE, "1")
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
            from sqlalchemy import text

            async with AsyncSessionLocal() as db:
                await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
                user = await get_user_by_id(db, UUID(payload["sub"]))
            if user:
                return ApiResponse.ok(UserResponse.model_validate(user))
        except ValueError:
            pass

    # 2) Bearer 없음 → refresh cookie 로 시도
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED")

    redis = await get_redis()
    if await redis.get(f"blacklist:{_token_hash(refresh_token)}"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED")

    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED")

    from uuid import UUID
    from app.db.session import AsyncSessionLocal
    from sqlalchemy import text

    async with AsyncSessionLocal() as db:
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        user = await get_user_by_id(db, UUID(payload["sub"]))

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED")

    return ApiResponse.ok(UserResponse.model_validate(user))
