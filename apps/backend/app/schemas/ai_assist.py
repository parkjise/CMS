"""AI 보조 (관리자 화면 개선 · AI 보조 기획서 2장) — `POST /ai/assist/{kind}`.

화면(apps/admin `lib/aiAssist.ts`)과 같은 모양. 결과의 글자 수 · 개수는 저장 API 와
같은 규칙으로 서버가 잘라서 돌려준다.
"""

import uuid
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.board import BoardOperation, BoardPermissions, BoardType, FieldType

AssistKind = Literal["seo", "geo", "board"]
AssistTone = Literal["trust", "friendly", "expert"]

PURPOSE_MAX = 200


class AssistRequest(BaseModel):
    """kind 마다 쓰는 칸만 — 나머지(사이트 정보 · 업종 · 지금 값)는 서버가 직접 읽는다.

    - seo · geo: tone
    - board: purpose (필수), board_id (있으면 그 게시판에 더할 필드 · 카테고리만)
    """

    tone: AssistTone = "trust"
    purpose: str = Field(default="", max_length=PURPOSE_MAX)
    board_id: uuid.UUID | None = None


class SeoAssistResult(BaseModel):
    meta_title: str
    meta_description: str
    # 키워드를 못 쓰는 요금제면 빈 목록
    keywords: list[str] = []


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


AssistResult = SeoAssistResult | GeoAssistResult | BoardAssistResult


class AssistUsage(BaseModel):
    """문구 추천과 함께 쓰는 이번 달 한도."""

    used: int
    limit: int | None  # None = 무제한
    remaining: int | None


class AssistResponse(BaseModel):
    result: AssistResult
    usage: AssistUsage
