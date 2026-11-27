"""독립 콘텐츠 관리 — 유형 · 칸 (T-253, 콘텐츠 관리 기획서 CM-03 · 6장)."""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
)

from app.schemas.board import (
    MAX_FIELD_OPTIONS,
    FieldKey,
    FieldLabel,
    FieldOption,
    PostBody,
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


# ── 항목 (T-254, CM-01 · 02) ──────────────────────────────────────────────

ITEM_TITLE_MAX = 100
ITEM_SUMMARY_MAX = 300
TAG_NAME_MAX = 30
CATEGORY_NAME_MAX = 30
MAX_ITEM_TAGS = 20

ItemStatus = Literal["DRAFT", "PUBLISHED"]
ItemTitle = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=ITEM_TITLE_MAX),
]
TagName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=TAG_NAME_MAX)
]
CategoryName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=CATEGORY_NAME_MAX
    ),
]


class ContentTagRef(BaseModel):
    id: uuid.UUID
    name: str


class ContentItemTypeRef(BaseModel):
    id: uuid.UUID
    type_key: str
    name: str


class ContentItemResponse(BaseModel):
    id: uuid.UUID
    type: ContentItemTypeRef
    category_id: uuid.UUID | None
    category_name: str | None
    title: str
    summary: str
    body: list[dict[str, Any]]
    data: dict[str, Any]
    thumbnail_url: str | None
    status: str
    published_at: datetime | None
    display_order: int
    tags: list[ContentTagRef]
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class ContentItemCounts(BaseModel):
    all: int
    published: int
    draft: int
    trash: int


class ContentItemListResponse(BaseModel):
    items: list[ContentItemResponse]
    total: int
    page: int
    size: int
    counts: ContentItemCounts


class ContentItemCreate(BaseModel):
    """초안은 필수 칸이 비어도 저장, 공개는 필수 칸까지 검사."""

    model_config = ConfigDict(extra="forbid")

    type_id: uuid.UUID
    title: ItemTitle
    summary: str = Field(default="", max_length=ITEM_SUMMARY_MAX)
    body: PostBody = []
    data: dict[str, Any] = {}
    thumbnail_url: str | None = Field(default=None, max_length=500)
    category_id: uuid.UUID | None = None
    # 태그 이름 — 없는 이름은 새로 만든다 (같은 이름은 띄어쓰기 · 대소문자 무시)
    tags: list[TagName] = Field(default=[], max_length=MAX_ITEM_TAGS)
    status: ItemStatus = "DRAFT"


class ContentItemUpdate(BaseModel):
    """보낸 값만 바뀐다. data 는 보낸 칸만, 빈 값은 그 칸을 비운다."""

    model_config = ConfigDict(extra="forbid")

    title: ItemTitle | None = None
    summary: str | None = Field(default=None, max_length=ITEM_SUMMARY_MAX)
    body: PostBody | None = None
    data: dict[str, Any] | None = None
    thumbnail_url: str | None = Field(default=None, max_length=500)
    category_id: uuid.UUID | None = None
    tags: list[TagName] | None = Field(default=None, max_length=MAX_ITEM_TAGS)
    status: ItemStatus | None = None


class ContentItemBulk(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ids: list[uuid.UUID] = Field(min_length=1, max_length=200)
    action: Literal["publish", "draft", "trash", "restore"]


class ContentItemBulkResult(BaseModel):
    changed: int
    # 공개하려 했지만 필수 칸이 비어 그대로 둔 항목
    skipped: list[uuid.UUID] = []


class ContentItemOrderUpdate(BaseModel):
    type_id: uuid.UUID
    ids: list[uuid.UUID] = Field(min_length=1, max_length=1000)


# ── 카테고리 · 태그 (T-254, CM-05) ────────────────────────────────────────


class ContentCategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    parent_id: uuid.UUID | None
    display_order: int
    item_count: int = 0
    children: list["ContentCategoryResponse"] = []


class ContentCategoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: CategoryName
    parent_id: uuid.UUID | None = None


class ContentCategoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: CategoryName | None = None


class ContentCategoryTreeNode(BaseModel):
    id: uuid.UUID
    parent_id: uuid.UUID | None = None


class ContentCategoryTreeUpdate(BaseModel):
    """트리 전체 — 목록 순서가 순서, parent_id 로 2단계."""

    model_config = ConfigDict(extra="forbid")

    nodes: list[ContentCategoryTreeNode] = Field(max_length=500)


class ContentTagResponse(BaseModel):
    id: uuid.UUID
    name: str
    item_count: int = 0


class ContentTagInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: TagName


class ContentTagMerge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)
    target_id: uuid.UUID
