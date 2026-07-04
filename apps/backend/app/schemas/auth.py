import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    tenant_slug: str


class SuperLoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID | None
    email: str
    role: str
    last_login_at: datetime | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    user: UserResponse
    access_token: str
    token_type: str = "bearer"


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── 슈퍼 어드민 2FA (T-094) ───────────────────────────────────────────────
class SuperLoginResponse(BaseModel):
    """2FA 미사용 시 access_token 발급, 사용 시 challenge_token 반환."""

    requires_2fa: bool
    user: UserResponse | None = None
    access_token: str | None = None
    challenge_token: str | None = None
    token_type: str = "bearer"


class Verify2faRequest(BaseModel):
    challenge_token: str
    code: str


class TotpSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str


class TotpConfirmRequest(BaseModel):
    code: str
