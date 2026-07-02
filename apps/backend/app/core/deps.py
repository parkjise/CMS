from collections.abc import AsyncGenerator
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import AsyncSessionLocal, set_rls_context
from app.models.user import User

bearer = HTTPBearer(auto_error=False)

# SUPER_ADMIN은 tenant_id가 없으므로 RLS 우회용 플레이스홀더 사용
_ZERO_UUID = UUID("00000000-0000-0000-0000-000000000000")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


def _extract_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> str:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED"
        )
    return credentials.credentials


def get_current_user_payload(token: str = Depends(_extract_token)) -> dict:
    try:
        return decode_token(token)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED"
        )


async def get_db_with_rls(
    payload: dict = Depends(get_current_user_payload),
) -> AsyncGenerator[AsyncSession, None]:
    is_super_admin: bool = payload.get("is_super_admin", False)
    tenant_id_str: str | None = payload.get("tenant_id")
    tenant_id = UUID(tenant_id_str) if tenant_id_str else _ZERO_UUID

    async with AsyncSessionLocal() as session:
        await set_rls_context(session, tenant_id, is_super_admin)
        yield session


async def get_current_user(
    payload: dict = Depends(get_current_user_payload),
) -> User:
    """JWT payload → DB에서 User 객체 조회 (계정 활성 여부 재확인)"""
    from app.services.auth import get_user_by_id

    user_id = UUID(payload["sub"])

    async with AsyncSessionLocal() as db:
        # 인증 흐름이므로 RLS 우회
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        user = await get_user_by_id(db, user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED"
        )
    return user


async def get_super_admin(
    user: User = Depends(get_current_user),
) -> User:
    if user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="FORBIDDEN")
    return user


def require_feature(feature_key: str):
    """기능 플래그가 켜진 테넌트만 접근을 허용하는 의존성 (CLAUDE.md 섹션 8.2)."""

    async def checker(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db_with_rls),
    ) -> None:
        from app.services import feature as feature_service

        enabled = await feature_service.is_enabled(
            db, current_user.tenant_id, feature_key
        )
        if not enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="이 기능은 현재 비활성화되어 있습니다.",
            )

    return checker
