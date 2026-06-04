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


class SeoSettingsResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    meta_title: str | None
    meta_description: str | None
    og_image_url: str | None
    robots_txt: str | None
    google_analytics_id: str | None
    naver_site_verification: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}
