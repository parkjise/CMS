"""사업체 공통 정보 (T-036-A, 기획서 AD-02-A 공통 설정)."""

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ValidationInfo, field_validator

# 02-1234-5678 · 031-123-4567 · 010-1234-5678 · 1588-1234
_PHONE_RE = re.compile(r"^(\d{2,4}-?\d{3,4}-?\d{4}|1\d{3}-?\d{4})$")
_BIZ_RE = re.compile(r"^\d{3}-?\d{2}-?\d{5}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# 칸 → (최대 글자 수, 화면 이름)
TEXT_LIMITS: dict[str, tuple[int, str]] = {
    "address": (200, "주소"),
    "address_detail": (100, "상세 주소"),
    "hours_weekday": (100, "평일 영업시간"),
    "hours_saturday": (100, "토요일 영업시간"),
    "hours_note": (200, "휴무 안내"),
    "parking": (200, "주차 안내"),
    "ceo": (50, "대표자"),
}
IMAGE_FIELDS = ("logo_url", "favicon_url")


def _blank_to_empty(v: object) -> object:
    """앞뒤 공백 정리 — None 은 '바꾸지 않음', "" 는 '지우기'로 그대로 둔다."""
    return v.strip() if isinstance(v, str) else v


class SiteSettingsUpdate(BaseModel):
    """None = 바꾸지 않음, "" = 지우기"""

    phone: str | None = None
    email: str | None = None
    address: str | None = None
    address_detail: str | None = None
    hours_weekday: str | None = None
    hours_saturday: str | None = None
    hours_note: str | None = None
    parking: str | None = None
    ceo: str | None = None
    business_number: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None

    @field_validator("*", mode="before")
    @classmethod
    def strip(cls, v: object) -> object:
        return _blank_to_empty(v)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        if v and not _PHONE_RE.match(v):
            raise ValueError("전화번호 형식을 확인해 주세요. (예: 02-1234-5678)")
        return v

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str | None) -> str | None:
        if v and (len(v) > 255 or not _EMAIL_RE.match(v)):
            raise ValueError("이메일 형식을 확인해 주세요.")
        return v

    @field_validator("business_number")
    @classmethod
    def check_business_number(cls, v: str | None) -> str | None:
        if not v:
            return v
        if not _BIZ_RE.match(v):
            raise ValueError("사업자등록번호는 10자리 숫자예요. (예: 123-45-67890)")
        digits = v.replace("-", "")
        return f"{digits[:3]}-{digits[3:5]}-{digits[5:]}"

    @field_validator(*TEXT_LIMITS)
    @classmethod
    def check_length(cls, v: str | None, info: ValidationInfo) -> str | None:
        limit, label = TEXT_LIMITS[str(info.field_name)]
        if v and len(v) > limit:
            raise ValueError(f"{label}은(는) {limit}자 이하로 입력해 주세요.")
        return v

    @field_validator(*IMAGE_FIELDS)
    @classmethod
    def check_image_url(cls, v: str | None) -> str | None:
        if v and (len(v) > 500 or not v.startswith(("http://", "https://", "/"))):
            raise ValueError("이미지 주소가 올바르지 않습니다.")
        return v


class SiteSettingsResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    phone: str | None
    email: str | None
    address: str | None
    address_detail: str | None
    hours_weekday: str | None
    hours_saturday: str | None
    hours_note: str | None
    parking: str | None
    ceo: str | None
    business_number: str | None
    logo_url: str | None
    favicon_url: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class PublicSiteSettingsResponse(BaseModel):
    """홈페이지 공개용 — 내부 id 없이"""

    phone: str | None
    email: str | None
    address: str | None
    address_detail: str | None
    hours_weekday: str | None
    hours_saturday: str | None
    hours_note: str | None
    parking: str | None
    ceo: str | None
    business_number: str | None
    logo_url: str | None
    favicon_url: str | None
    # 상단 메뉴 (T-036-B) — 홈페이지가 기본 메뉴 위에 덮어쓴다
    menu_items: list[dict] | None = None

    model_config = {"from_attributes": True}


# ── 상단 메뉴 (T-036-B) ────────────────────────────────────────────────

MENU_LABEL_MAX = 20


class MenuItemUpdate(BaseModel):
    key: str
    # 빈 이름 = 기본 이름
    label: str | None = None
    visible: bool = True

    @field_validator("label", mode="before")
    @classmethod
    def strip_label(cls, v: object) -> object:
        if isinstance(v, str):
            v = v.strip()
            if len(v) > MENU_LABEL_MAX:
                raise ValueError(
                    f"메뉴 이름은 {MENU_LABEL_MAX}자 이하로 입력해 주세요."
                )
            return v or None
        return v


class MenuUpdate(BaseModel):
    items: list[MenuItemUpdate]


class MenuItemResponse(BaseModel):
    key: str
    default_label: str
    label: str | None
    visible: bool


class MenuResponse(BaseModel):
    # theme: 섹션 순서를 따른다 / code: 순서를 바꿀 수 있다
    mode: str
    reorderable: bool
    items: list[MenuItemResponse]
