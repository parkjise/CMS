"""게시판 · 게시글 스키마 (T-139, 게시판 모듈 기획서 8 · 9장)."""

import re
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

PostStatus = Literal["DRAFT", "PUBLISHED", "PRIVATE"]

MAX_BLOCKS = 100
MSG_INVALID_IMAGE_URL = "사진 주소가 올바르지 않습니다."

# http(s) 또는 사이트 안 경로만 — javascript: · data: · //다른사이트 차단
_SAFE_IMAGE_URL = re.compile(r"^(https?://|/(?!/))", re.IGNORECASE)

PostTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]


class _Block(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ParagraphBlock(_Block):
    type: Literal["p"]
    text: str = Field(max_length=5000)


class ListBlock(_Block):
    type: Literal["ul"]
    items: list[Annotated[str, StringConstraints(max_length=500)]] = Field(
        min_length=1, max_length=50
    )


class ImageBlock(_Block):
    type: Literal["image"]
    src: str = Field(min_length=1, max_length=500)
    alt: str = Field(default="", max_length=200)

    @field_validator("src")
    @classmethod
    def _safe_src(cls, value: str) -> str:
        if not _SAFE_IMAGE_URL.match(value):
            raise ValueError(MSG_INVALID_IMAGE_URL)
        return value


BodyBlock = Annotated[
    ParagraphBlock | ListBlock | ImageBlock, Field(discriminator="type")
]
PostBody = Annotated[list[BodyBlock], Field(max_length=MAX_BLOCKS)]


class BoardResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    board_type: str
    status: str
    system_key: str | None
    post_count: int
    # 공지 · 메인 최신 공지에 아직 샘플 글이 보이는지
    has_samples: bool


class PostCreate(BaseModel):
    title: PostTitle
    body: PostBody = []
    status: PostStatus = "DRAFT"
    is_pinned: bool = False


class PostUpdate(BaseModel):
    title: PostTitle | None = None
    body: PostBody | None = None
    status: PostStatus | None = None
    is_pinned: bool | None = None


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


class PostResponse(PostListItem):
    body: list[BodyBlock]


class PostListResponse(BaseModel):
    total: int
    page: int
    size: int
    items: list[PostListItem]


class PublicPostItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    is_pinned: bool
    published_at: datetime


class PublicPostListResponse(BaseModel):
    total: int
    page: int
    size: int
    # 검색과 관계없이 공개 글이 하나라도 있는지 — 없으면 화면이 샘플을 보여 준다
    has_posts: bool
    items: list[PublicPostItem]


class PublicPostDetail(PublicPostItem):
    body: list[BodyBlock]
    prev_id: UUID | None
    next_id: UUID | None
