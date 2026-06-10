import re
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator

_PHONE_RE = re.compile(r"^01[0-9]-?\d{3,4}-?\d{4}$")


def _validate_url(v: str | None) -> str | None:
    if v is None or v == "":
        return v
    if not v.startswith(("http://", "https://")):
        raise ValueError("URL은 http:// 또는 https://로 시작해야 합니다.")
    return v


class SnsSettingsUpdate(BaseModel):
    kakao_url: str | None = None
    instagram_url: str | None = None
    facebook_url: str | None = None
    youtube_url: str | None = None
    blog_url: str | None = None
    naver_url: str | None = None

    @field_validator(
        "kakao_url",
        "instagram_url",
        "facebook_url",
        "youtube_url",
        "blog_url",
        "naver_url",
        mode="before",
    )
    @classmethod
    def validate_url(cls, v: str | None) -> str | None:
        return _validate_url(v)


class SnsSettingsResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    kakao_url: str | None
    instagram_url: str | None
    facebook_url: str | None
    youtube_url: str | None
    blog_url: str | None
    naver_url: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class TestUrlRequest(BaseModel):
    url: str

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL은 http:// 또는 https://로 시작해야 합니다.")
        return v


class TestUrlResponse(BaseModel):
    url: str
    is_valid: bool


def _normalize_phone(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    if not _PHONE_RE.match(v):
        raise ValueError(
            "휴대폰 번호는 010-XXXX-XXXX 형식이어야 합니다 (예: 010-1234-5678)."
        )
    digits = re.sub(r"\D", "", v)
    return f"{digits[:3]}-{digits[3:-4]}-{digits[-4:]}"


class NotificationSettingsUpdate(BaseModel):
    alimtalk_enabled: bool | None = None
    sms_enabled: bool | None = None
    email_enabled: bool | None = None
    recipient_phone: str | None = None
    recipient_email: EmailStr | None = None

    @field_validator("recipient_phone", mode="before")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        return _normalize_phone(v)


class NotificationSettingsResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    alimtalk_enabled: bool
    sms_enabled: bool
    email_enabled: bool
    recipient_phone: str | None
    recipient_email: str | None
    monthly_kakao_count: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class NotificationTestResponse(BaseModel):
    sent: bool
    channels: list[str]
    message: str
