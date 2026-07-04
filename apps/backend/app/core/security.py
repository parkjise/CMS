import uuid as _uuid
from datetime import UTC, datetime, timedelta
from uuid import UUID

import bcrypt
import pyotp
from jose import JWTError, jwt

from app.core.config import settings

ALGORITHM = settings.jwt_algorithm
TOTP_ISSUER = "CMS SuperAdmin"


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(
    user_id: UUID,
    tenant_id: UUID | None,
    role: str,
    is_super_admin: bool = False,
    expires_minutes: int | None = None,
    extra_claims: dict | None = None,
) -> str:
    minutes = (
        expires_minutes
        if expires_minutes is not None
        else settings.access_token_expire_minutes
    )
    expire = datetime.now(UTC) + timedelta(minutes=minutes)
    payload = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id) if tenant_id else None,
        "role": role,
        "is_super_admin": is_super_admin,
        "exp": expire,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.app_secret_key, algorithm=ALGORITHM)


def create_refresh_token(user_id: UUID) -> str:
    expire = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": str(_uuid.uuid4()),
        "exp": expire,
    }
    return jwt.encode(payload, settings.app_secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.app_secret_key, algorithms=[ALGORITHM])
    except JWTError as e:
        raise ValueError("유효하지 않은 토큰입니다.") from e


# ── TOTP 2FA (T-094) ──────────────────────────────────────────────────────
def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, account_name: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(
        name=account_name, issuer_name=TOTP_ISSUER
    )


def verify_totp(secret: str, code: str) -> bool:
    """TOTP 코드 검증. 시계 오차 허용(±1 step)."""
    if not secret or not code:
        return False
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def create_2fa_challenge_token(user_id: UUID, expires_minutes: int = 5) -> str:
    """비밀번호 검증 후 2FA 대기용 단기 토큰. 액세스 권한 없음."""
    expire = datetime.now(UTC) + timedelta(minutes=expires_minutes)
    payload = {
        "sub": str(user_id),
        "pending_2fa": True,
        "jti": str(_uuid.uuid4()),
        "exp": expire,
    }
    return jwt.encode(payload, settings.app_secret_key, algorithm=ALGORITHM)
