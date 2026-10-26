"""T-110 방문자 소셜 로그인 · 가입 · 계정 연결 (기획서 16.3 · 16.4 · 16.7).

흐름
1. start: state(`{slug}.{난수}`, Redis 10분 · 1회용)에 테넌트 · 공급자 · 모드 저장
2. callback: state 확인 → 서버에서 코드 교환 · 프로필 조회
   - 연결된 계정 → LOGGED_IN
   - 신규 → SIGNUP_REQUIRED + signup_token (Redis 30분)
     → complete 에서 휴대폰 인증 · 약관
   - 같은 이메일의 기존 회원 → 409 (자동 연결하지 않음 — 계정 탈취 방지)
   - link 모드 → 로그인한 회원에 연결 (LINKED)
3. unlink: 마지막 로그인 수단(비밀번호 없음 + 다른 소셜 없음)이면 409
"""

import json
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import member_errors as errors
from app.core.member_errors import MemberAuthError
from app.core.redis import get_redis
from app.models.site_member import MemberSocialAccount, SiteMember
from app.models.tenant import Tenant
from app.schemas.site_member import SocialCompleteRequest
from app.services import feature as feature_service
from app.services import member_auth, member_verification
from app.services import social_providers as providers
from app.services.social_providers import Provider, SocialAuthError, SocialProfile

FEATURE_KEY = "MEMBER_SOCIAL_LOGIN"
STATE_TTL_SECONDS = 600
SIGNUP_TTL_SECONDS = 1800
_STATE_PREFIX = "member_social_state:"
_SIGNUP_PREFIX = "member_social_signup:"

Mode = Literal["login", "link"]


def _now() -> datetime:
    return datetime.now(UTC)


@dataclass
class CallbackResult:
    status: Literal["LOGGED_IN", "SIGNUP_REQUIRED", "LINKED"]
    provider: Provider
    return_to: str
    member: SiteMember | None = None
    signup_token: str | None = None
    email_required: bool = False
    suggested_name: str | None = None


async def ensure_enabled(db: AsyncSession, tenant: Tenant) -> None:
    if not await feature_service.is_enabled(db, tenant.id, FEATURE_KEY):
        raise MemberAuthError(403, "FEATURE_DISABLED", errors.FEATURE_DISABLED)


def safe_return_to(tenant: Tenant, return_to: str | None) -> str:
    """콜백 후 돌아갈 경로 — 같은 사이트의 상대 경로만 허용 (오픈 리다이렉트 방지)."""
    default = f"/{tenant.slug}"
    if not return_to or not return_to.startswith("/") or return_to.startswith("//"):
        return default
    if "\\" in return_to or "://" in return_to:
        return default
    return return_to


# ── 시작 ──────────────────────────────────────────────────────────────────


async def start(
    tenant: Tenant,
    provider: Provider,
    mode: Mode,
    return_to: str | None,
    member_id: UUID | None = None,
    stub_user: str | None = None,
) -> tuple[str, str]:
    # 고정된 공용 콜백 페이지가 테넌트를 알 수 있게 slug 를 앞에 붙인다 (비밀 아님).
    # 검증은 뒤의 난수 전체를 Redis 에서 1회용으로 꺼내 테넌트 · 공급자와 대조한다.
    state = f"{tenant.slug}.{secrets.token_urlsafe(32)}"
    redis = await get_redis()
    await redis.setex(
        _STATE_PREFIX + state,
        STATE_TTL_SECONDS,
        json.dumps(
            {
                "tenant_id": str(tenant.id),
                "provider": provider,
                "mode": mode,
                "member_id": str(member_id) if member_id else None,
                "return_to": safe_return_to(tenant, return_to),
            }
        ),
    )
    return providers.authorize_url(provider, state, stub_user), state


async def _pop_state(
    tenant: Tenant, provider: Provider | None, state: str
) -> dict[str, Any]:
    redis = await get_redis()
    raw = await redis.getdel(_STATE_PREFIX + state)
    data = json.loads(raw) if raw else None
    if (
        data is None
        or data["tenant_id"] != str(tenant.id)
        or (provider is not None and data["provider"] != provider)
    ):
        raise MemberAuthError(400, "INVALID_STATE", errors.INVALID_STATE)
    return data


# ── 조회 ──────────────────────────────────────────────────────────────────


async def _linked_account(
    db: AsyncSession, tenant_id: UUID, provider: str, provider_user_id: str
) -> MemberSocialAccount | None:
    return (
        await db.execute(
            select(MemberSocialAccount).where(
                MemberSocialAccount.tenant_id == tenant_id,
                MemberSocialAccount.provider == provider,
                MemberSocialAccount.provider_user_id == provider_user_id,
                MemberSocialAccount.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()


async def list_accounts(
    db: AsyncSession, member: SiteMember
) -> list[MemberSocialAccount]:
    return list(
        (
            await db.execute(
                select(MemberSocialAccount)
                .where(
                    MemberSocialAccount.member_id == member.id,
                    MemberSocialAccount.deleted_at.is_(None),
                )
                .order_by(MemberSocialAccount.created_at)
            )
        )
        .scalars()
        .all()
    )


# ── 콜백 ──────────────────────────────────────────────────────────────────


async def handle_callback(
    db: AsyncSession, tenant: Tenant, provider: Provider | None, code: str, state: str
) -> CallbackResult:
    data = await _pop_state(tenant, provider, state)
    provider = data["provider"]
    try:
        profile = await providers.fetch_profile(provider, code, state)
    except SocialAuthError:
        raise MemberAuthError(502, "SOCIAL_AUTH_FAILED", errors.SOCIAL_AUTH_FAILED)

    return_to = data["return_to"]
    linked = await _linked_account(db, tenant.id, provider, profile.provider_user_id)

    if data["mode"] == "link":
        member = await member_auth.get_active_member(
            db, tenant.id, UUID(data["member_id"])
        )
        if member is None:
            raise MemberAuthError(401, "UNAUTHORIZED", errors.UNAUTHORIZED)
        await _link(db, tenant, member, profile, linked)
        return CallbackResult("LINKED", provider, return_to, member=member)

    if linked is not None:
        member = await _member_for_login(db, tenant, linked.member_id)
        return CallbackResult("LOGGED_IN", provider, return_to, member=member)

    if profile.email and not await member_auth.is_email_available(
        db, tenant.id, profile.email
    ):
        raise MemberAuthError(409, "SOCIAL_EMAIL_EXISTS", errors.SOCIAL_EMAIL_EXISTS)

    signup_token = secrets.token_urlsafe(32)
    redis = await get_redis()
    await redis.setex(
        _SIGNUP_PREFIX + signup_token,
        SIGNUP_TTL_SECONDS,
        json.dumps(
            {
                "tenant_id": str(tenant.id),
                "provider": provider,
                "provider_user_id": profile.provider_user_id,
                "email": profile.email,
                "name": profile.name,
                "return_to": return_to,
            }
        ),
    )
    return CallbackResult(
        "SIGNUP_REQUIRED",
        provider,
        return_to,
        signup_token=signup_token,
        email_required=profile.email is None,
        suggested_name=profile.name,
    )


async def _member_for_login(
    db: AsyncSession, tenant: Tenant, member_id: UUID
) -> SiteMember:
    member = (
        await db.execute(
            select(SiteMember).where(
                SiteMember.id == member_id,
                SiteMember.tenant_id == tenant.id,
                SiteMember.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if member is None:
        raise MemberAuthError(401, "UNAUTHORIZED", errors.UNAUTHORIZED)
    if not member.is_active:
        raise MemberAuthError(403, "ACCOUNT_INACTIVE", errors.ACCOUNT_INACTIVE)
    member.last_login_at = _now()
    await db.commit()
    return member


async def _link(
    db: AsyncSession,
    tenant: Tenant,
    member: SiteMember,
    profile: SocialProfile,
    linked: MemberSocialAccount | None,
) -> None:
    if linked is not None:
        if linked.member_id == member.id:
            return  # 이미 연결됨
        raise MemberAuthError(
            409, "SOCIAL_ALREADY_LINKED", errors.SOCIAL_ALREADY_LINKED
        )
    if any(a.provider == profile.provider for a in await list_accounts(db, member)):
        raise MemberAuthError(
            409, "SOCIAL_PROVIDER_LINKED", errors.SOCIAL_PROVIDER_LINKED
        )
    db.add(
        MemberSocialAccount(
            tenant_id=tenant.id,
            member_id=member.id,
            provider=profile.provider,
            provider_user_id=profile.provider_user_id,
            email=profile.email,
        )
    )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise MemberAuthError(
            409, "SOCIAL_ALREADY_LINKED", errors.SOCIAL_ALREADY_LINKED
        )


# ── 신규 가입 완료 ─────────────────────────────────────────────────────────


async def complete_signup(
    db: AsyncSession, tenant: Tenant, body: SocialCompleteRequest
) -> tuple[SiteMember, str]:
    """추가 정보(휴대폰 인증 · 약관)로 가입 → (회원, 돌아갈 경로)."""
    redis = await get_redis()
    key = _SIGNUP_PREFIX + body.signup_token
    raw = await redis.get(key)
    data = json.loads(raw) if raw else None
    if data is None or data["tenant_id"] != str(tenant.id):
        raise MemberAuthError(400, "SIGNUP_EXPIRED", errors.SIGNUP_EXPIRED)

    email = data["email"] or body.email
    if not email:
        raise MemberAuthError(
            400, "VALIDATION_ERROR", errors.EMAIL_REQUIRED, field="email"
        )
    email = member_auth.normalize_email(email)
    if not await member_auth.is_email_available(db, tenant.id, email):
        raise MemberAuthError(409, "CONFLICT", errors.EMAIL_TAKEN, field="email")
    if await _linked_account(db, tenant.id, data["provider"], data["provider_user_id"]):
        raise MemberAuthError(
            409, "SOCIAL_ALREADY_LINKED", errors.SOCIAL_ALREADY_LINKED
        )

    phone = member_verification.normalize_phone(body.phone)
    await member_verification.take_verified(
        db, tenant.id, body.phone_verification_id, "REGISTER", phone=phone
    )
    now = _now()
    member = SiteMember(
        tenant_id=tenant.id,
        email=email,
        password_hash=None,
        name=body.name or data["name"] or email.split("@")[0],
        phone=phone,
        social_provider=data["provider"],
        social_id=data["provider_user_id"],
        marketing_agree=body.marketing_agree,
        last_login_at=now,
    )
    db.add(member)
    await db.flush()
    db.add(
        MemberSocialAccount(
            tenant_id=tenant.id,
            member_id=member.id,
            provider=data["provider"],
            provider_user_id=data["provider_user_id"],
            email=data["email"],
        )
    )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise MemberAuthError(409, "CONFLICT", errors.EMAIL_TAKEN, field="email")
    await redis.delete(key)
    await db.refresh(member)
    member_auth.enqueue_joined_alert(tenant.id, member.id)
    return member, data["return_to"]


# ── 연결 해제 ─────────────────────────────────────────────────────────────


async def unlink(db: AsyncSession, member: SiteMember, provider: Provider) -> None:
    accounts = await list_accounts(db, member)
    target = next((a for a in accounts if a.provider == provider), None)
    if target is None:
        raise MemberAuthError(404, "NOT_FOUND", errors.SOCIAL_NOT_LINKED)
    others = len(accounts) - 1
    if not member.password_hash and others == 0:
        raise MemberAuthError(409, "LAST_LOGIN_METHOD", errors.LAST_LOGIN_METHOD)
    target.deleted_at = _now()
    await db.commit()
