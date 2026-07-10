"""T-089 슈퍼 어드민 대시보드 집계 서비스."""

import asyncio
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AiUsageLog
from app.models.sns import NotificationSetting
from app.models.tenant import Tenant

# 플랜별 월 요금 (원). apps/admin/src/lib/plans.ts 와 일치시킨다.
PLAN_MONTHLY_PRICE: dict[str, int] = {
    "FREE": 0,
    "BASIC": 39_000,
    "STANDARD": 89_000,
    "PREMIUM": 129_000,
}

EXPIRING_WITHIN_DAYS = 7
RECENT_LIMIT = 5
MRR_TREND_MONTHS = 6


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _month_first(d: date) -> date:
    return d.replace(day=1)


def _prev_month_first(d: date) -> date:
    if d.month == 1:
        return d.replace(year=d.year - 1, month=12, day=1)
    return d.replace(month=d.month - 1, day=1)


async def _active_tenants(db: AsyncSession) -> list[Tenant]:
    rows = await db.execute(select(Tenant).where(Tenant.deleted_at.is_(None)))
    return list(rows.scalars().all())


def _mrr_of(tenants: list[Tenant]) -> int:
    return sum(PLAN_MONTHLY_PRICE.get(t.plan_type, 0) for t in tenants if t.is_active)


async def get_dashboard(db: AsyncSession) -> dict:
    now = datetime.now(UTC)
    today = now.date()
    month_first = datetime(today.year, today.month, 1, tzinfo=UTC)

    tenants = await _active_tenants(db)
    active = [t for t in tenants if t.is_active]

    total_tenants = len(tenants)
    active_tenants = len(active)
    new_this_month = sum(1 for t in tenants if t.created_at >= month_first)
    mrr = _mrr_of(active)

    # 플랜별 현황 (활성 기준)
    plan_counts: dict[str, int] = {}
    for t in active:
        plan_counts[t.plan_type] = plan_counts.get(t.plan_type, 0) + 1
    plan_distribution = [
        {"plan": plan, "count": count} for plan, count in sorted(plan_counts.items())
    ]

    # MRR 추이 (최근 6개월 코호트 근사)
    mrr_trend = _mrr_trend(active, today)

    # 알림톡 이번달 발송 수
    kakao_sent = int(
        (
            await db.execute(
                select(
                    func.coalesce(func.sum(NotificationSetting.monthly_kakao_count), 0)
                )
            )
        ).scalar_one()
    )

    # AI 사용 (이번달 건수)
    ai_usage = int(
        (
            await db.execute(
                select(func.count())
                .select_from(AiUsageLog)
                .where(AiUsageLog.created_at >= month_first)
            )
        ).scalar_one()
    )

    # 만료 예정 테넌트 (오늘 ~ +7일)
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

    # 최근 신규 테넌트
    recent_sorted = sorted(tenants, key=lambda t: t.created_at, reverse=True)[
        :RECENT_LIMIT
    ]
    recent = [
        {
            "id": t.id,
            "slug": t.slug,
            "name": t.name,
            "plan_type": t.plan_type,
            "created_at": t.created_at,
        }
        for t in recent_sorted
    ]

    ssl_expiring = await _expiring_ssl(db, now)
    system = await _system_status(db)

    return {
        "stats": {
            "total_tenants": total_tenants,
            "active_tenants": active_tenants,
            "new_this_month": new_this_month,
            "mrr": mrr,
            "kakao_sent_this_month": kakao_sent,
            "ai_usage_this_month": ai_usage,
        },
        "plan_distribution": plan_distribution,
        "mrr_trend": mrr_trend,
        "expiring_tenants": expiring,
        "recent_tenants": recent,
        "ssl_expiring": ssl_expiring,
        "system": system,
    }


async def _expiring_ssl(db: AsyncSession, now: datetime) -> list[dict]:
    """SSL 만료 D-30 이내 ACTIVE 도메인 목록 (경고 위젯용)."""
    from app.models.domain import TenantDomain

    cutoff = now + timedelta(days=30)
    rows = (
        await db.execute(
            select(TenantDomain.domain, TenantDomain.ssl_expires_at)
            .where(
                TenantDomain.status == "ACTIVE",
                TenantDomain.ssl_expires_at.isnot(None),
                TenantDomain.ssl_expires_at <= cutoff,
            )
            .order_by(TenantDomain.ssl_expires_at)
        )
    ).all()
    result = []
    for domain, expires in rows:
        days_left = (expires - now).days if expires else 0
        result.append(
            {
                "domain": domain,
                "ssl_expires_at": expires,
                "days_left": max(0, days_left),
            }
        )
    return result


def _mrr_trend(active: list[Tenant], today: date) -> list[dict]:
    """최근 N개월 각 월말 시점의 MRR 근사.

    결제 스냅샷 테이블이 없으므로(Phase 14 예정) "그 달 말까지 생성된 활성 테넌트"의
    현재 요금 합으로 근사한다.
    """
    # 대상 월들의 첫날 목록 (오래된 순)
    months: list[date] = []
    cursor = _month_first(today)
    for _ in range(MRR_TREND_MONTHS):
        months.append(cursor)
        cursor = _prev_month_first(cursor)
    months.reverse()

    trend = []
    for m_first in months:
        # 다음달 1일 = 이 달의 경계
        next_first = (
            m_first.replace(year=m_first.year + 1, month=1)
            if m_first.month == 12
            else m_first.replace(month=m_first.month + 1)
        )
        cohort = [t for t in active if t.created_at.date() < next_first]
        trend.append({"month": _month_key(m_first), "mrr": _mrr_of(cohort)})
    return trend


async def _system_status(db: AsyncSession) -> dict:
    # DB
    db_ok = True
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    # Redis
    redis_ok = False
    try:
        from app.core.redis import get_redis

        redis = await get_redis()
        redis_ok = bool(await redis.ping())
    except Exception:
        redis_ok = False

    # Celery (워커 응답 여부 — 베스트에포트, 워커 없으면 False)
    celery_ok = await _celery_ping()

    return {
        "server": True,
        "db": db_ok,
        "redis": redis_ok,
        "celery": celery_ok,
    }


async def _celery_ping() -> bool:
    def _ping() -> bool:
        try:
            from app.workers.celery_app import celery_app

            replies = celery_app.control.ping(timeout=0.3)
            return bool(replies)
        except Exception:
            return False

    try:
        return await asyncio.wait_for(asyncio.to_thread(_ping), timeout=1.0)
    except Exception:
        return False
