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

    model_config = {"from_attributes": True}


class PublicSectionResponse(BaseModel):
    id: uuid.UUID
    section_type: str
    label: str
    display_order: int
    is_active: bool
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

    model_config = {"from_attributes": True}


class PublicTemplateResponse(BaseModel):
    template_type: str
    name: str
    css_variables: dict
    section_layouts: list

    model_config = {"from_attributes": True}


class PublicSiteResponse(BaseModel):
    tenant: PublicTenantResponse
    sections: list[PublicSectionResponse]
    seo_settings: PublicSeoResponse | None
    sns_settings: PublicSnsResponse | None
    template: PublicTemplateResponse | None
