"""T-208 슈퍼 어드민 템플릿 관리 (상위 기획서 14.1 · 10.2 #12)."""

import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.super_tenant import TemplateType

TemplatePlan = Literal["FREE", "BASIC", "STANDARD", "PREMIUM"]

# 홈페이지가 :root 에 그대로 넣는 값 — 키는 영소문자, 값은 CSS 를 끊는 글자 금지
_CSS_KEY = re.compile(r"^[a-z][a-z0-9_-]{0,39}$")
_CSS_UNSAFE = re.compile(r"[;{}<>\\]|/\*|url\(|expression\(", re.IGNORECASE)
CSS_MAX_KEYS = 40
CSS_MAX_VALUE = 100
# 썸네일 — 홈페이지 public 경로(/templates/...) 또는 http(s) 주소
_THUMB = re.compile(r"^(https?://|/)[^\s<>\"']{1,490}$")


def _clean_css(value: dict[str, str] | None) -> dict[str, str] | None:
    if value is None:
        return None
    if len(value) > CSS_MAX_KEYS:
        raise ValueError(f"색 · 글꼴 값은 {CSS_MAX_KEYS}개까지입니다.")
    cleaned: dict[str, str] = {}
    for key, raw in value.items():
        if not _CSS_KEY.match(key):
            raise ValueError(f"'{key}' 는 쓸 수 없는 이름입니다.")
        v = str(raw).strip()
        if not v or len(v) > CSS_MAX_VALUE or _CSS_UNSAFE.search(v):
            raise ValueError(f"'{key}' 값이 올바르지 않습니다.")
        cleaned[key] = v
    return cleaned


def _clean_thumb(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if value and not _THUMB.match(value):
        raise ValueError("썸네일은 /templates/... 또는 http(s) 주소여야 합니다.")
    return value or None


class SuperTemplateItem(BaseModel):
    id: uuid.UUID
    template_type: str
    code: str | None
    renderer: str
    version: str
    name: str
    description: str | None
    thumbnail_url: str | None
    css_variables: dict
    is_active: bool
    min_plan: str
    created_at: datetime
    updated_at: datetime
    # 지금 이 템플릿을 쓰는 사업체 수 (적용 기록 기준, 삭제 · 파기 제외)
    usage_count: int = 0

    model_config = {"from_attributes": True}


class SuperTemplateCreate(BaseModel):
    """새 테마형 템플릿 — 코드형은 홈페이지 코드 배포가 필요해 여기서 만들지 않는다."""

    name: str = Field(..., min_length=1, max_length=100)
    template_type: TemplateType = "GENERAL"
    description: str | None = Field(None, max_length=500)
    thumbnail_url: str | None = None
    min_plan: TemplatePlan = "BASIC"
    # 색 · 글꼴을 가져올 테마형 템플릿 — 없으면 css_variables 를 그대로
    base_template_id: uuid.UUID | None = None
    css_variables: dict[str, str] | None = None
    # 처음엔 숨김 — 확인한 뒤 공개
    is_active: bool = False

    @field_validator("css_variables")
    @classmethod
    def _css(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        return _clean_css(v)

    @field_validator("thumbnail_url")
    @classmethod
    def _thumb(cls, v: str | None) -> str | None:
        return _clean_thumb(v)


class SuperTemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    thumbnail_url: str | None = None
    min_plan: TemplatePlan | None = None
    is_active: bool | None = None
    # 테마형만 — 코드형은 템플릿 코드가 화면을 그린다
    css_variables: dict[str, str] | None = None

    @field_validator("css_variables")
    @classmethod
    def _css(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        return _clean_css(v)

    @field_validator("thumbnail_url")
    @classmethod
    def _thumb(cls, v: str | None) -> str | None:
        return _clean_thumb(v)
