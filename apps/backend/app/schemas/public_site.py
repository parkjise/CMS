import uuid

from pydantic import BaseModel


class PublicTenantResponse(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    template_type: str
    plan_type: str
    custom_domain: str | None

    model_config = {"from_attributes": True}


class PublicSettingItem(BaseModel):
    field_key: str
    field_value: str | None
    value_type: str
    # 인라인 편집 툴바 '샘플 n개' 표시용 (기획서 11.8)
    is_sample: bool = False

    model_config = {"from_attributes": True}


class PublicSectionResponse(BaseModel):
    id: uuid.UUID
    section_type: str
    label: str
    display_order: int
    is_active: bool
    page_key: str = "home"
    settings: list[PublicSettingItem] = []

    model_config = {"from_attributes": True}


class PublicSnsResponse(BaseModel):
    kakao_url: str | None
    instagram_url: str | None
    facebook_url: str | None
    youtube_url: str | None
    blog_url: str | None
    naver_url: str | None

    model_config = {"from_attributes": True}


class PublicSeoResponse(BaseModel):
    meta_title: str | None
    meta_description: str | None
    og_image_url: str | None
    google_analytics_id: str | None
    naver_site_verification: str | None
    google_site_verification: str | None

    model_config = {"from_attributes": True}


class PublicTemplateResponse(BaseModel):
    template_type: str
    name: str
    css_variables: dict
    section_layouts: list
    # 코드형 템플릿 판별 (클라이언트 templates/registry 키) — 기획서 11.7
    code: str | None = None
    renderer: str = "theme"
    styling: str = "tailwind"
    version: str = "1.0.0"

    model_config = {"from_attributes": True}


class PublicSiteResponse(BaseModel):
    tenant: PublicTenantResponse
    sections: list[PublicSectionResponse]
    seo_settings: PublicSeoResponse | None
    sns_settings: PublicSnsResponse | None
    template: PublicTemplateResponse | None
