"""AI 보조 (관리자 화면 개선 · AI 보조 기획서 2장) — `POST /ai/assist/{kind}`.

화면(apps/admin `lib/aiAssist.ts`)과 같은 모양. 결과의 글자 수 · 개수는 저장 API 와
같은 규칙으로 서버가 잘라서 돌려준다.
"""

import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.schemas.board import BoardOperation, BoardPermissions, BoardType, FieldType

AssistKind = Literal[
    "seo",
    "geo",
    "board",
    "post",
    "policy_summary",
    "page_seo",
    "content_polish",
    "content_tags",
]
AssistTone = Literal["trust", "friendly", "expert"]

PURPOSE_MAX = 200
MEMO_MAX = 500
POLICY_BODY_MAX = 30000
# 콘텐츠 (T-259) — 저장 API 와 같은 길이, 본문은 화면이 글자만 뽑아 보낸다
CONTENT_TITLE_MAX = 100
CONTENT_SUMMARY_MAX = 300
CONTENT_TEXT_MAX = 3000
CONTENT_TAGS_MAX = 20


class AssistRequest(BaseModel):
    """kind 마다 쓰는 칸만 — 나머지(사이트 정보 · 업종 · 지금 값)는 서버가 직접 읽는다.

    - seo · geo: tone
    - page_seo: tone, page_id (필수 — 그 페이지 이름 · 섹션 제목으로 만든다)
    - board: purpose (필수), board_id (있으면 그 게시판에 더할 필드 · 카테고리만)
    - post: memo (필수), board_id (필수 — 게시판 유형으로 FAQ 를 가린다)
    - policy_summary: kind (terms · privacy), body (편집 중인 본문, 저장 전이어도) —
      공개본(없으면 기본 문안)은 서버가 읽어 바뀐 줄만 모델에 보낸다
    - content_polish: tone, content_type_id (필수), title · summary · text (편집 중)
    - content_tags: content_type_id (필수), title · summary · text, tags (지금 태그)
    """

    tone: AssistTone = "trust"
    purpose: str = Field(default="", max_length=PURPOSE_MAX)
    memo: str = Field(default="", max_length=MEMO_MAX)
    board_id: uuid.UUID | None = None
    kind: Literal["terms", "privacy"] | None = None
    body: str = Field(default="", max_length=POLICY_BODY_MAX)
    page_id: uuid.UUID | None = None
    content_type_id: uuid.UUID | None = None
    title: str = Field(default="", max_length=CONTENT_TITLE_MAX)
    summary: str = Field(default="", max_length=CONTENT_SUMMARY_MAX)
    text: str = Field(default="", max_length=CONTENT_TEXT_MAX)
    tags: list[str] = Field(default=[], max_length=CONTENT_TAGS_MAX)


class SeoAssistResult(BaseModel):
    meta_title: str
    meta_description: str
    # 키워드를 못 쓰는 요금제면 빈 목록
    keywords: list[str] = []


class PageSeoAssistResult(BaseModel):
    """페이지 검색 제목 · 설명 (PM-02) — 페이지 설정의 칸 이름 그대로."""

    seo_title: str
    seo_description: str


class GeoAssistResult(BaseModel):
    description: str
    topics: list[str] = []


class SuggestedField(BaseModel):
    """추천 칸 — 기존 칸 유형만, 고르기 칸은 선택지 이름."""

    label: str
    field_type: FieldType
    choices: list[str] = []


class BoardAssistResult(BaseModel):
    """게시판 구성 추천 (A-2) — 고를 수 없는 유형 · 위험한 권한 조합은 서버가 고친다."""

    board_type: BoardType
    name: str
    description: str
    fields: list[SuggestedField] = []
    categories: list[str] = []
    permissions: BoardPermissions
    operation: BoardOperation
    # 권한 · 운영을 이렇게 정한 까닭 — 서버가 고친 것도 덧붙인다
    reason: str


class DraftParagraph(BaseModel):
    type: Literal["p"] = "p"
    text: str


class DraftList(BaseModel):
    type: Literal["ul"] = "ul"
    items: list[str]


# 글 초안 본문 한 칸 — 문단 · 글머리 목록만, 글자 그대로 (화면이 편집기 노드로 바꾼다)
DraftBlock = Annotated[DraftParagraph | DraftList, Field(discriminator="type")]


class PostAssistResult(BaseModel):
    """공지 · FAQ 글 초안 (A-3) — FAQ 게시판이면 titles 는 질문 하나, body 는 답변."""

    titles: list[str]
    body: list[DraftBlock]


class PolicySummaryResult(BaseModel):
    """약관 변경 내용 요약 (A-4) — 1 ~ 3줄, 500자 안."""

    summary: str


class ContentPolishResult(BaseModel):
    """콘텐츠 문장 다듬기 (T-259, CM-02) — 화면이 고른 것만 요약 · 본문에 채운다."""

    summary: str
    body: list[DraftBlock]


class SuggestedTag(BaseModel):
    name: str
    # 이미 있는 태그면 그 이름 그대로 — 새 태그는 저장할 때 만들어진다
    existing: bool


class ContentTagsResult(BaseModel):
    """콘텐츠 태그 추천 (T-259, CM-05) — 있는 태그를 먼저, 지금 붙인 태그는 뺀다."""

    tags: list[SuggestedTag]


AssistResult = (
    SeoAssistResult
    | PageSeoAssistResult
    | GeoAssistResult
    | BoardAssistResult
    | PostAssistResult
    | PolicySummaryResult
    | ContentPolishResult
    | ContentTagsResult
)


class AssistUsage(BaseModel):
    """문구 추천과 함께 쓰는 이번 달 한도."""

    used: int
    limit: int | None  # None = 무제한
    remaining: int | None


class AssistResponse(BaseModel):
    result: AssistResult
    usage: AssistUsage
