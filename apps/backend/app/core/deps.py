from collections.abc import AsyncGenerator
from uuid import UUID

from fastapi import Cookie, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import AsyncSessionLocal, set_rls_context

bearer = HTTPBearer(auto_error=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


def _extract_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> str:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED")
    return credentials.credentials


def get_current_user_payload(token: str = Depends(_extract_token)) -> dict:
    try:
        return decode_token(token)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED")


async def get_db_with_rls(
    payload: dict = Depends(get_current_user_payload),
) -> AsyncGenerator[AsyncSession, None]:
    tenant_id = UUID(payload["tenant_id"])
    is_super_admin: bool = payload.get("is_super_admin", False)

    async with AsyncSessionLocal() as session:
        await set_rls_context(session, tenant_id, is_super_admin)
        yield session


async def get_current_user(
    payload: dict = Depends(get_current_user_payload),
) -> dict:
    return payload


async def get_super_admin(
    payload: dict = Depends(get_current_user_payload),
) -> dict:
    if not payload.get("is_super_admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="FORBIDDEN")
    return payload
