"""T-100 커스텀 도메인 Celery 태스크.

- poll_domain_dns: 등록 후 60초마다 DNS 전파 확인 (최대 24시간), 성공 시 활성화
- renew_expiring_ssl: 매일 SSL 만료 D-30 이하 도메인 자동 갱신
"""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text

from app.core.config import settings
from app.models.domain import TenantDomain
from app.workers.celery_app import celery_app

POLL_INTERVAL_SECONDS = 60
MAX_POLL_ATTEMPTS = 24 * 60  # 24시간 (60초 간격)


async def _bypass(db) -> None:
    await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))


@celery_app.task(
    name="app.workers.domain.poll_domain_dns",
    bind=True,
    max_retries=MAX_POLL_ATTEMPTS,
    default_retry_delay=POLL_INTERVAL_SECONDS,
)
def poll_domain_dns(self, domain_id: str) -> dict:
    result = asyncio.run(_poll_domain_dns(domain_id))
    if result.get("status") == "PENDING_DNS":
        # DNS 미전파 → 재시도
        raise self.retry(countdown=POLL_INTERVAL_SECONDS)
    return result


async def _poll_domain_dns(domain_id: str) -> dict:
    """DNS 전파 확인 후 활성화. 미전파면 재시도 신호 반환."""
    from app.db.session import AsyncSessionLocal
    from app.services import domain as domain_service

    async with AsyncSessionLocal() as db:
        await _bypass(db)
        row = await db.get(TenantDomain, uuid.UUID(domain_id))
        if row is None or row.status == "ACTIVE":
            return {"status": "DONE", "reason": "NOT_FOUND_OR_ACTIVE"}

        if not domain_service.verify_dns(row.domain, settings.domain_cname_target):
            return {"status": "PENDING_DNS", "domain": row.domain}

        activated = await domain_service.verify_domain(db, row.tenant_id)
        return {"status": activated.status, "domain": activated.domain}


@celery_app.task(
    name="app.workers.domain.renew_expiring_ssl",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def renew_expiring_ssl(self) -> int:
    return asyncio.run(_renew_expiring_ssl())


async def _renew_expiring_ssl() -> int:
    """SSL 만료 D-30 이하 ACTIVE 도메인 자동 갱신. 갱신 건수 반환."""
    from app.db.session import AsyncSessionLocal
    from app.services import domain as domain_service

    cutoff = datetime.now(UTC) + timedelta(days=settings.ssl_renew_before_days)
    renewed = 0
    async with AsyncSessionLocal() as db:
        await _bypass(db)
        rows = (
            (
                await db.execute(
                    select(TenantDomain).where(
                        TenantDomain.status == "ACTIVE",
                        TenantDomain.ssl_expires_at.isnot(None),
                        TenantDomain.ssl_expires_at < cutoff,
                    )
                )
            )
            .scalars()
            .all()
        )
        for row in rows:
            row.ssl_expires_at = domain_service.renew_ssl_certificate(row.domain)
            renewed += 1
        await db.commit()
    return renewed
