"""AI 보조 (관리자 화면 개선 · AI 보조 기획서 2장) — `POST /ai/assist/{kind}`.

화면(apps/admin `lib/aiAssist.ts`)과 같은 모양. 결과의 글자 수 · 개수는 저장 API 와
같은 규칙으로 서버가 잘라서 돌려준다.
"""

from typing import Literal

from pydantic import BaseModel

AssistKind = Literal["seo", "geo"]
AssistTone = Literal["trust", "friendly", "expert"]


class AssistToneRequest(BaseModel):
    """seo · geo — 나머지(사이트 정보 · 업종 · 지금 값)는 서버가 직접 읽는다."""

    tone: AssistTone = "trust"


class SeoAssistResult(BaseModel):
    meta_title: str
    meta_description: str
    # 키워드를 못 쓰는 요금제면 빈 목록
    keywords: list[str] = []


class GeoAssistResult(BaseModel):
    description: str
    topics: list[str] = []


AssistResult = SeoAssistResult | GeoAssistResult


class AssistUsage(BaseModel):
    """문구 추천과 함께 쓰는 이번 달 한도."""

    used: int
    limit: int | None  # None = 무제한
    remaining: int | None


class AssistResponse(BaseModel):
    result: AssistResult
    usage: AssistUsage
