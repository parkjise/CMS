import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SeoSettingsUpdate(BaseModel):
    meta_title: str | None = Field(None, max_length=60)
    meta_description: str | None = Field(None, max_length=160)
    og_image_url: str | None = None
    robots_txt: str | None = None
    google_analytics_id: str | None = None
    naver_site_verification: str | None = None
    google_site_verification: str | None = None
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
    keywords: list[str] = []
    updated_at: datetime

    model_config = {"from_attributes": True}


class SeoLimitsResponse(BaseModel):
    """요금제별 SEO 사용 범위 (T-040-A) — 화면은 이 값으로 잠금 표시"""

    keywords_allowed: bool
    keywords_max: int
    keyword_max_length: int
