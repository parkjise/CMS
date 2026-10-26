"""T-107 방문자 회원 Pydantic 스키마 (기획서 16.3 · 16.7 · 16.10).

API(T-108 ~ T-111)는 이 스키마로 요청을 검증하고 응답을 직렬화한다.
응답 스키마에는 password_hash · social_id · 잠금 정보가 절대 포함되지 않는다.
"""

import re
import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

SocialProvider = Literal["KAKAO", "NAVER"]
VerificationPurpose = Literal["REGISTER", "FIND_EMAIL", "RESET_PW"]
ReservationType = Literal["MEDICAL", "LODGING", "GENERAL"]
ReservationStatus = Literal["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"]

_PHONE_RE = re.compile(r"^01[016789]-?\d{3,4}-?\d{4}$")
# 2자 이상, 특수문자 불가 (한글·영문·공백)
_NAME_RE = re.compile(r"^[가-힣a-zA-Z ]{2,100}$")
# 8자 이상, 영문 + 숫자 포함
_PASSWORD_RE = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).{8,100}$")

PHONE_ERROR = "올바른 휴대폰 번호 형식이 아닙니다."
NAME_ERROR = "이름을 올바르게 입력해주세요"
PASSWORD_ERROR = "영문, 숫자를 포함하여 8자 이상 입력해주세요"
PASSWORD_MISMATCH_ERROR = "비밀번호가 일치하지 않습니다"
TERMS_ERROR = "필수 약관에 동의해주세요"


def _check_phone(value: str) -> str:
    if not _PHONE_RE.match(value):
        raise ValueError(PHONE_ERROR)
    return value


def _check_name(value: str) -> str:
    value = value.strip()
    if not _NAME_RE.match(value):
        raise ValueError(NAME_ERROR)
    return value


def _check_password(value: str) -> str:
    if not _PASSWORD_RE.match(value):
        raise ValueError(PASSWORD_ERROR)
    return value


# ── 가입 · 로그인 ──────────────────────────────────────────────────────────


class MemberRegisterRequest(BaseModel):
    name: str = Field(..., max_length=100)
    email: EmailStr
    password: str = Field(..., max_length=100)
    password_confirm: str = Field(..., max_length=100)
    phone: str = Field(..., max_length=20)
    # POST /auth/phone/verify 로 인증 완료된 phone_verifications.id
    phone_verification_id: uuid.UUID
    birth_date: date | None = None
    terms_agree: bool
    privacy_agree: bool
    marketing_agree: bool = False

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return _check_name(v)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return _check_phone(v)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _check_password(v)

    @model_validator(mode="after")
    def check_confirm_and_terms(self) -> "MemberRegisterRequest":
        if self.password != self.password_confirm:
            raise ValueError(PASSWORD_MISMATCH_ERROR)
        if not (self.terms_agree and self.privacy_agree):
            raise ValueError(TERMS_ERROR)
        return self


class MemberSocialRequest(BaseModel):
    provider: SocialProvider
    # 소셜 인가 코드 (서버가 토큰 교환 · 프로필 조회)
    code: str = Field(..., min_length=1, max_length=500)
    state: str | None = Field(None, max_length=200)
    redirect_uri: str | None = Field(None, max_length=500)


class MemberLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=100)


# ── 휴대폰 인증 · 계정 찾기 ────────────────────────────────────────────────


class PhoneSendRequest(BaseModel):
    phone: str = Field(..., max_length=20)
    purpose: VerificationPurpose

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return _check_phone(v)


class PhoneVerifyRequest(BaseModel):
    verification_id: uuid.UUID
    code: str = Field(..., pattern=r"^\d{6}$")


class FindEmailRequest(BaseModel):
    name: str = Field(..., max_length=100)
    phone_verification_id: uuid.UUID


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=200)
    password: str = Field(..., max_length=100)
    password_confirm: str = Field(..., max_length=100)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _check_password(v)

    @model_validator(mode="after")
    def check_confirm(self) -> "ResetPasswordRequest":
        if self.password != self.password_confirm:
            raise ValueError(PASSWORD_MISMATCH_ERROR)
        return self


# ── 마이페이지 ─────────────────────────────────────────────────────────────


class MemberUpdateRequest(BaseModel):
    """내 정보 수정 — 이메일은 변경 불가."""

    name: str | None = Field(None, max_length=100)
    phone: str | None = Field(None, max_length=20)
    # 연락처 변경 시 새 번호의 인증 완료 id 필요 (T-111 에서 검사)
    phone_verification_id: uuid.UUID | None = None
    birth_date: date | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        return None if v is None else _check_name(v)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        return None if v is None else _check_phone(v)


class MemberPasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., max_length=100)
    password_confirm: str = Field(..., max_length=100)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _check_password(v)

    @model_validator(mode="after")
    def check_confirm(self) -> "MemberPasswordChangeRequest":
        if self.password != self.password_confirm:
            raise ValueError(PASSWORD_MISMATCH_ERROR)
        return self


class MemberNotificationSettings(BaseModel):
    """알림 설정 (16.7) — 응답 및 PATCH 요청(보낸 항목만 변경)."""

    notify_reservation_confirmed: bool | None = None
    notify_reservation_cancelled: bool | None = None
    marketing_agree: bool | None = None
    sms_agree: bool | None = None
    email_agree: bool | None = None


class MemberWithdrawRequest(BaseModel):
    # 소셜 가입 회원은 비밀번호가 없으므로 선택
    password: str | None = Field(None, max_length=100)
    reason: str | None = Field(None, max_length=500)


# ── 응답 ───────────────────────────────────────────────────────────────────


class MemberSummary(BaseModel):
    """로그인 응답의 member (16.10 응답 예시)."""

    id: uuid.UUID
    name: str
    email: str

    model_config = {"from_attributes": True}


class MemberAuthResponse(BaseModel):
    access_token: str
    member: MemberSummary


class MemberResponse(BaseModel):
    """내 정보 — password_hash · social_id · 로그인 잠금 정보는 제외."""

    id: uuid.UUID
    name: str
    email: str
    phone: str | None
    birth_date: date | None
    social_provider: SocialProvider | None
    has_password: bool
    marketing_agree: bool
    sms_agree: bool
    email_agree: bool
    notify_reservation_confirmed: bool
    notify_reservation_cancelled: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def derive_has_password(cls, data: Any) -> Any:
        if isinstance(data, dict):
            data.setdefault("has_password", bool(data.get("password_hash")))
            return data
        values = {
            name: getattr(data, name, None)
            for name in cls.model_fields
            if name != "has_password"
        }
        values["has_password"] = bool(getattr(data, "password_hash", None))
        return values


class MemberReservationResponse(BaseModel):
    id: uuid.UUID
    reservation_type: ReservationType
    status: ReservationStatus
    reserved_at: datetime | None
    memo: str | None
    detail: dict[str, Any]
    inquiry_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PhoneSendResponse(BaseModel):
    verification_id: uuid.UUID
    expires_at: datetime


class FindEmailResponse(BaseModel):
    # 가린 이메일 (예: ho**@email.com) + 가입 방식
    masked_email: str
    social_provider: SocialProvider | None
    created_at: datetime
