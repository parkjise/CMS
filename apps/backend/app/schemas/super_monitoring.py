"""T-093 슈퍼 어드민 모니터링/수익 스키마."""

import uuid
from datetime import datetime

from pydantic import BaseModel


# ── 모니터링 ─────────────────────────────────────────────────────────────
class AiCostMonthly(BaseModel):
    month: str  # "2026-07"
    tokens: int
    cost_usd: float


class AiCost(BaseModel):
    monthly: list[AiCostMonthly]
    total_tokens: int
    estimated_cost_usd: float


class KakaoUsage(BaseModel):
    this_month_count: int
    estimated_cost_krw: int


class QueueStatus(BaseModel):
    pending: int
    workers: int


class ErrorStatus(BaseModel):
    sentry_configured: bool
    items: list[dict]


class MonitoringResponse(BaseModel):
    ai_cost: AiCost
    kakao: KakaoUsage
    queue: QueueStatus
    errors: ErrorStatus


# ── 수익 ─────────────────────────────────────────────────────────────────
class MrrTrendPoint(BaseModel):
    month: str
    mrr: int


class PlanDistributionItem(BaseModel):
    plan: str
    count: int


class ExpiringTenant(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    plan_type: str
    plan_expires_at: datetime | None
    days_left: int


class RevenueMovement(BaseModel):
    new: int
    churned: int
    upgraded: int
    downgraded: int


class RevenueResponse(BaseModel):
    mrr_trend: list[MrrTrendPoint]
    plan_distribution: list[PlanDistributionItem]
    expiring_tenants: list[ExpiringTenant]
    movement: RevenueMovement
