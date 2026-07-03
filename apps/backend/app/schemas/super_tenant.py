import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class TenantListItem(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    template_type: str
    plan_type: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TenantListResponse(BaseModel):
    items: list[TenantListItem]
    total: int
    page: int
    limit: int


class TenantCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$")
    template_type: str = "GENERAL"
    plan_type: str = "BASIC"
    admin_email: EmailStr
    admin_password: str = Field(..., min_length=8, max_length=100)


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
    template_type: str | None = None
    custom_domain: str | None = None
    is_active: bool | None = None


class TenantPlanUpdateRequest(BaseModel):
    plan_type: str
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


class ImpersonateResponse(BaseModel):
    impersonate_token: str
    redirect_url: str
    expires_in: int  # seconds


class AuditLogItem(BaseModel):
    id: uuid.UUID
    actor_role: str
    action: str
    target_type: str
    before_value: dict | None
    after_value: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    items: list[AuditLogItem]
    total: int
    page: int
    limit: int
