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
# MYPAGE: 마이페이지 연락처 변경 · 소셜 가입자 첫 비밀번호 설정 (T-111)
VerificationPurpose = Literal["REGISTER", "FIND_EMAIL", "RESET_PW", "MYPAGE"]
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
    """소셜 콜백 — 인가 코드는 서버가 토큰으로 교환 (클라이언트에 토큰 노출 금지)."""

    # 콜백 주소에는 공급자가 없으므로 생략 가능 (state 에 저장된 값 사용, 보내면 대조)
    provider: SocialProvider | None = None
    code: str = Field(..., min_length=1, max_length=500)
    state: str = Field(..., min_length=16, max_length=200)


class SocialCompleteRequest(BaseModel):
    """소셜 신규 가입 추가 정보 (16.3) — 휴대폰 인증 + 약관."""

    signup_token: str = Field(..., min_length=16, max_length=200)
    # 소셜이 이메일을 주지 않은 경우에만 필수
    email: EmailStr | None = None
    name: str | None = Field(None, max_length=100)
    phone: str = Field(..., max_length=20)
    phone_verification_id: uuid.UUID
    terms_agree: bool
    privacy_agree: bool
    marketing_agree: bool = False

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return _check_phone(v)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        return None if v is None else _check_name(v)

    @model_validator(mode="after")
    def check_terms(self) -> "SocialCompleteRequest":
        if not (self.terms_agree and self.privacy_agree):
            raise ValueError(TERMS_ERROR)
        return self


class MemberLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=100)
    # 로그인 상태 유지 — true 면 refresh 쿠키 7일, false 면 세션 쿠키
    remember_me: bool = False


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
    # POST /auth/phone/verify 로 인증 완료된 FIND_EMAIL 용 id
    phone_verification_id: uuid.UUID

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return _check_name(v)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    # POST /auth/phone/verify 로 인증 완료된 RESET_PW 용 id (재발송 시 재사용 가능)
    phone_verification_id: uuid.UUID


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
    """내 정보 수정 — 이메일은 변경 불가 (보내면 400)."""

    model_config = {"extra": "forbid"}

    name: str | None = Field(None, max_length=100)
    phone: str | None = Field(None, max_length=20)
    # 연락처 변경 시 새 번호의 인증 완료 id 필요 (MYPAGE 용도)
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
    # 비밀번호가 있는 회원은 필수
    current_password: str | None = Field(None, max_length=100)
    # 소셜 가입자(비밀번호 없음)의 첫 비밀번호 설정은 휴대폰 인증(MYPAGE) 필수
    phone_verification_id: uuid.UUID | None = None
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


WithdrawalReason = Literal["INCONVENIENT", "PRIVACY", "NOT_USING", "OTHER"]


class MemberWithdrawRequest(BaseModel):
    # 소셜 가입 회원은 비밀번호가 없으므로 선택
    password: str | None = Field(None, max_length=100)
    # 서비스 이용 불편 · 개인정보 보호 · 사업체 이용 안 함 · 기타 (16.8)
    reason: WithdrawalReason | None = None
    reason_detail: str | None = Field(None, max_length=400)


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


class EmailCheckResponse(BaseModel):
    email: str
    available: bool


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
    # 연결된 소셜 계정 (T-110)
    social_accounts: list[SocialProvider] = []

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def derive_has_password(cls, data: Any) -> Any:
        if isinstance(data, dict):
            data.setdefault("has_password", bool(data.get("password_hash")))
            return data
        # ORM 객체 — 소셜 계정 목록은 별도 조회라 비워 두고 엔드포인트에서 채운다
        values = {
            name: getattr(data, name, None)
            for name in cls.model_fields
            if name not in ("has_password", "social_accounts")
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
    # 재발송 가능까지 남은 초
    resend_after_seconds: int
    # 로컬 개발 전용 (운영 · 실발송 모드에서는 항상 None)
    debug_code: str | None = None


class PhoneVerifyResponse(BaseModel):
    verification_id: uuid.UUID
    verified: bool


class FoundAccount(BaseModel):
    # 가린 이메일 (예: ho****@email.com) + 가입 방식
    masked_email: str
    social_provider: SocialProvider | None
    created_at: datetime


class FindEmailResponse(BaseModel):
    accounts: list[FoundAccount]


class ForgotPasswordResponse(BaseModel):
    """계정 유무와 관계없이 같은 응답 (기획서 16.11)."""

    masked_email: str
    expires_in_minutes: int
    resend_after_seconds: int
    # 로컬 개발 전용 — 메일 대신 재설정 링크 (운영 · 실발송 모드에서는 항상 None)
    debug_reset_url: str | None = None


class MemberAuthOptions(BaseModel):
    """홈페이지 회원 화면 구성 (T-113 · T-115) — 기능 플래그."""

    # SITE_MEMBER — 꺼져 있으면 회원 메뉴 · 화면 숨김
    enabled: bool
    social_login: bool
    providers: list[SocialProvider]
    # 마이페이지 "내 예약" 탭 — MEMBER_RESERVATION
    reservations: bool


class ResetTokenCheckResponse(BaseModel):
    valid: bool
    masked_email: str


class ResetPasswordResponse(BaseModel):
    reset: bool


# ── 소셜 로그인 (T-110) ────────────────────────────────────────────────────


class SocialAuthorizeResponse(BaseModel):
    authorize_url: str
    state: str


class SocialCallbackResponse(BaseModel):
    """LOGGED_IN: 로그인 완료 / SIGNUP_REQUIRED: 추가 정보 화면 / LINKED: 연결 완료."""

    status: Literal["LOGGED_IN", "SIGNUP_REQUIRED", "LINKED"]
    provider: SocialProvider
    return_to: str
    access_token: str | None = None
    member: MemberSummary | None = None
    signup_token: str | None = None
    # 소셜이 이메일을 주지 않아 추가 정보 화면에서 받아야 함
    email_required: bool = False
    suggested_name: str | None = None


class SocialAccountItem(BaseModel):
    provider: SocialProvider
    email: str | None
    linked_at: datetime


class SocialAccountsResponse(BaseModel):
    accounts: list[SocialAccountItem]
    # 비밀번호가 없으면 마지막 소셜 계정은 해제할 수 없다
    has_password: bool


# ── 마이페이지 (T-111) ─────────────────────────────────────────────────────


class MemberPasswordChangeResponse(BaseModel):
    """다른 기기 로그인은 해제되고 이 기기에는 새 토큰을 준다."""

    access_token: str


class MemberReservationList(BaseModel):
    items: list[MemberReservationResponse]


class MemberInquiryItem(BaseModel):
    id: uuid.UUID
    inquiry_type: str
    subject: str | None
    is_board: bool
    answered: bool
    created_at: datetime


class MemberInquiryList(BaseModel):
    items: list[MemberInquiryItem]


class MemberInquiryDetail(MemberInquiryItem):
    message: str
    answer: str | None
    answered_at: datetime | None
    reserved_date: date | None
    reserved_time: str | None
