"""T-034 스케줄링 Celery 태스크.

- reset_monthly_notification_count: 매월 1일 00:00 (Asia/Seoul) 카운터 초기화
- cleanup_old_inquiries: 매일 02:00 플랜별 보관 기간 초과 문의 소프트 삭제
- cleanup_old_analytics: 매일 02:30 플랜별 보관 기간 초과 통계 하드 삭제
"""

from datetime import date

from sqlalchemy import text

from app.db.session import affected_rows, set_super_admin_context
from app.workers.celery_app import celery_app
from app.workers.runner import run_async

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

# 템플릿 변경 이력 보관 기간 (일). 초과분은 하드 삭제.
TEMPLATE_HISTORY_RETENTION_DAYS = 7

# 문의 접수 IP · 브라우저 정보 보관 기간 (일). 문의 내용과 별개로 먼저 지운다 (T-128).
INQUIRY_CLIENT_INFO_RETENTION_DAYS = 90


# ── reset_monthly_notification_count ───────────────────────────────────────


@celery_app.task(
    name="app.workers.scheduled.reset_monthly_notification_count",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def reset_monthly_notification_count(self) -> int:
    return run_async(_reset_monthly_notification_count())


async def _reset_monthly_notification_count() -> int:
    """전체 테넌트의 monthly_kakao_count=0, monthly_reset_at=오늘월의1일."""
    from app.db.session import AsyncSessionLocal

    this_month_first = date.today().replace(day=1)

    async with AsyncSessionLocal() as db:
        await set_super_admin_context(db)
        result = await db.execute(
            text(
                "UPDATE notification_settings "
                "SET monthly_kakao_count = 0, monthly_reset_at = :first, "
                "updated_at = NOW()"
            ),
            {"first": this_month_first},
        )
        await db.commit()
        return affected_rows(result)


# ── scrub_inquiry_client_info (T-128) ────────────────────────────────────


@celery_app.task(
    name="app.workers.scheduled.scrub_inquiry_client_info",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def scrub_inquiry_client_info(self) -> int:
    return run_async(_scrub_inquiry_client_info())


async def _scrub_inquiry_client_info() -> int:
    """보관 기간이 지난 문의의 IP · 브라우저 정보를 지운다. 지운 행 수 반환.

    모든 요금제 · 소프트 삭제된 문의까지 — PREMIUM 문의는 영구 보관이라 따로 지운다.
    """
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        await set_super_admin_context(db)
        result = await db.execute(
            text(
                """
                UPDATE inquiries
                SET ip_address = NULL, user_agent = NULL
                WHERE (ip_address IS NOT NULL OR user_agent IS NOT NULL)
                  AND created_at < NOW() - make_interval(days => :days)
                """
            ),
            {"days": INQUIRY_CLIENT_INFO_RETENTION_DAYS},
        )
        await db.commit()
    return affected_rows(result)


# ── cleanup_old_inquiries ──────────────────────────────────────────────────


@celery_app.task(
    name="app.workers.scheduled.cleanup_old_inquiries",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def cleanup_old_inquiries(self) -> int:
    return run_async(_cleanup_old_inquiries())


async def _cleanup_old_inquiries() -> int:
    """플랜별 보관 기간 초과 inquiries를 소프트 삭제. 총 삭제 행 수 반환."""
    from app.db.session import AsyncSessionLocal

    total = 0
    async with AsyncSessionLocal() as db:
        await set_super_admin_context(db)
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
            total += affected_rows(result)
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
    return run_async(_cleanup_old_analytics())


async def _cleanup_old_analytics() -> int:
    """플랜별 보관 기간 초과 site_analytics 하드 삭제. 총 삭제 행 수 반환."""
    from app.db.session import AsyncSessionLocal

    total = 0
    async with AsyncSessionLocal() as db:
        await set_super_admin_context(db)
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
            total += affected_rows(result)
        await db.commit()
    return total


# ── cleanup_old_template_history ───────────────────────────────────────────


@celery_app.task(
    name="app.workers.scheduled.cleanup_old_template_history",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def cleanup_old_template_history(self) -> int:
    return run_async(_cleanup_old_template_history())


async def _cleanup_old_template_history(
    retention_days: int = TEMPLATE_HISTORY_RETENTION_DAYS,
) -> int:
    """보관 기간(기본 7일) 초과 template_change_history 하드 삭제. 삭제 행 수 반환."""
    from app.db.session import AsyncSessionLocal

    if not isinstance(retention_days, int) or retention_days < 0:
        raise ValueError("retention_days must be a non-negative integer")

    async with AsyncSessionLocal() as db:
        await set_super_admin_context(db)
        result = await db.execute(
            text(
                f"""
                DELETE FROM template_change_history
                WHERE changed_at < NOW() - INTERVAL '{retention_days} days'
                """
            )
        )
        await db.commit()
        return affected_rows(result)
