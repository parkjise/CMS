"""게시판 · 게시글 스키마 (T-139, 게시판 모듈 기획서 8 · 9장)."""

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
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


ColumnSize = Literal["narrow", "normal", "wide"]


class BoardColumnLayout(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{1,49}$")]
    size: ColumnSize = "normal"


class BoardDesign(BaseModel):
    """게시판 디자인 (BM-08, T-148) — 유형에 맞는 값만 화면에 쓴다."""

    model_config = ConfigDict(extra="forbid")

    columns: Literal[2, 3, 4] = 3
    image_ratio: Literal["1:1", "4:3", "16:9"] = "4:3"
    list_layout: Literal["inline", "columns"] = "inline"
    list_column_layout: list[BoardColumnLayout] = Field(
        default_factory=list, max_length=20
    )
    show_date: bool = True
    show_image: bool = True
    show_summary: bool = True
    faq_single_open: bool = False
    faq_first_open: bool = False

    @model_validator(mode="after")
    def unique_columns(self) -> "BoardDesign":
        keys = [column.key for column in self.list_column_layout]
        if len(keys) != len(set(keys)):
            raise ValueError("같은 열을 중복 지정할 수 없습니다.")
        return self


BoardReadAccess = Literal["PUBLIC", "MEMBER"]
# MEMBER — 로그인한 방문자 회원도 홈페이지에서 쓴다 (T-150-B)
BoardWriteAccess = Literal["ADMIN", "MEMBER"]


class BoardPermissions(BaseModel):
    """게시판 권한 (BM-10, T-150) — 서버가 공개 API 에서 강제한다."""

    model_config = ConfigDict(extra="forbid")

    read: BoardReadAccess = "PUBLIC"
    write: BoardWriteAccess = "ADMIN"


class BoardOperation(BaseModel):
    """운영 설정 (BM-11, T-151-A)."""

    model_config = ConfigDict(extra="forbid")

    # 회원이 비밀글을 쓸 수 있는지 — 꺼도 이미 쓴 비밀글은 그대로 비밀
    allow_secret: bool = False
    # 회원이 새 글을 쓰면 관리자 화면에 실시간 알림
    notify_new_post: bool = False
    # 비로그인 방문자도 이름 · 글 비밀번호로 쓴다 (T-151-B) — 회원 글쓰기 게시판만
    allow_guest: bool = False
    # 처리 안 된 신고가 이 수가 되면 자동 비공개 (T-175). 0 은 자동으로 숨기지 않음.
    # 3 이면 서로 다른 IP 3곳으로 아무 글이나 숨길 수 있어 기본은 5
    report_hide_count: Literal[0, 3, 5, 10] = 5


class BoardCreate(BaseModel):
    name: BoardName
    # 비우면 서버가 board-1 처럼 만든다 — 한글 이름은 주소로 쓰기 어렵다
    slug: BoardSlug | None = None
    description: str = Field(default="", max_length=200)
    board_type: BoardType = "LIST"
    status: BoardStatus = "ACTIVE"
    # 끄면 만들어 두기만 하고 상단 메뉴에는 숨긴다 (코드형 템플릿)
    in_menu: bool = True
    # 함께 만들 추천 칸 키 — 유형마다 정해진 것만 (T-183, GET /boards/presets)
    preset_fields: list[str] = Field(default_factory=list, max_length=20)


class BoardPresetField(BaseModel):
    """새 게시판 추천 칸 (T-183)."""

    key: str
    label: str
    field_type: str
    choices: list[str]
    show_in_list: bool


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
    permissions: BoardPermissions | None = None
    operation: BoardOperation | None = None


class BoardResponse(BaseModel):
    updated_at: datetime
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
    permissions: BoardPermissions
    operation: BoardOperation


class BoardRestoreResponse(BaseModel):
    board: BoardResponse
    # 원래 주소를 다른 게시판이 쓰고 있어 번호를 붙였는지
    slug_changed: bool


class PermissionOptionsResponse(BaseModel):
    """권한 탭 — 고를 수 없는 값과 이유 (T-150-B). None 이면 고를 수 있다."""

    member_read_blocked: str | None
    member_write_blocked: str | None


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


class ChoiceRemapRequest(BaseModel):
    """쓰고 있는 선택지를 옮긴다 (T-180) — target 이 null 이면 값을 비운다."""

    model_config = ConfigDict(extra="forbid")

    source: str = Field(min_length=1, max_length=100)
    target: str | None = Field(default=None, min_length=1, max_length=100)


class ChoiceRemapResponse(BaseModel):
    moved: int


class FieldConvertPreviewRequest(BaseModel):
    """값이 있는 칸의 유형 바꾸기 미리보기 (T-182)."""

    model_config = ConfigDict(extra="forbid")

    field_type: FieldType


class FieldConvertRequest(FieldConvertPreviewRequest):
    # 바꿀 수 없는 글의 값을 비우고 진행 — False 면 하나라도 있으면 409
    clear_failed: bool = False


class FieldConvertSample(BaseModel):
    post_id: UUID
    title: str
    before: str
    after: str


class FieldConvertFailure(BaseModel):
    post_id: UUID
    title: str
    before: str
    reason: str


class FieldConvertPreview(BaseModel):
    field_type: str
    total: int
    convertible: int
    failed: int
    samples: list[FieldConvertSample]
    # 앞에서부터 20개까지
    failures: list[FieldConvertFailure]
    # 선택지 칸으로 바꾸면 쓰게 될 선택지
    choices: list[FieldOption]
    default_value_kept: bool


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
    # 선택지마다 그 값을 쓰는 글 수 (휴지통 글 포함) — 목록에서만, 옮기기 안내용 (T-180)
    choice_counts: dict[str, int] = {}


class FieldConvertResult(BaseModel):
    converted: int
    cleared: int
    field: FieldResponse


# ── 카테고리 (T-149) ─────────────────────────────────────────────────────

CategoryName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)
]


class CategoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: CategoryName
    is_active: bool = True
    # 상위 분류 — 없으면 1단계 (T-179)
    parent_id: UUID | None = None


class CategoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: CategoryName | None = None
    is_active: bool | None = None
    # 보내면 상위 분류를 바꾼다 — null 이면 1단계로 (T-179)
    parent_id: UUID | None = None


class CategoryOrderRequest(BaseModel):
    category_ids: list[UUID] = Field(min_length=1, max_length=100)


class CategoryMergeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_ids: list[UUID] = Field(min_length=2, max_length=29)
    target_id: UUID

    @model_validator(mode="after")
    def _distinct_categories(self) -> "CategoryMergeRequest":
        if len(set(self.source_ids)) != len(self.source_ids):
            raise ValueError("합칠 원본 카테고리가 중복되었습니다.")
        if self.target_id in self.source_ids:
            raise ValueError("합칠 대상은 원본 카테고리와 달라야 합니다.")
        return self


class CategoryMergeResponse(BaseModel):
    merged: int
    moved: int


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    board_id: UUID
    name: str
    is_active: bool
    display_order: int
    parent_id: UUID | None = None
    # 이 분류의 글 수 (휴지통 글 제외) — 목록에서만
    post_count: int = 0


class PublicCategory(BaseModel):
    """홈페이지 분류 탭 — 사용 중인 분류만. 하위 분류는 parent_id 가 있다 (T-179)."""

    id: UUID
    name: str
    parent_id: UUID | None = None


class PostCreate(BaseModel):
    title: PostTitle
    body: PostBody = []
    status: PostStatus = "DRAFT"
    is_pinned: bool = False
    is_secret: bool = False
    category_id: UUID | None = None
    # 필드 값 {field_key: 값} — 서버가 필드 정의로 검사한다
    custom_data: dict[str, Any] | None = None
    # 예약 공개 (T-189) — 공개 글만, 지금보다 뒤 시각. 없으면 바로 공개
    published_at: AwareDatetime | None = None


class PostUpdate(BaseModel):
    title: PostTitle | None = None
    body: PostBody | None = None
    status: PostStatus | None = None
    is_pinned: bool | None = None
    is_secret: bool | None = None
    # 보내면 바뀐다 — null 은 분류 없음
    category_id: UUID | None = None
    # 보낸 칸만 바뀐다. 빈 값은 그 칸을 비운다
    custom_data: dict[str, Any] | None = None
    # 보내면 바뀐다 — null 은 예약을 풀고 바로 공개 (T-189)
    published_at: AwareDatetime | None = None


class PostListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    board_id: UUID
    title: str
    status: str
    is_pinned: bool
    is_secret: bool = False
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    custom_data: dict[str, Any]
    category_id: UUID | None = None
    # 홈페이지에서 쓴 회원 (T-150-B) — 관리자 글은 None
    author_member_id: UUID | None = None
    author_member_name: str | None = None
    # 비회원 글의 이름 (T-151-B)
    guest_name: str | None = None


class PostResponse(PostListItem):
    body: list[BodyNode]


class PostVersionItem(BaseModel):
    """글의 이전 버전 한 줄 (T-191) — 고치기 직전 내용."""

    id: UUID
    title: str
    status: str
    # 이 내용이 저장돼 있던 시각 · 다른 내용으로 바뀐 시각 · 바꾼 관리자 이메일
    saved_at: datetime
    replaced_at: datetime
    editor: str


class PostVersionDetail(PostVersionItem):
    body: list[BodyNode]
    custom_data: dict[str, Any]
    category_id: UUID | None
    is_pinned: bool
    is_secret: bool


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


class PostMoveRequest(BaseModel):
    """다른 게시판으로 글 옮기기 (T-184) — 분류는 받을 게시판의 것, 없으면 분류 없음."""

    post_ids: list[UUID] = Field(min_length=1, max_length=100)
    target_board_id: UUID
    category_id: UUID | None = None


class PostMoveFieldCount(BaseModel):
    label: str
    posts: int


class PostMoveBlocked(BaseModel):
    post_id: UUID
    title: str
    reason: str


class PostMovePreview(BaseModel):
    posts: int
    target_name: str
    # 값이 따라가는 칸 · 받을 게시판에 맞는 칸이 없어 빠지는 칸 (칸 이름별 글 수)
    carried: list[PostMoveFieldCount]
    dropped: list[PostMoveFieldCount]
    blocked_count: int
    # 앞에서부터 20개까지
    blocked: list[PostMoveBlocked]


class PostMoveResult(BaseModel):
    moved: int
    values_dropped: int


class PublicPostLocation(BaseModel):
    """옮긴 글의 지금 게시판 (T-184) — 예전 주소를 새 주소로 보낸다."""

    board_slug: str
    is_system: bool


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
    # 회원만 읽기면 MEMBER — 홈페이지가 로그인 뒤 브라우저에서 글을 읽는다 (T-150)
    read_access: BoardReadAccess = "PUBLIC"
    # 회원도 쓰면 MEMBER — 홈페이지에 회원 글쓰기 버튼 (T-150-B)
    write_access: BoardWriteAccess = "ADMIN"
    # 회원 글쓰기 폼에 비밀글 체크 (T-151-A)
    allow_secret: bool = False
    # 비회원 글쓰기 (T-151-B)
    allow_guest: bool = False
    # 사용 중인 분류, 정한 순서대로 (T-149) — 없으면 탭을 그리지 않는다
    categories: list[PublicCategory] = []


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
    # 비밀글이면 제목만 — 요약 · 사진 · 본문 · 칸은 비운다 (T-151-A)
    is_secret: bool = False
    # 비회원 글 — 글 비밀번호로 고치거나 지우고, 비밀글이면 비밀번호로 연다 (T-151-B)
    is_guest: bool = False
    # 갤러리 썸네일 — 본문의 첫 사진
    thumbnail: str | None = None
    # FAQ 는 목록에서 답변을 펼치므로 본문까지, 그 밖에는 없음
    body: list[BodyNode] | None = None
    # 카드형만 — 본문 앞부분 글자, 글 목록에 표시로 고른 칸
    summary: str | None = None
    card_fields: list[PublicFieldValue] | None = None
    # 목록형 · 갤러리 · FAQ의 제목/질문 아래에 표시할 칸 (T-160)
    list_fields: list[PublicFieldValue] | None = None
    category_id: UUID | None = None


class PublicListColumn(BaseModel):
    key: str
    label: str
    field_type: str
    size: ColumnSize = "normal"


class PublicPostListResponse(BaseModel):
    list_columns: list[PublicListColumn] | None = None
    total: int
    page: int
    size: int
    # 검색과 관계없이 공개 글이 하나라도 있는지 — 없으면 화면이 샘플을 보여 준다
    has_posts: bool
    items: list[PublicPostItem]


class PublicPostDetail(PublicPostItem):
    body: list[BodyNode]
    # 비밀글인데 작성 회원이 아니면 True — 본문 · 칸 없이 제목만 (T-151-A)
    locked: bool = False
    # 홈페이지에 표시하는 칸 중 값이 있는 것만, 정한 순서대로
    fields: list[PublicFieldValue] = []
    prev_id: UUID | None
    next_id: UUID | None


# ── 회원 글쓰기 (T-150-B) ────────────────────────────────────────────────

# 서버가 문단 노드로 바꾼다 — 서식 · 링크 · 사진은 받지 않는다
MemberPostContent = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)
]


class MemberPostCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: PostTitle
    content: MemberPostContent
    category_id: UUID | None = None
    is_secret: bool = False


class MemberPostUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: PostTitle | None = None
    content: MemberPostContent | None = None
    # 보내면 바뀐다 — null 은 분류 없음
    category_id: UUID | None = None
    is_secret: bool | None = None


class MemberPostResponse(BaseModel):
    """회원이 쓴 글 — 고치기 화면 · 저장 결과."""

    id: UUID
    title: str
    content: str
    category_id: UUID | None
    is_secret: bool = False


# ── 비회원 글쓰기 · 신고 (T-151-B) ──────────────────────────────────────

GuestName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)
]
GuestPassword = Annotated[str, StringConstraints(min_length=4, max_length=50)]


class GuestPostCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: GuestName
    password: GuestPassword
    title: PostTitle
    content: MemberPostContent
    category_id: UUID | None = None
    is_secret: bool = False
    # 개인정보 수집 · 이용 동의 — 반드시 true
    agree: Literal[True]
    recaptcha_token: str | None = Field(default=None, max_length=4000)


class GuestPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: GuestPassword


class GuestPostUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: GuestPassword
    title: PostTitle | None = None
    content: MemberPostContent | None = None
    category_id: UUID | None = None
    is_secret: bool | None = None


class GuestPostResponse(MemberPostResponse):
    """비밀번호를 확인한 비회원 글 — 고치기 값과 상세 본문."""

    guest_name: str
    body: list[BodyNode]
    fields: list[PublicFieldValue] = []


ReportReason = Literal["SPAM", "ABUSE", "PRIVACY", "OTHER"]


class ReportCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: ReportReason
    detail: str = Field(default="", max_length=200)


class ReportedPostItem(BaseModel):
    """신고된 글 한 줄 — 처리하지 않은 신고만 센다."""

    post_id: UUID
    board_id: UUID
    board_name: str
    title: str
    status: str
    deleted: bool
    report_count: int
    reasons: dict[str, int]
    # 신고자가 적은 설명 (최근 것부터, 비어 있지 않은 것만)
    details: list[str]
    latest_at: datetime


ReportAction = Literal["DISMISS", "PUBLISH", "HIDE", "DELETE"]


class ReportResolveRequest(BaseModel):
    action: ReportAction
