from typing import cast
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_totp_secret,
    totp_provisioning_uri,
    verify_password,
    verify_totp,
)
from app.db.session import affected_rows, set_super_admin_context
from app.models.billing import Subscription
from app.models.tenant import Tenant
from app.models.user import User


async def _bypass_rls(db: AsyncSession) -> None:
    """로그인 흐름: 테넌트 컨텍스트 없이 조회하기 위해 슈퍼어드민 모드로 RLS 우회"""
    await set_super_admin_context(db)


async def _stopped_by_subscription(db: AsyncSession, tenant_id: UUID) -> bool:
    status = (
        await db.execute(
            select(Subscription.status).where(Subscription.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    return status in ("SUSPENDED", "CANCELLED")


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
            Tenant.deleted_at.is_(None),
        )
    )
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise ValueError("UNAUTHORIZED")
    # 구독 때문에 멈춘 사업체도 재구독하러 들어온다 (T-134, require_tenant_active)
    if not tenant.is_active and not await _stopped_by_subscription(db, tenant.id):
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


async def authenticate_super_admin(
    db: AsyncSession,
    email: str,
    password: str,
) -> User:
    """슈퍼 어드민 로그인. 테넌트 없이 email + SUPER_ADMIN 역할로 인증한다."""
    await _bypass_rls(db)

    user_result = await db.execute(
        select(User).where(
            User.email == email,
            User.role == "SUPER_ADMIN",
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )
    )
    user = user_result.scalar_one_or_none()
    if not user or not verify_password(password, user.password_hash):
        raise ValueError("UNAUTHORIZED")

    return user


async def setup_totp(db: AsyncSession, user: User) -> tuple[str, str]:
    """TOTP secret 발급(미확정 저장). (secret, otpauth_uri) 반환.

    이미 켠 계정은 거부 — 세션만 훔쳐 인증 앱을 바꿀 수 없게 (T-136).
    """
    await _bypass_rls(db)
    if user.totp_enabled:
        raise ValueError("2FA_ALREADY_ENABLED")
    # 확정 전에는 같은 secret — 새로고침 · 동시 요청에도 앱에 찍은 QR 이 유효하다.
    # 읽고 쓰기를 나누면 동시 요청이 서로 덮어쓰므로 한 문장으로 (T-136)
    result = await db.execute(
        update(User)
        .where(User.id == user.id)
        .values(totp_secret=func.coalesce(User.totp_secret, generate_totp_secret()))
        .returning(User.totp_secret)
    )
    # coalesce 라 NULL 일 수 없다
    secret = cast(str, result.scalar_one())
    await db.commit()
    return secret, totp_provisioning_uri(secret, user.email)


async def confirm_totp(db: AsyncSession, user: User, code: str) -> bool:
    """설정 코드 검증 후 2FA 활성화."""
    await _bypass_rls(db)
    fresh = await get_user_by_id(db, user.id)
    if not fresh or not fresh.totp_secret:
        raise ValueError("2FA_NOT_INITIALIZED")
    if not verify_totp(fresh.totp_secret, code):
        raise ValueError("INVALID_CODE")
    await db.execute(update(User).where(User.id == user.id).values(totp_enabled=True))
    await db.commit()
    return True


async def get_super_admin_by_id(db: AsyncSession, user_id: UUID) -> User | None:
    await _bypass_rls(db)
    user = await get_user_by_id(db, user_id)
    return user if user and user.role == "SUPER_ADMIN" else None


async def reset_totp(db: AsyncSession, email: str) -> bool:
    """인증 앱을 잃은 슈퍼 어드민 복구 — 서버 스크립트 전용 (T-136)."""
    await _bypass_rls(db)
    result = await db.execute(
        update(User)
        .where(User.email == email, User.role == "SUPER_ADMIN")
        .values(totp_enabled=False, totp_secret=None)
    )
    await db.commit()
    return affected_rows(result) > 0


async def verify_2fa_code(db: AsyncSession, user_id: UUID, code: str) -> User:
    """로그인 2FA 단계: 저장된 secret으로 코드 검증."""
    await _bypass_rls(db)
    user = await get_user_by_id(db, user_id)
    if not user or user.role != "SUPER_ADMIN":
        raise ValueError("UNAUTHORIZED")
    if not user.totp_enabled or not user.totp_secret:
        raise ValueError("2FA_NOT_ENABLED")
    if not verify_totp(user.totp_secret, code):
        raise ValueError("INVALID_CODE")
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
        update(User).where(User.id == user_id).values(last_login_at=datetime.now(UTC))
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
