"""게시판 · 게시글 스키마 (T-139, 게시판 모듈 기획서 8 · 9장)."""

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
)

from app.schemas.rich_body import clean_body

PostStatus = Literal["DRAFT", "PUBLISHED", "PRIVATE"]

SLUG_MAX_LENGTH = 60
BoardType = Literal["LIST", "GALLERY", "FAQ", "CARD"]
BoardStatus = Literal["ACTIVE", "INACTIVE"]
BoardSortOrder = Literal["LATEST", "OLDEST", "TITLE"]
BoardPageSize = Literal[10, 20, 30]
BoardName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]
# 영문 소문자 · 숫자 · 하이픈 — 홈페이지 주소에 들어간다
BoardSlug = Annotated[
    str,
    StringConstraints(
        min_length=2, max_length=SLUG_MAX_LENGTH, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$"
    ),
]
PostTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]


# Tiptap 노드 목록 (이전 p · ul · image 도 받음) — 허용 목록 검사는 schemas/rich_body.py
BodyNode = dict[str, Any]
PostBody = Annotated[list[Any], AfterValidator(clean_body)]


class BoardDesign(BaseModel):
    """게시판 디자인 (BM-08, T-148) — 유형에 맞는 값만 화면에 쓴다."""

    model_config = ConfigDict(extra="forbid")

    columns: Literal[2, 3, 4] = 3
    image_ratio: Literal["1:1", "4:3", "16:9"] = "4:3"
    show_date: bool = True
    show_image: bool = True
    show_summary: bool = True
    faq_single_open: bool = False
    faq_first_open: bool = False


class BoardCreate(BaseModel):
    name: BoardName
    # 비우면 서버가 board-1 처럼 만든다 — 한글 이름은 주소로 쓰기 어렵다
    slug: BoardSlug | None = None
    description: str = Field(default="", max_length=200)
    board_type: BoardType = "LIST"
    status: BoardStatus = "ACTIVE"
    # 끄면 만들어 두기만 하고 상단 메뉴에는 숨긴다 (코드형 템플릿)
    in_menu: bool = True


class BoardUpdate(BaseModel):
    name: BoardName | None = None
    slug: BoardSlug | None = None
    description: str | None = Field(default=None, max_length=200)
    board_type: BoardType | None = None
    status: BoardStatus | None = None
    sort_order: BoardSortOrder | None = None
    # null 이면 유형별 기본값 (목록 10 · 갤러리 12 · FAQ 20)
    page_size: BoardPageSize | None = None
    seo_title: str | None = Field(default=None, max_length=60)
    seo_description: str | None = Field(default=None, max_length=160)
    seo_index: bool | None = None
    design: BoardDesign | None = None


class BoardResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: str
    board_type: str
    status: str
    system_key: str | None
    post_count: int
    # 공지 · 메인 최신 공지에 아직 샘플 글이 보이는지
    has_samples: bool
    deleted_at: datetime | None
    sort_order: str
    page_size: int | None
    seo_title: str
    seo_description: str
    seo_index: bool
    design: BoardDesign


class BoardRestoreResponse(BaseModel):
    board: BoardResponse
    # 원래 주소를 다른 게시판이 쓰고 있어 번호를 붙였는지
    slug_changed: bool


class BoardLimitsResponse(BaseModel):
    plan: str
    # None 은 제한 없음
    limit: int | None
    used: int
    can_create: bool
    reason: str | None


# ── 필드 (T-142-A) ───────────────────────────────────────────────────────

FieldType = Literal[
    "TEXT",
    "TEXTAREA",
    "NUMBER",
    "DATE",
    "SELECT",
    "MULTI_SELECT",
    "BOOLEAN",
    "RATING",
    "IMAGE",
    "PHONE",
    "EMAIL",
    "URL",
]
FieldKey = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{1,49}$")]
FieldLabel = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)
]
MAX_FIELD_OPTIONS = 50
MSG_DUPLICATE_OPTION = "같은 선택지가 두 번 들어 있습니다."


class FieldOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=100)


def _unique_options(options: list[FieldOption] | None) -> list[FieldOption] | None:
    if options and len({o.value for o in options}) != len(options):
        raise ValueError(MSG_DUPLICATE_OPTION)
    return options


class FieldCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: FieldLabel
    field_type: FieldType
    # 비우면 서버가 field_1 처럼 만든다. 만든 뒤에는 바꿀 수 없다
    field_key: FieldKey | None = None
    is_required: bool = False
    is_visible: bool = True
    help_text: str = Field(default="", max_length=200)
    placeholder: str = Field(default="", max_length=100)
    default_value: Any = None
    options: list[FieldOption] | None = Field(
        default=None, max_length=MAX_FIELD_OPTIONS
    )
    min: float | None = None
    max: float | None = None
    # 관리자 글 목록에 값을 보여 줄지 (T-147)
    show_in_list: bool = False

    @field_validator("options")
    @classmethod
    def _options(cls, value: list[FieldOption] | None) -> list[FieldOption] | None:
        return _unique_options(value)


class FieldUpdate(BaseModel):
    # field_key 는 받지 않는다 — 보내면 검증 오류 (기획서 8.4)
    model_config = ConfigDict(extra="forbid")

    label: FieldLabel | None = None
    field_type: FieldType | None = None
    is_required: bool | None = None
    is_visible: bool | None = None
    help_text: str | None = Field(default=None, max_length=200)
    placeholder: str | None = Field(default=None, max_length=100)
    default_value: Any = None
    options: list[FieldOption] | None = Field(
        default=None, max_length=MAX_FIELD_OPTIONS
    )
    min: float | None = None
    max: float | None = None
    show_in_list: bool | None = None

    @field_validator("options")
    @classmethod
    def _options(cls, value: list[FieldOption] | None) -> list[FieldOption] | None:
        return _unique_options(value)


class FieldOrderRequest(BaseModel):
    field_ids: list[UUID] = Field(min_length=1, max_length=100)


class FieldResponse(BaseModel):
    id: UUID
    board_id: UUID
    field_key: str
    label: str
    field_type: str
    is_required: bool
    is_visible: bool
    help_text: str
    placeholder: str
    default_value: Any
    options: list[FieldOption]
    min: float | None
    max: float | None
    show_in_list: bool = False
    display_order: int
    deleted_at: datetime | None
    # 값이 있는 글 수 (휴지통 글 포함) — 목록에서만, 삭제 · 유형 변경 안내용
    value_count: int = 0


class PostCreate(BaseModel):
    title: PostTitle
    body: PostBody = []
    status: PostStatus = "DRAFT"
    is_pinned: bool = False
    # 필드 값 {field_key: 값} — 서버가 필드 정의로 검사한다
    custom_data: dict[str, Any] | None = None


class PostUpdate(BaseModel):
    title: PostTitle | None = None
    body: PostBody | None = None
    status: PostStatus | None = None
    is_pinned: bool | None = None
    # 보낸 칸만 바뀐다. 빈 값은 그 칸을 비운다
    custom_data: dict[str, Any] | None = None


class PostListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    board_id: UUID
    title: str
    status: str
    is_pinned: bool
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    custom_data: dict[str, Any]


class PostResponse(PostListItem):
    body: list[BodyNode]


class PostListResponse(BaseModel):
    total: int
    page: int
    size: int
    items: list[PostListItem]


class PostOverviewItem(PostListItem):
    """전체 글 목록 한 줄 (BM-05, T-140-C)."""

    board_name: str


class PostOverviewListResponse(BaseModel):
    total: int
    page: int
    size: int
    items: list[PostOverviewItem]


PostBulkAction = Literal["PUBLISH", "PRIVATE", "TRASH", "RESTORE"]


class PostBulkRequest(BaseModel):
    post_ids: list[UUID] = Field(min_length=1, max_length=100)
    action: PostBulkAction


class PostBulkResponse(BaseModel):
    updated: int


class PublicSitemapPost(BaseModel):
    """사이트맵 한 줄 (T-140-C) — 공개 글 주소를 만드는 값만."""

    board_slug: str
    is_system: bool
    id: UUID
    updated_at: datetime


class PublicBoardResponse(BaseModel):
    """홈페이지 메뉴 · 게시판 화면 (T-140-B) — 사용 중인 새 게시판만."""

    id: UUID
    name: str
    slug: str
    description: str
    board_type: str
    page_size: int | None
    seo_title: str
    seo_description: str
    seo_index: bool
    design: BoardDesign


class PublicFieldValue(BaseModel):
    """글 상세에 보여 줄 칸 (T-142-B-2) — 선택지는 고객이 정한 이름으로."""

    key: str
    label: str
    field_type: str
    value: Any


class PublicPostItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    is_pinned: bool
    published_at: datetime
    # 갤러리 썸네일 — 본문의 첫 사진
    thumbnail: str | None = None
    # FAQ 는 목록에서 답변을 펼치므로 본문까지, 그 밖에는 없음
    body: list[BodyNode] | None = None
    # 카드형만 — 본문 앞부분 글자, 글 목록에 표시로 고른 칸
    summary: str | None = None
    card_fields: list[PublicFieldValue] | None = None


class PublicPostListResponse(BaseModel):
    total: int
    page: int
    size: int
    # 검색과 관계없이 공개 글이 하나라도 있는지 — 없으면 화면이 샘플을 보여 준다
    has_posts: bool
    items: list[PublicPostItem]


class PublicPostDetail(PublicPostItem):
    body: list[BodyNode]
    # 홈페이지에 표시하는 칸 중 값이 있는 것만, 정한 순서대로
    fields: list[PublicFieldValue] = []
    prev_id: UUID | None
    next_id: UUID | None
