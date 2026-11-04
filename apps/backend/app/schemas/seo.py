import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

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
