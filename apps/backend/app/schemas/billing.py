"""T-095 결제/구독/도메인 Pydantic 스키마."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

SUBSCRIPTION_STATUSES = ("ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED", "TRIAL")
PAYMENT_STATUSES = ("SUCCESS", "FAILED", "CANCELLED", "REFUNDED")
DOMAIN_TYPES = ("SUBDOMAIN", "CUSTOM")
DOMAIN_STATUSES = ("PENDING", "DNS_CHECKING", "SSL_ISSUING", "ACTIVE", "FAILED")


# ── 구독 ─────────────────────────────────────────────────────────────────
class SubscriptionResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    plan_type: str
    status: str
    billing_email: str | None
    billing_name: str | None
    monthly_amount: int
    trial_ends_at: datetime | None
    current_period_start: datetime
    current_period_end: datetime
    cancelled_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── 결제 이력 ─────────────────────────────────────────────────────────────
class PaymentHistoryItem(BaseModel):
    id: uuid.UUID
    order_id: str
    amount: int
    status: str
    failure_reason: str | None
    receipt_url: str | None
    paid_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaymentHistoryListResponse(BaseModel):
    items: list[PaymentHistoryItem]
    total: int


# ── 플랜 변경 이력 ─────────────────────────────────────────────────────────
class PlanChangeItem(BaseModel):
    id: uuid.UUID
    from_plan: str
    to_plan: str
    reason: str | None
    effective_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


# ── 도메인 ───────────────────────────────────────────────────────────────
class TenantDomainResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    domain: str
    domain_type: str
    status: str
    ssl_expires_at: datetime | None
    verified_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── 요청 (T-096/T-099에서 사용) ────────────────────────────────────────────
class RegisterCardRequest(BaseModel):
    """토스페이먼츠 위젯에서 받은 인증키로 빌링키 발급."""

    auth_key: str
    customer_key: str
    billing_email: EmailStr | None = None
    billing_name: str | None = Field(None, max_length=100)


class ChangePlanRequest(BaseModel):
    to_plan: str = Field(..., max_length=20)
    reason: str | None = None


class CancelSubscriptionRequest(BaseModel):
    reason: str | None = None


class RegisterDomainRequest(BaseModel):
    domain: str = Field(..., max_length=255)
    domain_type: str = Field("CUSTOM", max_length=20)


class TrialStatusResponse(BaseModel):
    is_trial: bool
    status: str
    days_left: int
    trial_ends_at: datetime | None


class DomainStatusResponse(TenantDomainResponse):
    # CNAME 설정 가이드용 타깃 (고객 DNS에 추가할 값)
    cname_target: str


class DomainListResponse(BaseModel):
    items: list[TenantDomainResponse]
    total: int


# ── 슈퍼 어드민 결제 현황 (T-103) ──────────────────────────────────────────
class PastDueTenant(BaseModel):
    subscription_id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    plan_type: str
    amount: int


class BillingOverviewResponse(BaseModel):
    mrr: int
    past_due_count: int
    cancelled_count: int
    new_this_month: int
    past_due_tenants: list[PastDueTenant]


class RefundRequest(BaseModel):
    reason: str | None = None
