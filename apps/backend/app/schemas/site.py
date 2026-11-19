"""사업체 공통 정보 (T-036-A, 기획서 AD-02-A 공통 설정)."""

import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, ValidationInfo, field_validator, model_validator

# 02-1234-5678 · 031-123-4567 · 010-1234-5678 · 1588-1234 · 국제번호 +82 2-1234-5678
_PHONE_RE = re.compile(r"^(\d{2,4}-?\d{3,4}-?\d{4}|1\d{3}-?\d{4}|\+\d[\d -]{6,17})$")
_BIZ_RE = re.compile(r"^\d{3}-?\d{2}-?\d{5}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_POSTAL_RE = re.compile(r"^\d{5}$")
# 00:00 ~ 23:59, 닫는 시각만 24:00 허용
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

# 칸 → (최대 글자 수, 화면 이름)
TEXT_LIMITS: dict[str, tuple[int, str]] = {
    "site_name": (100, "사이트명"),
    "company_name": (100, "회사명"),
    "mail_order_number": (50, "통신판매업 신고번호"),
    "business_type": (50, "업태"),
    "business_item": (100, "종목"),
    "address": (200, "주소"),
    "address_detail": (100, "상세 주소"),
    "hours_weekday": (100, "평일 영업시간"),
    "hours_saturday": (100, "토요일 영업시간"),
    "hours_note": (200, "휴무일 안내"),
    "hours_temp_note": (200, "임시 운영 안내"),
    "parking": (200, "주차 안내"),
    "ceo": (50, "대표자"),
    "privacy_officer": (50, "개인정보 보호책임자"),
    "copyright": (200, "저작권 문구"),
}
PHONE_FIELDS = ("phone", "cs_phone", "fax")
EMAIL_FIELDS = ("email", "privacy_email")
IMAGE_FIELDS = ("logo_url", "favicon_url")

WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
DayStatus = Literal["open", "closed", "24h"]

# 공개 항목 묶음 (T-222) — 숨기면 공개 API · 홈페이지 · 구조화 데이터에서 모두 뺀다
PUBLIC_GROUPS: dict[str, tuple[str, ...]] = {
    "company_name": ("company_name",),
    "ceo": ("ceo",),
    "address": ("postal_code", "address", "address_detail"),
    "phone": ("phone", "cs_phone"),
    "fax": ("fax",),
    "email": ("email",),
    "business": (
        "business_number",
        "mail_order_number",
        "business_type",
        "business_item",
    ),
    "privacy_officer": ("privacy_officer", "privacy_email"),
}


def _blank_to_empty(v: object) -> object:
    """앞뒤 공백 정리 — None 은 '바꾸지 않음', "" 는 '지우기'로 그대로 둔다."""
    return v.strip() if isinstance(v, str) else v


def _minutes(hhmm: str) -> int:
    hour, minute = hhmm.split(":")
    return int(hour) * 60 + int(minute)


class DayHours(BaseModel):
    """하루 운영시간 — 닫는 시각이 여는 시각보다 이르면 다음 날 새벽에 닫는다."""

    model_config = {"extra": "forbid"}

    status: DayStatus
    open: str | None = None
    close: str | None = None
    break_start: str | None = None
    break_end: str | None = None

    @field_validator("open", "break_start", "break_end", "close", mode="before")
    @classmethod
    def check_time(cls, v: object, info: ValidationInfo) -> object:
        if isinstance(v, str):
            v = v.strip() or None
        if v is None:
            return None
        if not isinstance(v, str) or not (
            _TIME_RE.match(v) or (info.field_name == "close" and v == "24:00")
        ):
            raise ValueError("시간은 09:00 처럼 입력해 주세요.")
        return v

    @model_validator(mode="after")
    def check_day(self) -> "DayHours":
        if self.status != "open":
            # 휴무 · 24시간은 시각이 필요 없다
            self.open = self.close = self.break_start = self.break_end = None
            return self
        if not self.open or not self.close:
            raise ValueError(
                "영업하는 날은 여는 시각과 닫는 시각을 모두 입력해 주세요."
            )
        if self.open == self.close:
            raise ValueError(
                "여는 시각과 닫는 시각이 같아요. 24시간이면 '24시간'을 골라 주세요."
            )
        if bool(self.break_start) != bool(self.break_end):
            raise ValueError("점심시간은 시작과 끝을 모두 입력해 주세요.")
        if self.break_start and self.break_end:
            start, end = _minutes(self.open), _minutes(self.close)
            if end <= start:  # 다음 날 새벽에 닫음
                end += 24 * 60
            bs, be = _minutes(self.break_start), _minutes(self.break_end)
            if bs < start:  # 자정을 넘긴 뒤 시작하는 점심시간
                bs += 24 * 60
            if be <= bs:  # 자정을 넘겨 끝나는 점심시간
                be += 24 * 60
            if not (start < bs < be < end):
                raise ValueError("점심시간은 영업시간 안에 있어야 해요.")
        return self


class SiteSettingsUpdate(BaseModel):
    """None = 바꾸지 않음, "" = 지우기"""

    site_name: str | None = None
    company_name: str | None = None
    phone: str | None = None
    cs_phone: str | None = None
    fax: str | None = None
    email: str | None = None
    postal_code: str | None = None
    address: str | None = None
    address_detail: str | None = None
    hours_weekday: str | None = None
    hours_saturday: str | None = None
    hours_note: str | None = None
    hours_temp_note: str | None = None
    parking: str | None = None
    ceo: str | None = None
    business_number: str | None = None
    mail_order_number: str | None = None
    business_type: str | None = None
    business_item: str | None = None
    privacy_officer: str | None = None
    privacy_email: str | None = None
    copyright: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None
    # {} = 요일별 운영시간 지우기
    weekly_hours: dict[str, DayHours] | None = None
    # [] = 모두 공개
    hidden_fields: list[str] | None = None

    @field_validator("*", mode="before")
    @classmethod
    def strip(cls, v: object) -> object:
        return _blank_to_empty(v)

    @field_validator(*PHONE_FIELDS)
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        if v and (len(v) > 20 or not _PHONE_RE.match(v)):
            raise ValueError("전화번호 형식을 확인해 주세요. (예: 02-1234-5678)")
        return v

    @field_validator(*EMAIL_FIELDS)
    @classmethod
    def check_email(cls, v: str | None) -> str | None:
        if v and (len(v) > 255 or not _EMAIL_RE.match(v)):
            raise ValueError("이메일 형식을 확인해 주세요.")
        return v

    @field_validator("postal_code")
    @classmethod
    def check_postal_code(cls, v: str | None) -> str | None:
        if v and not _POSTAL_RE.match(v):
            raise ValueError("우편번호는 5자리 숫자예요.")
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

    @field_validator("weekly_hours")
    @classmethod
    def check_weekdays(cls, v: dict[str, DayHours] | None) -> dict | None:
        if v is None:
            return None
        unknown = set(v) - set(WEEKDAYS)
        if unknown:
            raise ValueError("요일은 mon ~ sun 으로 보내 주세요.")
        return {day: v[day] for day in WEEKDAYS if day in v}

    @field_validator("hidden_fields")
    @classmethod
    def check_hidden(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        unknown = [k for k in v if k not in PUBLIC_GROUPS]
        if unknown:
            raise ValueError("공개 항목을 다시 골라 주세요.")
        return [k for k in PUBLIC_GROUPS if k in v]


class _SiteInfoFields(BaseModel):
    site_name: str | None = None
    company_name: str | None = None
    phone: str | None = None
    cs_phone: str | None = None
    fax: str | None = None
    email: str | None = None
    postal_code: str | None = None
    address: str | None = None
    address_detail: str | None = None
    hours_weekday: str | None = None
    hours_saturday: str | None = None
    hours_note: str | None = None
    hours_temp_note: str | None = None
    weekly_hours: dict[str, DayHours] | None = None
    parking: str | None = None
    ceo: str | None = None
    business_number: str | None = None
    mail_order_number: str | None = None
    business_type: str | None = None
    business_item: str | None = None
    privacy_officer: str | None = None
    privacy_email: str | None = None
    copyright: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None

    model_config = {"from_attributes": True}


class SiteSettingsResponse(_SiteInfoFields):
    id: uuid.UUID
    tenant_id: uuid.UUID
    hidden_fields: list[str] = Field(default_factory=list)
    updated_at: datetime

    @field_validator("hidden_fields", mode="before")
    @classmethod
    def none_to_list(cls, v: object) -> object:
        return v or []


class PublicSiteSettingsResponse(_SiteInfoFields):
    """홈페이지 공개용 — 내부 id 없이, 숨긴 항목은 None (site_settings.public_view)"""

    # 숨긴 묶음 키 — 값은 없고, 홈페이지가 섹션 값 등으로 대신 채우지 않게 알린다
    hidden_fields: list[str] = Field(default_factory=list)

    # 상단 메뉴 (T-036-B) — 홈페이지가 기본 메뉴 위에 덮어쓴다
    menu_items: list[dict] | None = None


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


# ── 이용약관 · 개인정보처리방침 (T-200) ─────────────────────────────────────

PolicyKind = Literal["terms", "privacy"]


class PolicyDocument(BaseModel):
    """홈페이지에 보이는 문서 — 고친 것이 없으면 기본 문안."""

    kind: PolicyKind
    title: str
    body: str
    is_default: bool
    # 사업체가 마지막으로 고친 시각 — 기본 문안이면 None
    updated_at: datetime | None = None


class PolicyAdminDocument(PolicyDocument):
    # 되돌리기 · 비교용 기본 문안
    default_body: str


class PolicyAdminResponse(BaseModel):
    terms: PolicyAdminDocument
    privacy: PolicyAdminDocument


class PolicyUpdate(BaseModel):
    # None 이나 빈 글은 기본 문안으로 되돌린다
    body: str | None = Field(default=None, max_length=30000)
