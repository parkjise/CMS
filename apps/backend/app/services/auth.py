from uuid import UUID

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.tenant import Tenant
from app.models.user import User


async def _bypass_rls(db: AsyncSession) -> None:
    """로그인 흐름: 테넌트 컨텍스트 없이 조회하기 위해 슈퍼어드민 모드로 RLS 우회"""
    await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))


async def authenticate_user(
    db: AsyncSession,
    email: str,
    password: str,
    tenant_slug: str,
) -> User:
    await _bypass_rls(db)

    tenant_result = await db.execute(
        select(Tenant).where(
            Tenant.slug == tenant_slug,
            Tenant.is_active.is_(True),
            Tenant.deleted_at.is_(None),
        )
    )
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise ValueError("UNAUTHORIZED")

    user_result = await db.execute(
        select(User).where(
            User.email == email,
            User.tenant_id == tenant.id,
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )
    )
    user = user_result.scalar_one_or_none()
    if not user or not verify_password(password, user.password_hash):
        raise ValueError("UNAUTHORIZED")

    return user


async def get_user_by_id(db: AsyncSession, user_id: UUID) -> User | None:
    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def update_last_login(db: AsyncSession, user_id: UUID) -> None:
    from datetime import UTC, datetime

    await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(last_login_at=datetime.now(UTC))
    )
    await db.commit()


def issue_tokens(user: User) -> tuple[str, str]:
    """(access_token, refresh_token) 반환"""
    access_token = create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        is_super_admin=(user.role == "SUPER_ADMIN"),
    )
    refresh_token = create_refresh_token(user_id=user.id)
    return access_token, refresh_token


def verify_token(token: str) -> dict:
    return decode_token(token)
