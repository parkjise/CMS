"""T-109 방문자 휴대폰 인증 (기획서 16.3 · 16.5 · 16.6 · 16.11, 오픈 이슈 #21).

- 6자리 코드 · 3분 만료 · 오입력 5회 시 무효
- 같은 번호 하루(한국 시간) 5회 · 재요청 60초 간격
- 발송 채널: 네이버 클라우드 SENS SMS (#21 옵션 A, 관리자 알림 월 한도와 별개)
- 계정 유무와 관계없이 발송한다 (계정 존재 여부 노출 방지)
"""

import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import member_errors as errors
from app.core.config import settings
from app.core.member_errors import MemberAuthError
from app.models.site_member import PhoneVerification
from app.models.tenant import Tenant
from app.services import notification as notification_service

Purpose = Literal["REGISTER", "FIND_EMAIL", "RESET_PW"]

CODE_TTL_MINUTES = 3
MAX_ATTEMPTS = 5
DAILY_SEND_LIMIT = 5
RESEND_SECONDS = 60
# 인증 완료 후 가입 · 계정 찾기 · 재설정 요청까지 허용 시간
VERIFIED_VALID_MINUTES = 30

_KST = ZoneInfo("Asia/Seoul")


def _now() -> datetime:
    return datetime.now(UTC)


def normalize_phone(phone: str) -> str:
    """숫자만 남겨 010-1234-5678 형식으로 맞춘다."""
    digits = "".join(ch for ch in phone if ch.isdigit())
    return f"{digits[:3]}-{digits[3:-4]}-{digits[-4:]}"


def debug_code_enabled() -> bool:
    """로컬 개발에서만 응답에 인증번호를 담는다 (운영 · 실발송 모드 제외)."""
    return settings.app_env != "production" and settings.notification_mode != "live"


def _start_of_today_kst(now: datetime) -> datetime:
    local = now.astimezone(_KST)
    return local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)


async def send_code(
    db: AsyncSession, tenant: Tenant, phone: str, purpose: Purpose
) -> tuple[PhoneVerification, int]:
    """인증번호 발송 → (인증 요청, 재요청까지 남은 초)."""
    phone = normalize_phone(phone)
    now = _now()
    sends = (
        await db.execute(
            select(
                func.count(PhoneVerification.id),
                func.max(PhoneVerification.created_at),
            ).where(
                PhoneVerification.tenant_id == tenant.id,
                PhoneVerification.phone == phone,
                PhoneVerification.created_at >= _start_of_today_kst(now),
            )
        )
    ).one()
    count, last_sent = sends
    if last_sent is not None:
        wait = RESEND_SECONDS - int((now - last_sent).total_seconds())
        if wait > 0:
            raise MemberAuthError(
                429,
                "RATE_LIMIT_EXCEEDED",
                errors.RESEND_WAIT,
                details=[{"retry_after_seconds": wait}],
                headers={"Retry-After": str(wait)},
            )
    if count >= DAILY_SEND_LIMIT:
        raise MemberAuthError(429, "PHONE_SEND_LIMIT", errors.PHONE_SEND_LIMIT)

    code = f"{secrets.randbelow(1_000_000):06d}"
    sent = await notification_service.send_sms(
        to=phone,
        message=f"[{tenant.name}] 인증번호 [{code}]를 입력해주세요. (3분 내)",
    )
    if not sent:
        raise MemberAuthError(503, "SMS_SEND_FAILED", errors.SMS_SEND_FAILED)

    verification = PhoneVerification(
        tenant_id=tenant.id,
        phone=phone,
        code=code,
        purpose=purpose,
        expires_at=now + timedelta(minutes=CODE_TTL_MINUTES),
    )
    db.add(verification)
    await db.commit()
    await db.refresh(verification)
    return verification, RESEND_SECONDS


async def verify_code(
    db: AsyncSession, tenant: Tenant, verification_id: UUID, code: str
) -> PhoneVerification:
    verification = (
        await db.execute(
            select(PhoneVerification)
            .where(
                PhoneVerification.id == verification_id,
                PhoneVerification.tenant_id == tenant.id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if verification is None:
        raise MemberAuthError(404, "NOT_FOUND", errors.VERIFICATION_NOT_FOUND)
    if verification.attempt_count >= MAX_ATTEMPTS:
        raise MemberAuthError(
            400, "CODE_ATTEMPTS_EXCEEDED", errors.CODE_ATTEMPTS_EXCEEDED
        )

    matches = hmac.compare_digest(verification.code, code)
    if verification.verified_at is not None and matches:
        return verification  # 같은 코드로 다시 확인해도 성공 (멱등)
    if verification.expires_at <= _now():
        raise MemberAuthError(400, "CODE_EXPIRED", errors.CODE_EXPIRED)
    if not matches:
        verification.attempt_count += 1
        await db.commit()
        remaining = MAX_ATTEMPTS - verification.attempt_count
        if remaining <= 0:
            raise MemberAuthError(
                400, "CODE_ATTEMPTS_EXCEEDED", errors.CODE_ATTEMPTS_EXCEEDED
            )
        raise MemberAuthError(
            400,
            "INVALID_CODE",
            errors.INVALID_CODE,
            field="code",
            details=[{"remaining_attempts": remaining}],
        )

    verification.verified_at = _now()
    await db.commit()
    return verification


async def take_verified(
    db: AsyncSession,
    tenant_id: UUID,
    verification_id: UUID,
    purpose: Purpose,
    *,
    phone: str | None = None,
    consume: bool = True,
) -> PhoneVerification:
    """인증 완료된 요청을 확인한다 (같은 테넌트 · 용도 · 30분 이내 · 미사용).

    consume=True 면 used_at 을 기록한다 (커밋은 호출한 쪽에서).
    consume=False 는 비밀번호 재설정 링크 재발송처럼 같은 인증을 다시 쓸 때.
    """
    verification = (
        await db.execute(
            select(PhoneVerification)
            .where(
                PhoneVerification.id == verification_id,
                PhoneVerification.tenant_id == tenant_id,
                PhoneVerification.purpose == purpose,
                PhoneVerification.verified_at.is_not(None),
                PhoneVerification.used_at.is_(None),
                PhoneVerification.verified_at
                >= _now() - timedelta(minutes=VERIFIED_VALID_MINUTES),
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if verification is None or (
        phone is not None and normalize_phone(verification.phone) != phone
    ):
        raise MemberAuthError(
            400, "PHONE_NOT_VERIFIED", errors.PHONE_NOT_VERIFIED, field="phone"
        )
    if consume:
        verification.used_at = _now()
    return verification
