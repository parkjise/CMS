import uuid

from pydantic import BaseModel

from app.schemas.site import PublicSiteSettingsResponse


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
    # 노출 위치 (T-038-A) — 홈페이지 푸터 아이콘 · 카카오톡 플로팅 버튼
    show_in_footer: bool = True
    show_floating: bool = True
    floating_position: str = "BOTTOM_RIGHT"

    model_config = {"from_attributes": True}


class PublicSeoResponse(BaseModel):
    meta_title: str | None
    meta_description: str | None
    og_image_url: str | None
    google_analytics_id: str | None
    naver_site_verification: str | None
    google_site_verification: str | None
    keywords: list[str] = []

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


class PublicMemberFlags(BaseModel):
    """방문자 회원 기능 (T-115) — 헤더 회원 메뉴 · /member 화면 노출."""

    enabled: bool = False
    reservations: bool = False
    social_login: bool = False


class PublicSiteResponse(BaseModel):
    tenant: PublicTenantResponse
    sections: list[PublicSectionResponse]
    seo_settings: PublicSeoResponse | None
    sns_settings: PublicSnsResponse | None
    # 사업체 공통 정보 (T-036-A) — 푸터 · 로고 · 파비콘 · 구조화 데이터
    site_settings: PublicSiteSettingsResponse | None = None
    template: PublicTemplateResponse | None
    member: PublicMemberFlags = PublicMemberFlags()
