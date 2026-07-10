"""T-089 슈퍼 어드민 대시보드 스키마."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_tenants: int
    active_tenants: int
    new_this_month: int
    mrr: int  # 원 (월 반복 매출)
    kakao_sent_this_month: int
    ai_usage_this_month: int


class PlanDistributionItem(BaseModel):
    plan: str
    count: int


class MrrTrendPoint(BaseModel):
    month: str  # "2026-07"
    mrr: int


class ExpiringTenant(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    plan_type: str
    plan_expires_at: datetime | None
    days_left: int


class RecentTenant(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    plan_type: str
    created_at: datetime


class SystemStatus(BaseModel):
    server: bool
    db: bool
    redis: bool
    celery: bool


class ExpiringSslDomain(BaseModel):
    domain: str
    ssl_expires_at: datetime | None
    days_left: int


class DashboardResponse(BaseModel):
    stats: DashboardStats
    plan_distribution: list[PlanDistributionItem]
    # MRR 추이는 결제 스냅샷(Phase 14) 이전이라 테넌트 코호트 기반 근사값이다.
    mrr_trend: list[MrrTrendPoint]
    expiring_tenants: list[ExpiringTenant]
    recent_tenants: list[RecentTenant]
    ssl_expiring: list[ExpiringSslDomain]
    system: SystemStatus
