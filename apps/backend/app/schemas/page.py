"""페이지 관리 (T-237, 페이지 관리 기획서 PM-01 · PM-02 · PART C 2번)."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

TITLE_MAX = 30
SEO_TITLE_MAX = 60
SEO_DESCRIPTION_MAX = 160


def _strip(value: str | None) -> str | None:
    return value.strip() if isinstance(value, str) else value


class PageResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    page_key: str
    title: str
    # TEMPLATE | CUSTOM
    origin: str
    parent_key: str | None
    show_in_menu: bool
    is_public: bool
    display_order: int
    seo_title: str | None
    seo_description: str | None
    og_image_url: str | None
    noindex: bool
    section_count: int = 0
    updated_at: datetime
    deleted_at: datetime | None = None


class PageLimits(BaseModel):
    plan: str
    # None = 제한 없음
    limit: int | None
    used: int
    can_create: bool
    reason: str | None = None


class PageListResponse(BaseModel):
    # CUSTOM_PAGES 스위치 — 꺼져 있으면 목록만 보이고 추가 · 수정은 403
    enabled: bool
    pages: list[PageResponse]
    # 휴지통 — 직접 만든 페이지만
    trash: list[PageResponse]
    limits: PageLimits


class _PageFields(BaseModel):
    parent_key: str | None = Field(default=None, max_length=50)
    show_in_menu: bool | None = None
    is_public: bool | None = None
    seo_title: str | None = Field(default=None, max_length=SEO_TITLE_MAX)
    seo_description: str | None = Field(default=None, max_length=SEO_DESCRIPTION_MAX)
    og_image_url: str | None = Field(default=None, max_length=500)
    noindex: bool | None = None

    @field_validator("seo_title", "seo_description", "og_image_url", "parent_key")
    @classmethod
    def _strip_text(cls, value: str | None) -> str | None:
        return _strip(value)


class PageCreate(_PageFields):
    title: str = Field(..., max_length=TITLE_MAX)
    page_key: str = Field(..., max_length=50)
    # 추천 구성 (T-247) — GET /pages/recipes 의 key, 없으면 빈 페이지
    recipe: str | None = Field(default=None, max_length=50)

    @field_validator("title")
    @classmethod
    def _title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("페이지 이름을 입력해 주세요.")
        return value

    @field_validator("page_key")
    @classmethod
    def _key(cls, value: str) -> str:
        return value.strip()


class PageUpdate(_PageFields):
    """None = 바꾸지 않음. parent_key · 텍스트는 "" 로 지운다."""

    title: str | None = Field(default=None, max_length=TITLE_MAX)
    page_key: str | None = Field(default=None, max_length=50)

    @field_validator("title")
    @classmethod
    def _title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("페이지 이름을 입력해 주세요.")
        return value

    @field_validator("page_key")
    @classmethod
    def _key(cls, value: str | None) -> str | None:
        return _strip(value)


class PageDuplicate(BaseModel):
    title: str = Field(..., max_length=TITLE_MAX)
    page_key: str = Field(..., max_length=50)

    @field_validator("title")
    @classmethod
    def _title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("페이지 이름을 입력해 주세요.")
        return value

    @field_validator("page_key")
    @classmethod
    def _key(cls, value: str) -> str:
        return value.strip()


class PageOrderUpdate(BaseModel):
    ids: list[uuid.UUID] = Field(..., min_length=1, max_length=200)


class PageRecipe(BaseModel):
    """페이지 추가의 추천 구성 (T-247)"""

    key: str
    label: str
    # 넣을 섹션 이름 — 순서대로
    sections: list[str]


class PageKeyCheckResponse(BaseModel):
    available: bool
    # 쓸 수 없는 이유 — 화면에 그대로 보인다
    reason: str | None = None


class PageUsageSection(BaseModel):
    id: uuid.UUID
    label: str
    page_key: str


class PageUsageResponse(BaseModel):
    """이 페이지를 가리키는 곳 (T-242) — 지우기 · 주소 변경 전 안내"""

    # 저장한 메뉴에서 이 페이지로 가는 메뉴 이름
    menu: list[str]
    # 값에 이 페이지 주소가 든 섹션 (다른 페이지)
    sections: list[PageUsageSection]
