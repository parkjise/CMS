"""T-086 기능 플래그 스키마."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

# ── 배포 방식 / 카테고리 ─────────────────────────────────────────────────
DEPLOYMENT_TYPES = ("GLOBAL", "PLAN_BASED", "SELECTIVE", "GRADUAL")
FEATURE_CATEGORIES = (
    "CONTENT",
    "NOTIFICATION",
    "AI",
    "SEO",
    "ANALYTICS",
    "INTEGRATION",
)


# ── 슈퍼 어드민: 기능 마스터 ─────────────────────────────────────────────
class FeatureCreateRequest(BaseModel):
    key: str = Field(..., min_length=2, max_length=100, pattern=r"^[A-Z0-9_]+$")
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    category: str = Field(..., max_length=50)
    menu_path: str | None = Field(None, max_length=200)
    menu_icon: str | None = Field(None, max_length=50)
    menu_label: str | None = Field(None, max_length=100)
    menu_position: int = 99
    default_enabled: bool = False
    required_plan: str | None = Field(None, max_length=20)
    is_beta: bool = False
    is_active: bool = True
    release_note: str | None = None
    released_at: datetime | None = None


class FeatureUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    category: str | None = Field(None, max_length=50)
    menu_path: str | None = Field(None, max_length=200)
    menu_icon: str | None = Field(None, max_length=50)
    menu_label: str | None = Field(None, max_length=100)
    menu_position: int | None = None
    default_enabled: bool | None = None
    required_plan: str | None = Field(None, max_length=20)
    is_beta: bool | None = None
    is_active: bool | None = None
    release_note: str | None = None
    released_at: datetime | None = None


class FeatureResponse(BaseModel):
    id: uuid.UUID
    key: str
    name: str
    description: str | None
    category: str
    menu_path: str | None
    menu_icon: str | None
    menu_label: str | None
    menu_position: int
    default_enabled: bool
    required_plan: str | None
    is_beta: bool
    is_active: bool
    release_note: str | None
    released_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class FeatureListItem(FeatureResponse):
    enabled_tenant_count: int = 0


class FeatureListResponse(BaseModel):
    items: list[FeatureListItem]
    total: int


# ── 배포 ─────────────────────────────────────────────────────────────────
class DeployRequest(BaseModel):
    deployment_type: str = Field(
        ..., description="GLOBAL | PLAN_BASED | SELECTIVE | GRADUAL"
    )
    target_plan: str | None = Field(None, max_length=20)
    target_tenants: list[uuid.UUID] | None = None
    rollout_percent: int | None = Field(None, ge=1, le=100)
    notes: str | None = None


class DeployResponse(BaseModel):
    deployment_id: uuid.UUID
    feature_id: uuid.UUID
    deployment_type: str
    affected_count: int


class RollbackResponse(BaseModel):
    deployment_id: uuid.UUID
    affected_count: int
    rolled_back: bool = True


# ── 슈퍼 어드민: 테넌트별 기능 ────────────────────────────────────────────
class TenantFeatureToggleRequest(BaseModel):
    is_enabled: bool
    override_reason: str | None = None


class TenantFeatureItem(BaseModel):
    feature_id: uuid.UUID
    key: str
    name: str
    category: str
    required_plan: str | None
    is_beta: bool
    is_active: bool
    is_enabled: bool
    enabled_at: datetime | None

    model_config = {"from_attributes": True}


class TenantFeatureListResponse(BaseModel):
    tenant_id: uuid.UUID
    items: list[TenantFeatureItem]


# ── 테넌트용 기능 조회 (GET /api/v1/tenant/features) ──────────────────────
class TenantActiveFeature(BaseModel):
    key: str
    name: str
    menu_path: str | None
    menu_icon: str | None
    menu_label: str | None
    menu_position: int
    is_beta: bool
    release_note: str | None
    released_at: datetime | None


class TenantFeaturesResponse(BaseModel):
    features: list[TenantActiveFeature]
    flags: dict[str, bool]
    # 미읽은 공지 — T-088 announcements 연동 예정 (현재 빈 배열)
    announcements: list[dict] = Field(default_factory=list)
