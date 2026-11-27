"""독립 콘텐츠 관리 — 유형 · 칸 (T-253, 콘텐츠 관리 기획서 CM-03 · 6장)."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.board import (
    MAX_FIELD_OPTIONS,
    FieldKey,
    FieldLabel,
    FieldOption,
    _unique_options,
)

TYPE_NAME_MAX = 40
TYPE_DESCRIPTION_MAX = 200

# 게시판 칸 종류에서 별점(리뷰형 게시판 전용)만 뺀다
ContentFieldType = Literal[
    "TEXT",
    "TEXTAREA",
    "NUMBER",
    "DATE",
    "SELECT",
    "MULTI_SELECT",
    "BOOLEAN",
    "IMAGE",
    "PHONE",
    "EMAIL",
    "URL",
]


def _strip(value: str | None) -> str | None:
    return value.strip() if isinstance(value, str) else value


class ContentFieldResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    field_key: str
    label: str
    field_type: str
    is_required: bool
    help_text: str
    placeholder: str
    default_value: Any
    field_options: dict[str, Any]
    display_order: int


class ContentTypeResponse(BaseModel):
    id: uuid.UUID
    type_key: str
    name: str
    description: str
    preset_key: str | None
    display_order: int
    fields: list[ContentFieldResponse] = []
    item_count: int = 0
    published_count: int = 0
    updated_at: datetime
    deleted_at: datetime | None = None


class ContentTypeLimits(BaseModel):
    plan: str
    # None = 제한 없음
    limit: int | None
    used: int
    can_create: bool
    reason: str | None


class ContentPresetResponse(BaseModel):
    key: str
    name: str
    description: str
    fields: list[str]


class ContentTypeListResponse(BaseModel):
    enabled: bool
    types: list[ContentTypeResponse]
    trash: list[ContentTypeResponse]
    limits: ContentTypeLimits
    presets: list[ContentPresetResponse]


class ContentTypeCreate(BaseModel):
    """빈 유형은 이름 · 키 필수, 시작용 유형은 비우면 그 이름 · 키."""

    model_config = ConfigDict(extra="forbid")

    preset_key: str | None = Field(default=None, max_length=30)
    name: str | None = Field(default=None, max_length=TYPE_NAME_MAX)
    type_key: str | None = Field(default=None, max_length=100)
    description: str = Field(default="", max_length=TYPE_DESCRIPTION_MAX)

    _strip_text = field_validator("name", "type_key", "description")(_strip)


class ContentTypeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=TYPE_NAME_MAX)
    type_key: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=TYPE_DESCRIPTION_MAX)

    _strip_text = field_validator("name", "type_key", "description")(_strip)


class ContentFieldInput(BaseModel):
    """칸 전체 저장의 한 줄 — id 가 있으면 있던 칸, 없으면 새 칸."""

    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID | None = None
    # 비우면 서버가 field_1 처럼 만든다. 있던 칸은 바꿀 수 없다
    field_key: FieldKey | None = None
    label: FieldLabel
    field_type: ContentFieldType
    is_required: bool = False
    help_text: str = Field(default="", max_length=200)
    placeholder: str = Field(default="", max_length=100)
    default_value: Any = None
    options: list[FieldOption] | None = Field(
        default=None, max_length=MAX_FIELD_OPTIONS
    )
    min: float | None = None
    max: float | None = None

    @field_validator("options")
    @classmethod
    def _options(cls, value: list[FieldOption] | None) -> list[FieldOption] | None:
        return _unique_options(value)


class ContentFieldsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fields: list[ContentFieldInput] = Field(max_length=100)


class ContentTypeOrderUpdate(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
