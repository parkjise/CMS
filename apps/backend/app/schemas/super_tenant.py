import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class TenantListItem(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    template_type: str
    plan_type: str
    is_active: bool
    created_at: datetime
    # 해지 · 정지 사업체 데이터 파기를 마친 시각 (T-198)
    data_purged_at: datetime | None = None
    # 목록 계산 칸 (T-205, SA-02) — 구독 만료일(체험이면 체험 종료), 최근 30일
    expires_at: datetime | None = None
    visitors_30d: int = 0
    inquiries_30d: int = 0

    model_config = {"from_attributes": True}


class TenantListResponse(BaseModel):
    items: list[TenantListItem]
    total: int
    page: int
    limit: int


# DB 제약과 같은 값 (마이그레이션 0034, T-131)
TemplateType = Literal["HOSPITAL", "PENSION", "STARTUP", "GENERAL"]
# 사업체 목록 정렬 (T-205, SA-02) — 만료 · 방문자 · 문의는 계산 값
TenantSort = Literal[
    "created_desc",
    "created_asc",
    "name",
    "expires_asc",
    "visitors_desc",
    "inquiries_desc",
]
PlanType = Literal["FREE", "BASIC", "STANDARD", "PREMIUM"]


class TenantCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$")
    template_type: TemplateType = "GENERAL"
    plan_type: PlanType = "BASIC"
    admin_email: EmailStr
    admin_password: str = Field(..., min_length=8, max_length=100)
    # 시작 템플릿 코드 ('TPL_HOSPITAL_A') — 주면 샘플 콘텐츠로 시작 (기획서 11.8)
    template_code: str | None = Field(None, max_length=50)


class TenantDetailResponse(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    template_type: str
    plan_type: str
    plan_expires_at: datetime | None
    custom_domain: str | None
    is_active: bool
    created_at: datetime
    admin_emails: list[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class TenantCreateResponse(BaseModel):
    tenant: TenantDetailResponse
    admin_email: str


class TenantUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    template_type: TemplateType | None = None
    custom_domain: str | None = None
    is_active: bool | None = None


class TenantPlanUpdateRequest(BaseModel):
    plan_type: PlanType
    plan_expires_at: datetime | None = None


class TenantStatsResponse(BaseModel):
    page_views: int
    unique_visitors: int
    inquiries: int
    ai_usage: int
    storage_bytes: int


class ResetPasswordResponse(BaseModel):
    admin_email: str
    temporary_password: str


class ViewerCreate(BaseModel):
    email: EmailStr


class ViewerItem(BaseModel):
    id: uuid.UUID
    email: str
    last_login_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ViewerCreateResponse(BaseModel):
    viewer: ViewerItem
    temporary_password: str


class ImpersonateResponse(BaseModel):
    impersonate_token: str
    redirect_url: str
    expires_in: int  # seconds


class AuditLogItem(BaseModel):
    id: uuid.UUID
    actor_role: str
    action: str
    target_type: str
    target_id: str | None = None
    before_value: dict | None
    after_value: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    items: list[AuditLogItem]
    total: int
    page: int
    limit: int
