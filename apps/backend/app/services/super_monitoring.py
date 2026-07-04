"""T-093 슈퍼 어드민 모니터링/수익 집계 서비스.

AI/알림톡 비용은 추정치다(정밀 청구는 Phase 14 결제 도입 시). 이동 현황은
audit_logs(플랜 변경)와 tenants(생성/삭제)에서 도출한다.
"""

import asyncio
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AiUsageLog
from app.models.audit import AuditLog
from app.models.sns import NotificationSetting
from app.models.tenant import Tenant
from app.services.super_dashboard import (
    _active_tenants,
    _month_first,
    _month_key,
    _mrr_of,
    _prev_month_first,
)

# 추정 단가 (실제 청구가 아님)
AI_COST_PER_1K_TOKENS_USD = 0.0006
KAKAO_COST_PER_MSG_KRW = 8

EXPIRING_WITHIN_DAYS = 7
PLAN_RANK = {"FREE": 0, "BASIC": 1, "STANDARD": 2, "PREMIUM": 3}


def _recent_months(today: date, count: int) -> list[date]:
    months: list[date] = []
    cursor = _month_first(today)
    for _ in range(count):
        months.append(cursor)
        cursor = _prev_month_first(cursor)
    months.reverse()
    return months


def _next_month_first(m_first: date) -> date:
    if m_first.month == 12:
        return m_first.replace(year=m_first.year + 1, month=1)
    return m_first.replace(month=m_first.month + 1)


# ── 모니터링 ─────────────────────────────────────────────────────────────
async def get_monitoring(db: AsyncSession) -> dict:
    today = datetime.now(UTC).date()
    months = _recent_months(today, 6)

    monthly: list[dict] = []
    total_tokens = 0
    for m_first in months:
        nxt = _next_month_first(m_first)
        tokens = int(
            (
                await db.execute(
                    select(func.coalesce(func.sum(AiUsageLog.tokens_used), 0)).where(
                        AiUsageLog.created_at
                        >= datetime(m_first.year, m_first.month, 1, tzinfo=UTC),
                        AiUsageLog.created_at
                        < datetime(nxt.year, nxt.month, 1, tzinfo=UTC),
                    )
                )
            ).scalar_one()
        )
        total_tokens += tokens
        monthly.append(
            {
                "month": _month_key(m_first),
                "tokens": tokens,
                "cost_usd": round(tokens / 1000 * AI_COST_PER_1K_TOKENS_USD, 2),
            }
        )

    kakao_count = int(
        (
            await db.execute(
                select(
                    func.coalesce(func.sum(NotificationSetting.monthly_kakao_count), 0)
                )
            )
        ).scalar_one()
    )

    queue = await _queue_status()

    return {
        "ai_cost": {
            "monthly": monthly,
            "total_tokens": total_tokens,
            "estimated_cost_usd": round(
                total_tokens / 1000 * AI_COST_PER_1K_TOKENS_USD, 2
            ),
        },
        "kakao": {
            "this_month_count": kakao_count,
            "estimated_cost_krw": kakao_count * KAKAO_COST_PER_MSG_KRW,
        },
        "queue": queue,
        # Sentry 미연동 — 연동 전까지 빈 목록
        "errors": {"sentry_configured": False, "items": []},
    }


async def _queue_status() -> dict:
    def _inspect() -> dict:
        try:
            from app.workers.celery_app import celery_app

            inspect = celery_app.control.inspect(timeout=0.3)
            reserved = inspect.reserved() or {}
            scheduled = inspect.scheduled() or {}
            pending = sum(len(v) for v in reserved.values()) + sum(
                len(v) for v in scheduled.values()
            )
            return {"pending": pending, "workers": len(reserved)}
        except Exception:
            return {"pending": 0, "workers": 0}

    try:
        return await asyncio.wait_for(asyncio.to_thread(_inspect), timeout=1.0)
    except Exception:
        return {"pending": 0, "workers": 0}


# ── 수익 ─────────────────────────────────────────────────────────────────
async def get_revenue(db: AsyncSession, months: int = 6) -> dict:
    now = datetime.now(UTC)
    today = now.date()
    month_first = datetime(today.year, today.month, 1, tzinfo=UTC)

    tenants = await _active_tenants(db)
    active = [t for t in tenants if t.is_active]

    # MRR 추이
    mrr_trend = []
    for m_first in _recent_months(today, months):
        nxt = _next_month_first(m_first)
        cohort = [t for t in active if t.created_at.date() < nxt]
        mrr_trend.append({"month": _month_key(m_first), "mrr": _mrr_of(cohort)})

    # 플랜별 현황
    plan_counts: dict[str, int] = {}
    for t in active:
        plan_counts[t.plan_type] = plan_counts.get(t.plan_type, 0) + 1
    plan_distribution = [
        {"plan": p, "count": c} for p, c in sorted(plan_counts.items())
    ]

    # 만료 예정
    expiring = []
    for t in active:
        if t.plan_expires_at is None:
            continue
        days_left = (t.plan_expires_at.date() - today).days
        if 0 <= days_left <= EXPIRING_WITHIN_DAYS:
            expiring.append(
                {
                    "id": t.id,
                    "slug": t.slug,
                    "name": t.name,
                    "plan_type": t.plan_type,
                    "plan_expires_at": t.plan_expires_at,
                    "days_left": days_left,
                }
            )
    expiring.sort(key=lambda e: e["days_left"])

    movement = await _movement(db, month_first)

    return {
        "mrr_trend": mrr_trend,
        "plan_distribution": plan_distribution,
        "expiring_tenants": expiring,
        "movement": movement,
    }


async def _movement(db: AsyncSession, month_first: datetime) -> dict:
    # 삭제(해지)된 테넌트도 포함해야 하므로 tenants 전체를 직접 집계한다.
    new = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Tenant)
                .where(Tenant.created_at >= month_first)
            )
        ).scalar_one()
    )
    churned = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Tenant)
                .where(
                    Tenant.deleted_at.isnot(None),
                    Tenant.deleted_at >= month_first,
                )
            )
        ).scalar_one()
    )

    rows = (
        await db.execute(
            select(AuditLog.before_value, AuditLog.after_value).where(
                AuditLog.action == "TENANT_PLAN_CHANGED",
                AuditLog.created_at >= month_first,
            )
        )
    ).all()
    upgraded = 0
    downgraded = 0
    for before, after in rows:
        b = PLAN_RANK.get((before or {}).get("plan_type", ""), -1)
        a = PLAN_RANK.get((after or {}).get("plan_type", ""), -1)
        if a > b:
            upgraded += 1
        elif a < b and a >= 0 and b >= 0:
            downgraded += 1

    return {
        "new": new,
        "churned": churned,
        "upgraded": upgraded,
        "downgraded": downgraded,
    }
