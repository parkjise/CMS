"""AI 월간 리포트 자동 생성 (T-073-A, 기획서 13.2 기능 3).

매달 1일 06:00 — 기능이 켜진 STANDARD · PREMIUM 사업체마다 지난달 리포트를 만들고
관리자에게 메일로 알린다. 같은 달 자동 리포트가 이미 있으면 건너뛴다.
"""

import asyncio
import logging
from datetime import UTC, date, datetime

from sqlalchemy import select

from app.db.session import set_super_admin_context
from app.models.ai import AiReport
from app.models.tenant import Tenant
from app.services import ai_report as report_service
from app.workers.celery_app import celery_app

logger = logging.getLogger("app.ai")

FEATURE_KEY = "AI_MONTHLY_REPORT"


@celery_app.task(name="app.workers.ai_report.generate_monthly_reports")
def generate_monthly_reports() -> dict:
    return asyncio.run(_generate_monthly_reports())


async def _generate_monthly_reports(today: date | None = None) -> dict:
    from app.db.session import AsyncSessionLocal
    from app.services import announcement as announcement_service
    from app.services import email as email_service
    from app.services import feature as feature_service

    today = today or datetime.now(UTC).date()
    period = report_service.previous_month(today)
    created = skipped = failed = 0

    async with AsyncSessionLocal() as db:
        await set_super_admin_context(db)
        tenants = list(
            (
                await db.execute(
                    select(Tenant).where(
                        Tenant.is_active.is_(True),
                        Tenant.deleted_at.is_(None),
                        Tenant.plan_type.in_(list(report_service.REPORT_LIMITS)),
                    )
                )
            )
            .scalars()
            .all()
        )
        for tenant in tenants:
            try:
                if not await feature_service.is_enabled(db, tenant.id, FEATURE_KEY):
                    skipped += 1
                    continue
                exists = (
                    await db.execute(
                        select(AiReport.id).where(
                            AiReport.tenant_id == tenant.id,
                            AiReport.period == period,
                            AiReport.kind == "AUTO",
                        )
                    )
                ).first()
                if exists:
                    skipped += 1
                    continue
                report = await report_service.generate_report(
                    db, tenant, kind="AUTO", period=period
                )
                await set_super_admin_context(db)  # commit 뒤 컨텍스트 다시
                created += 1
                for to in await announcement_service.resolve_admin_emails(
                    db, [tenant.id]
                ):
                    try:
                        await email_service.send_monthly_report_email(
                            to,
                            period=period.strftime("%Y년 %m월"),
                            summary=report.summary,
                            improvement_count=len(report.improvements),
                        )
                    except Exception:  # noqa: BLE001 - 메일 실패가 생성을 막지 않는다
                        logger.warning("월간 리포트 메일 실패", exc_info=True)
            except Exception:  # noqa: BLE001 - 한 사업체 실패가 나머지를 막지 않는다
                failed += 1
                logger.exception("월간 리포트 생성 실패 tenant=%s", tenant.id)
                await db.rollback()
                await set_super_admin_context(db)

    return {
        "period": period.isoformat(),
        "created": created,
        "skipped": skipped,
        "failed": failed,
    }
