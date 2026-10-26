from collections.abc import AsyncGenerator
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import member_errors as errors
from app.core.member_errors import MemberAuthError
from app.core.security import SITE_MEMBER_ROLE, decode_token, issued_before
from app.db.session import AsyncSessionLocal, set_rls_context
from app.models.site_member import SiteMember
from app.models.tenant import Tenant
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
        payload = decode_token(token)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED"
        )
    # 방문자 회원 토큰으로는 어드민 API 를 쓸 수 없다 (기획서 16.0)
    if payload.get("role") == SITE_MEMBER_ROLE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="FORBIDDEN")
    return payload


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


# ── 방문자 회원 (T-108, 기획서 16.0) ──────────────────────────────────────


async def get_member_tenant(tenant_slug: str) -> Tenant:
    """URL 의 tenant_slug → 운영 중인 테넌트. 없으면 404."""
    from app.services import member_auth as member_auth_service

    async with AsyncSessionLocal() as db:
        # 테넌트 식별 단계 — tenants 조회만 RLS 우회 (get_current_user 와 동일)
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        tenant = await member_auth_service.get_active_tenant(db, tenant_slug)
    if tenant is None:
        raise MemberAuthError(404, "NOT_FOUND", errors.TENANT_NOT_FOUND)
    return tenant


async def get_member_db(
    tenant: Tenant = Depends(get_member_tenant),
) -> AsyncGenerator[AsyncSession, None]:
    """방문자 API 세션 — URL 테넌트로 RLS 컨텍스트 설정."""
    async with AsyncSessionLocal() as session:
        await set_rls_context(session, tenant.id)
        yield session


async def get_current_member(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    tenant: Tenant = Depends(get_member_tenant),
    db: AsyncSession = Depends(get_member_db),
) -> SiteMember:
    """방문자 access token 검증. 어드민 토큰·다른 테넌트 토큰은 403."""
    from app.services import member_auth as member_auth_service

    if not credentials:
        raise MemberAuthError(401, "UNAUTHORIZED", errors.UNAUTHORIZED)
    try:
        payload = decode_token(credentials.credentials)
    except ValueError:
        raise MemberAuthError(401, "UNAUTHORIZED", errors.UNAUTHORIZED)
    if payload.get("role") != SITE_MEMBER_ROLE or payload.get("type"):
        raise MemberAuthError(403, "FORBIDDEN", errors.FORBIDDEN)
    if payload.get("tenant_id") != str(tenant.id):
        raise MemberAuthError(403, "FORBIDDEN", errors.FORBIDDEN)

    member = await member_auth_service.get_active_member(
        db, tenant.id, UUID(payload["sub"])
    )
    # 비밀번호 변경 전에 발급된 access token 도 거부 (T-109)
    if member is None or issued_before(payload, member.password_changed_at):
        raise MemberAuthError(401, "UNAUTHORIZED", errors.UNAUTHORIZED)
    return member
