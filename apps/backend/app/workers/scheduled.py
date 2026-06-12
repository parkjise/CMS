"""T-034 스케줄링 Celery 태스크.

- reset_monthly_notification_count: 매월 1일 00:00 (Asia/Seoul) 카운터 초기화
- cleanup_old_inquiries: 매일 02:00 플랜별 보관 기간 초과 문의 소프트 삭제
- cleanup_old_analytics: 매일 02:30 플랜별 보관 기간 초과 통계 하드 삭제
"""

import asyncio
from datetime import date

from sqlalchemy import text

from app.workers.celery_app import celery_app

# 플랜별 보관 기간 (일). PREMIUM은 영구 보관 → None
INQUIRY_RETENTION_DAYS: dict[str, int | None] = {
    "BASIC": 30,
    "STANDARD": 180,
    "PREMIUM": None,
}

ANALYTICS_RETENTION_DAYS: dict[str, int | None] = {
    "BASIC": 90,
    "STANDARD": 365,
    "PREMIUM": 1095,
}


# ── reset_monthly_notification_count ───────────────────────────────────────


@celery_app.task(
    name="app.workers.scheduled.reset_monthly_notification_count",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def reset_monthly_notification_count(self) -> int:
    return asyncio.run(_reset_monthly_notification_count())


async def _reset_monthly_notification_count() -> int:
    """전체 테넌트의 monthly_kakao_count=0, monthly_reset_at=오늘월의1일."""
    from app.db.session import AsyncSessionLocal

    this_month_first = date.today().replace(day=1)

    async with AsyncSessionLocal() as db:
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await db.execute(
            text(
                "UPDATE notification_settings "
                "SET monthly_kakao_count = 0, monthly_reset_at = :first, "
                "updated_at = NOW()"
            ),
            {"first": this_month_first},
        )
        await db.commit()
        return result.rowcount or 0


# ── cleanup_old_inquiries ──────────────────────────────────────────────────


@celery_app.task(
    name="app.workers.scheduled.cleanup_old_inquiries",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def cleanup_old_inquiries(self) -> int:
    return asyncio.run(_cleanup_old_inquiries())


async def _cleanup_old_inquiries() -> int:
    """플랜별 보관 기간 초과 inquiries를 소프트 삭제. 총 삭제 행 수 반환."""
    from app.db.session import AsyncSessionLocal

    total = 0
    async with AsyncSessionLocal() as db:
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        for plan_type, retention in INQUIRY_RETENTION_DAYS.items():
            if retention is None:
                continue  # 영구 보관
            if not isinstance(retention, int) or retention < 0:
                continue
            result = await db.execute(
                text(
                    f"""
                    UPDATE inquiries
                    SET deleted_at = NOW(), updated_at = NOW()
                    WHERE deleted_at IS NULL
                      AND tenant_id IN (
                          SELECT id FROM tenants WHERE plan_type = :plan
                      )
                      AND created_at < NOW() - INTERVAL '{retention} days'
                    """
                ),
                {"plan": plan_type},
            )
            total += result.rowcount or 0
        await db.commit()
    return total


# ── cleanup_old_analytics ──────────────────────────────────────────────────


@celery_app.task(
    name="app.workers.scheduled.cleanup_old_analytics",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def cleanup_old_analytics(self) -> int:
    return asyncio.run(_cleanup_old_analytics())


async def _cleanup_old_analytics() -> int:
    """플랜별 보관 기간 초과 site_analytics 하드 삭제. 총 삭제 행 수 반환."""
    from app.db.session import AsyncSessionLocal

    total = 0
    async with AsyncSessionLocal() as db:
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        for plan_type, retention in ANALYTICS_RETENTION_DAYS.items():
            if retention is None:
                continue
            if not isinstance(retention, int) or retention < 0:
                continue
            result = await db.execute(
                text(
                    f"""
                    DELETE FROM site_analytics
                    WHERE tenant_id IN (
                        SELECT id FROM tenants WHERE plan_type = :plan
                    )
                    AND date < CURRENT_DATE - INTERVAL '{retention} days'
                    """
                ),
                {"plan": plan_type},
            )
            total += result.rowcount or 0
        await db.commit()
    return total
