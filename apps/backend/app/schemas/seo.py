import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

RobotsValue = Literal[
    "index,follow", "noindex,follow", "index,nofollow", "noindex,nofollow"
]


class SeoSettingsUpdate(BaseModel):
    meta_title: str | None = Field(None, max_length=60)
    meta_description: str | None = Field(None, max_length=160)
    og_image_url: str | None = None
    robots_txt: str | None = None
    google_analytics_id: str | None = None
    naver_site_verification: str | None = None
    google_site_verification: str | None = None
    og_title: str | None = Field(None, max_length=60)
    og_description: str | None = Field(None, max_length=200)
    canonical_url: str | None = Field(None, max_length=500)
    robots: RobotsValue | None = None
    # None = 바꾸지 않음, [] = 모두 지움 (T-040-A)
    keywords: list[str] | None = None


class SeoSettingsResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    meta_title: str | None
    meta_description: str | None
    og_image_url: str | None
    robots_txt: str | None
    google_analytics_id: str | None
    naver_site_verification: str | None
    google_site_verification: str | None
    og_title: str | None = None
    og_description: str | None = None
    canonical_url: str | None = None
    robots: str = "index,follow"
    keywords: list[str] = []
    updated_at: datetime

    model_config = {"from_attributes": True}


class SeoLimitsResponse(BaseModel):
    """요금제별 SEO 사용 범위 (T-040-A) — 화면은 이 값으로 잠금 표시"""

    keywords_allowed: bool
    keywords_max: int
    keyword_max_length: int


# ── AEO · GEO (T-221, 사이트 관리 SM-05 · SM-06) ─────────────────────────────

CrawlerPolicy = Literal["keep", "allow", "block"]
GEO_DESCRIPTION_MAX = 500
GEO_TOPICS_MAX = 10
GEO_TOPIC_LENGTH = 30
GEO_PROFILES_MAX = 10
GEO_EVIDENCE_MAX = 20
EVIDENCE_CLAIM_MAX = 100
URL_MAX = 500


def _clean_url(value: str) -> str:
    url = value.strip()
    if len(url) > URL_MAX or not url.startswith(("http://", "https://")):
        raise ValueError("주소는 http:// 또는 https:// 로 시작해야 합니다.")
    return url


class AeoUpdate(BaseModel):
    # FAQ 구조화 데이터를 만들 FAQ 게시판
    faq_board_ids: list[uuid.UUID] = []


class AeoItem(BaseModel):
    post_id: uuid.UUID
    question: str
    answer: str
    # 홈페이지에 보이는 글인지 — 비밀글 · 예약글 · 초안은 구조화 데이터에서 뺀다
    public: bool
    note: str | None = None


class AeoBoard(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    active: bool
    # 회원만 읽는 게시판은 검색엔진이 볼 수 없다
    member_only: bool
    items: list[AeoItem]


class AeoResponse(BaseModel):
    faq_board_ids: list[uuid.UUID]
    boards: list[AeoBoard]


class GeoEvidence(BaseModel):
    claim: str = Field(min_length=1, max_length=EVIDENCE_CLAIM_MAX)
    url: str
    checked_at: date | None = None

    @field_validator("claim", mode="before")
    @classmethod
    def strip_claim(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("url")
    @classmethod
    def check_url(cls, v: str) -> str:
        return _clean_url(v)


class GeoSettings(BaseModel):
    description: str = Field(default="", max_length=GEO_DESCRIPTION_MAX)
    topics: list[str] = Field(default=[], max_length=GEO_TOPICS_MAX)
    profile_urls: list[str] = Field(default=[], max_length=GEO_PROFILES_MAX)
    evidence: list[GeoEvidence] = Field(default=[], max_length=GEO_EVIDENCE_MAX)
    # User-agent → 정책. keep 은 저장하지 않는다
    crawlers: dict[str, CrawlerPolicy] = {}

    @field_validator("description", mode="before")
    @classmethod
    def strip_description(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("topics")
    @classmethod
    def clean_topics(cls, v: list[str]) -> list[str]:
        result: list[str] = []
        for item in v:
            word = " ".join(item.split())
            if not word or word in result:
                continue
            if len(word) > GEO_TOPIC_LENGTH:
                raise ValueError(f"주제는 {GEO_TOPIC_LENGTH}자 이하로 입력해 주세요.")
            result.append(word)
        return result

    @field_validator("profile_urls")
    @classmethod
    def clean_profiles(cls, v: list[str]) -> list[str]:
        result: list[str] = []
        for item in v:
            if not item.strip():
                continue
            url = _clean_url(item)
            if url not in result:
                result.append(url)
        return result


class AiCrawler(BaseModel):
    name: str
    label: str


class GeoResponse(BaseModel):
    settings: GeoSettings
    crawlers: list[AiCrawler]


class PublicGeo(BaseModel):
    """홈페이지 공개용 — 출처 목록은 관리용이라 빼고 내보낸다."""

    description: str = ""
    topics: list[str] = []
    profile_urls: list[str] = []
    crawlers: dict[str, CrawlerPolicy] = {}
