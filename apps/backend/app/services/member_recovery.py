"""T-109 방문자 계정 찾기 · 비밀번호 재설정 (기획서 16.5 · 16.6 · 16.11).

- 이메일 찾기: 이름 + 휴대폰 인증(FIND_EMAIL) → 가린 이메일 목록
- 재설정 링크: 이메일 + 휴대폰 인증(RESET_PW) → 계정 유무와 관계없이 같은 응답,
  일치하는 계정에만 메일 발송. 토큰 원문은 링크에만, DB 에는 SHA-256 해시
- 재설정: 30분 · 1회용 토큰 → 새 비밀번호, 잠금 해제, 이전 로그인 무효화, 보안 알림
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import member_errors as errors
from app.core.config import settings
from app.core.member_errors import MemberAuthError
from app.core.redis import get_redis
from app.core.security import hash_password
from app.models.site_member import MemberPasswordResetToken, SiteMember
from app.models.tenant import Tenant
from app.schemas.site_member import ResetPasswordRequest
from app.services import member_verification
from app.services.member_auth import normalize_email

RESET_TOKEN_MINUTES = 30
RESET_RESEND_SECONDS = 60
_RESET_COOLDOWN_PREFIX = "member_reset_cooldown:"


def _now() -> datetime:
    return datetime.now(UTC)


def mask_email(email: str) -> str:
    """앞 2자리 외 `*` (기획서 16.11). 2자 이하 아이디는 첫 글자만 남긴다."""
    local, _, domain = email.partition("@")
    keep = 2 if len(local) > 2 else 1
    return f"{local[:keep]}{'*' * max(len(local) - keep, 1)}@{domain}"


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def reset_link(tenant: Tenant, token: str) -> str:
    return (
        f"{settings.client_base_url}/{tenant.slug}/member/reset-password?token={token}"
    )


# ── 이메일 찾기 ────────────────────────────────────────────────────────────


async def find_email(
    db: AsyncSession, tenant: Tenant, name: str, verification_id: UUID
) -> list[SiteMember]:
    """일치하는 회원 목록. 찾았을 때만 인증을 소모한다 (이름 오타 시 재인증 불필요)."""
    verification = await member_verification.take_verified(
        db, tenant.id, verification_id, "FIND_EMAIL", consume=False
    )
    members = list(
        (
            await db.execute(
                select(SiteMember)
                .where(
                    SiteMember.tenant_id == tenant.id,
                    SiteMember.phone
                    == member_verification.normalize_phone(verification.phone),
                    SiteMember.name == name,
                    SiteMember.deleted_at.is_(None),
                )
                .order_by(SiteMember.created_at)
            )
        )
        .scalars()
        .all()
    )
    if not members:
        raise MemberAuthError(404, "NOT_FOUND", errors.ACCOUNT_NOT_FOUND)
    verification.used_at = _now()
    await db.commit()
    return members


# ── 재설정 링크 ────────────────────────────────────────────────────────────


async def request_reset(
    db: AsyncSession, tenant: Tenant, email: str, verification_id: UUID
) -> str:
    """재설정 링크 발송 → 응답에 쓸 가린 이메일.

    인증이 틀리면 400, 그 외에는 계정이 없어도 같은 응답을 돌려준다.
    재발송 간격(60초)은 계정 유무와 관계없이 이메일 기준으로 적용한다.
    """
    email = normalize_email(email)
    verification = await member_verification.take_verified(
        db, tenant.id, verification_id, "RESET_PW", consume=False
    )

    redis = await get_redis()
    cooldown_key = f"{_RESET_COOLDOWN_PREFIX}{tenant.id}:{email}"
    if not await redis.set(cooldown_key, "1", ex=RESET_RESEND_SECONDS, nx=True):
        wait = max(1, await redis.ttl(cooldown_key))
        raise MemberAuthError(
            429,
            "RATE_LIMIT_EXCEEDED",
            errors.RESEND_WAIT,
            details=[{"retry_after_seconds": wait}],
            headers={"Retry-After": str(wait)},
        )

    member = (
        await db.execute(
            select(SiteMember).where(
                SiteMember.tenant_id == tenant.id,
                func.lower(SiteMember.email) == email,
                SiteMember.deleted_at.is_(None),
                SiteMember.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    phone_matches = member is not None and member.phone == (
        member_verification.normalize_phone(verification.phone)
    )
    if member is not None and phone_matches:
        await _issue_reset_token(db, tenant, member)
    return mask_email(email)


async def _issue_reset_token(
    db: AsyncSession, tenant: Tenant, member: SiteMember
) -> None:
    now = _now()
    # 이전에 발급한 미사용 링크는 무효화 (가장 최근 링크만 유효)
    await db.execute(
        update(MemberPasswordResetToken)
        .where(
            MemberPasswordResetToken.member_id == member.id,
            MemberPasswordResetToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    token = secrets.token_urlsafe(32)
    db.add(
        MemberPasswordResetToken(
            tenant_id=tenant.id,
            member_id=member.id,
            token_hash=_token_hash(token),
            expires_at=now + timedelta(minutes=RESET_TOKEN_MINUTES),
        )
    )
    await db.commit()
    _enqueue_email(
        member.email,
        subject=f"[{tenant.name}] 비밀번호 재설정 안내",
        template="member_reset_password",
        variables={
            "member_name": member.name,
            "site_name": tenant.name,
            "reset_url": reset_link(tenant, token),
            "expires_minutes": RESET_TOKEN_MINUTES,
        },
    )


def _enqueue_email(to: str, *, subject: str, template: str, variables: dict) -> None:
    try:
        from app.workers.email import send_email_async

        send_email_async.delay(to, subject, template, variables)
    except Exception:
        pass  # 브로커 장애 시에도 요청 자체는 성공 응답 (계정 노출 방지와 동일)


# ── 재설정 ────────────────────────────────────────────────────────────────


async def _valid_token(
    db: AsyncSession, tenant: Tenant, token: str, *, lock: bool = False
) -> tuple[MemberPasswordResetToken, SiteMember]:
    query = (
        select(MemberPasswordResetToken, SiteMember)
        .join(SiteMember, SiteMember.id == MemberPasswordResetToken.member_id)
        .where(
            MemberPasswordResetToken.token_hash == _token_hash(token),
            MemberPasswordResetToken.tenant_id == tenant.id,
            MemberPasswordResetToken.used_at.is_(None),
            MemberPasswordResetToken.expires_at > _now(),
            SiteMember.deleted_at.is_(None),
            SiteMember.is_active.is_(True),
        )
    )
    if lock:
        query = query.with_for_update()
    row = (await db.execute(query)).one_or_none()
    if row is None:
        raise MemberAuthError(400, "TOKEN_EXPIRED", errors.TOKEN_EXPIRED)
    return row[0], row[1]


async def check_reset_token(db: AsyncSession, tenant: Tenant, token: str) -> str:
    """링크 클릭 시 화면을 보여주기 전 확인 → 가린 이메일."""
    _, member = await _valid_token(db, tenant, token)
    return mask_email(member.email)


async def reset_password(
    db: AsyncSession, tenant: Tenant, body: ResetPasswordRequest
) -> SiteMember:
    reset_token, member = await _valid_token(db, tenant, body.token, lock=True)
    now = _now()
    member.password_hash = hash_password(body.password)
    member.password_changed_at = now
    member.failed_login_count = 0
    member.locked_until = None
    reset_token.used_at = now
    await db.commit()
    _enqueue_password_changed(tenant.id, member.id)
    return member


def _enqueue_password_changed(tenant_id: UUID, member_id: UUID) -> None:
    """비밀번호 변경 보안 알림 — 메일 + 문자 (기획서 16.11)."""
    try:
        from app.workers.notification import send_member_password_changed

        send_member_password_changed.delay(str(tenant_id), str(member_id))
    except Exception:
        pass
