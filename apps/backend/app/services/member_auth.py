"""T-108 방문자 회원 인증 서비스 (기획서 16.3 · 16.4 · 16.11).

- 가입: 이메일 중복 · 휴대폰 인증(REGISTER · 30분 이내 · 1회용) 확인 후 생성
- 로그인: 연속 5회 실패 → 30분 잠금, 성공 시 실패 횟수 초기화
- 토큰: access 15분 / refresh 7일 (회전 + Redis 블랙리스트)

이메일은 소문자로 저장·비교한다. 탈퇴(deleted_at) 회원의 이메일은 바로 재가입할 수
있다 (오픈 이슈 #22 — 옵션 A).
"""

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import member_errors as errors
from app.core.member_errors import MemberAuthError
from app.core.redis import get_redis
from app.core.security import (
    MEMBER_REFRESH_TYPE,
    create_member_access_token,
    create_member_refresh_token,
    decode_token,
    hash_password,
    issued_before,
    verify_password,
)
from app.models.site_member import SiteMember
from app.models.tenant import Tenant
from app.schemas.site_member import MemberRegisterRequest
from app.services import member_verification
from app.services.member_verification import normalize_phone

MAX_FAILED_LOGINS = 5
LOCK_MINUTES = 30

_BLACKLIST_PREFIX = "member_blacklist:"
# 존재하지 않는 계정도 bcrypt 비교 시간을 같게 맞추기 위한 더미 해시
_DUMMY_HASH = hash_password("dummy-password-for-timing")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _now() -> datetime:
    return datetime.now(UTC)


# ── 조회 ──────────────────────────────────────────────────────────────────


async def get_active_tenant(db: AsyncSession, tenant_slug: str) -> Tenant | None:
    result = await db.execute(
        select(Tenant).where(
            Tenant.slug == tenant_slug,
            Tenant.is_active.is_(True),
            Tenant.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def _find_by_email(
    db: AsyncSession, tenant_id: UUID, email: str
) -> SiteMember | None:
    result = await db.execute(
        select(SiteMember).where(
            SiteMember.tenant_id == tenant_id,
            func.lower(SiteMember.email) == normalize_email(email),
            SiteMember.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def get_active_member(
    db: AsyncSession, tenant_id: UUID, member_id: UUID
) -> SiteMember | None:
    result = await db.execute(
        select(SiteMember).where(
            SiteMember.id == member_id,
            SiteMember.tenant_id == tenant_id,
            SiteMember.deleted_at.is_(None),
            SiteMember.is_active.is_(True),
        )
    )
    return result.scalar_one_or_none()


async def is_email_available(db: AsyncSession, tenant_id: UUID, email: str) -> bool:
    return await _find_by_email(db, tenant_id, email) is None


# ── 가입 ──────────────────────────────────────────────────────────────────


async def register(
    db: AsyncSession, tenant: Tenant, body: MemberRegisterRequest
) -> SiteMember:
    email = normalize_email(body.email)
    phone = normalize_phone(body.phone)
    if not await is_email_available(db, tenant.id, email):
        raise MemberAuthError(409, "CONFLICT", errors.EMAIL_TAKEN, field="email")

    await member_verification.take_verified(
        db, tenant.id, body.phone_verification_id, "REGISTER", phone=phone
    )
    now = _now()
    member = SiteMember(
        tenant_id=tenant.id,
        email=email,
        password_hash=hash_password(body.password),
        name=body.name,
        phone=phone,
        birth_date=body.birth_date,
        marketing_agree=body.marketing_agree,
        last_login_at=now,
    )
    db.add(member)
    try:
        await db.commit()
    except IntegrityError:
        # 동시에 같은 이메일로 가입한 경우 (부분 유니크 인덱스)
        await db.rollback()
        raise MemberAuthError(409, "CONFLICT", errors.EMAIL_TAKEN, field="email")
    await db.refresh(member)
    _enqueue_joined_alert(tenant.id, member.id)
    return member


def _enqueue_joined_alert(tenant_id: UUID, member_id: UUID) -> None:
    """환영 메일 + 관리자 신규 회원 알림 (Celery)."""
    try:
        from app.workers.notification import send_member_joined_alert

        send_member_joined_alert.delay(str(tenant_id), str(member_id))
    except Exception:
        pass  # 브로커 장애 시에도 가입 자체는 성공


# ── 로그인 ────────────────────────────────────────────────────────────────


def _lock_error(locked_until: datetime) -> MemberAuthError:
    remaining = max(1, int((locked_until - _now()).total_seconds()))
    return MemberAuthError(
        429,
        "ACCOUNT_LOCKED",
        errors.ACCOUNT_LOCKED,
        details=[
            {
                "retry_after_seconds": remaining,
                "locked_until": locked_until.isoformat(),
            }
        ],
        headers={"Retry-After": str(remaining)},
    )


async def authenticate(
    db: AsyncSession, tenant: Tenant, email: str, password: str
) -> SiteMember:
    member = await _find_by_email(db, tenant.id, email)
    if member is None:
        verify_password(password, _DUMMY_HASH)
        raise MemberAuthError(401, "INVALID_CREDENTIALS", errors.INVALID_CREDENTIALS)

    now = _now()
    if member.locked_until and member.locked_until > now:
        raise _lock_error(member.locked_until)

    # 소셜 가입 회원(비밀번호 없음)도 같은 응답
    if not member.password_hash or not verify_password(password, member.password_hash):
        member.failed_login_count += 1
        locked = member.failed_login_count >= MAX_FAILED_LOGINS
        if locked:
            member.locked_until = now + timedelta(minutes=LOCK_MINUTES)
            member.failed_login_count = 0
        await db.commit()
        if locked:
            raise _lock_error(member.locked_until)  # type: ignore[arg-type]
        raise MemberAuthError(401, "INVALID_CREDENTIALS", errors.INVALID_CREDENTIALS)

    if not member.is_active:
        raise MemberAuthError(403, "ACCOUNT_INACTIVE", errors.ACCOUNT_INACTIVE)

    member.failed_login_count = 0
    member.locked_until = None
    member.last_login_at = now
    await db.commit()
    return member


# ── 토큰 ──────────────────────────────────────────────────────────────────


def issue_tokens(member: SiteMember, remember: bool) -> tuple[str, str]:
    return (
        create_member_access_token(member.id, member.tenant_id),
        create_member_refresh_token(member.id, member.tenant_id, remember),
    )


def _blacklist_key(token: str) -> str:
    return _BLACKLIST_PREFIX + hashlib.sha256(token.encode()).hexdigest()


async def _blacklist(token: str, payload: dict[str, Any]) -> None:
    ttl = int(payload.get("exp", 0) - _now().timestamp())
    if ttl > 0:
        redis = await get_redis()
        await redis.setex(_blacklist_key(token), ttl, "1")


def _decode_refresh(token: str, tenant: Tenant) -> dict[str, Any]:
    try:
        payload = decode_token(token)
    except ValueError:
        raise MemberAuthError(401, "UNAUTHORIZED", errors.UNAUTHORIZED)
    if payload.get("type") != MEMBER_REFRESH_TYPE:
        raise MemberAuthError(401, "UNAUTHORIZED", errors.UNAUTHORIZED)
    if payload.get("tenant_id") != str(tenant.id):
        raise MemberAuthError(403, "FORBIDDEN", errors.FORBIDDEN)
    return payload


async def refresh(
    db: AsyncSession, tenant: Tenant, refresh_token: str | None
) -> tuple[SiteMember, str, str, bool]:
    """refresh 회전: 새 토큰 발급 후 이전 refresh 는 블랙리스트."""
    if not refresh_token:
        raise MemberAuthError(401, "UNAUTHORIZED", errors.UNAUTHORIZED)
    redis = await get_redis()
    if await redis.get(_blacklist_key(refresh_token)):
        raise MemberAuthError(401, "UNAUTHORIZED", errors.UNAUTHORIZED)
    payload = _decode_refresh(refresh_token, tenant)

    member = await get_active_member(db, tenant.id, UUID(payload["sub"]))
    if member is None or issued_before(payload, member.password_changed_at):
        raise MemberAuthError(401, "UNAUTHORIZED", errors.UNAUTHORIZED)

    remember = bool(payload.get("remember"))
    access, new_refresh = issue_tokens(member, remember)
    await _blacklist(refresh_token, payload)
    return member, access, new_refresh, remember


async def logout(tenant: Tenant, refresh_token: str | None) -> None:
    if not refresh_token:
        return
    try:
        payload = _decode_refresh(refresh_token, tenant)
    except MemberAuthError:
        return  # 이미 무효한 토큰 — 쿠키만 지운다
    await _blacklist(refresh_token, payload)
