"""T-097 정기결제/구독 관리 Celery 태스크.

- process_monthly_billing: 매일 00:05 오늘 결제일 구독 자동 결제
- retry_billing: PAST_DUE 구독 재청구 (연속 실패 3회 → SUSPENDED + 차단)
- check_expiring_subscriptions: 매일 09:00 D-7/D-3 만료 예정 공지
- suspend_expired_subscriptions: 매일 00:10 만료 · 기간 끝난 해지 구독 접근 차단
- delete_cancelled_tenant_data: 매일 03:00 해지 기간 종료 후 30일 지나면 소프트 삭제
- purge_inactive_tenants: 매일 03:15 해지 30일 · 정지 90일 사업체 예고 · 파기 (T-198)

모든 태스크는 AsyncSessionLocal + 슈퍼 어드민 모드(RLS 우회)로 동작한다.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update

from app.db.session import affected_rows, set_super_admin_context
from app.models.billing import Subscription
from app.models.tenant import Tenant
from app.workers.celery_app import celery_app
from app.workers.runner import run_async

MAX_RETRY_FAILURES = 3
DATA_RETENTION_DAYS = 30
EXPIRING_ALERT_DAYS = (7, 3)


async def _bypass(db) -> None:
    await set_super_admin_context(db)


async def _block_tenant(db, tenant_id) -> None:
    """사이트 · 관리자 접근 차단 + 공개 사이트 캐시 비우기."""
    from app.services import site_cache

    await db.execute(
        update(Tenant).where(Tenant.id == tenant_id).values(is_active=False)
    )
    await db.commit()
    await site_cache.purge_site(db, tenant_id)


# ── process_monthly_billing ────────────────────────────────────────────────
@celery_app.task(
    name="app.workers.billing.process_monthly_billing",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def process_monthly_billing(self) -> int:
    return run_async(_process_monthly_billing())


async def _process_monthly_billing() -> int:
    """오늘 결제일(current_period_end 날짜=오늘)인 ACTIVE 구독 자동 결제."""
    from app.db.session import AsyncSessionLocal
    from app.services import payment as payment_service

    today = datetime.now(UTC).date()
    charged = 0
    async with AsyncSessionLocal() as db:
        await _bypass(db)
        subs = (
            (
                await db.execute(
                    select(Subscription).where(
                        Subscription.status == "ACTIVE",
                        func.date(Subscription.current_period_end) == today,
                    )
                )
            )
            .scalars()
            .all()
        )
        for sub in subs:
            await payment_service.charge_subscription(db, sub)
            charged += 1
    return charged


# ── retry_billing ──────────────────────────────────────────────────────────
@celery_app.task(
    name="app.workers.billing.retry_billing",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def retry_billing(self) -> dict:
    return run_async(_retry_billing())


async def _retry_billing() -> dict:
    """PAST_DUE 구독 재청구. 연속 실패 3회 이상이면 SUSPENDED로 전환."""
    from app.db.session import AsyncSessionLocal
    from app.services import billing_notice
    from app.services import payment as payment_service

    retried = 0
    recovered = 0
    suspended = 0
    async with AsyncSessionLocal() as db:
        await _bypass(db)
        subs = (
            (
                await db.execute(
                    select(Subscription).where(Subscription.status == "PAST_DUE")
                )
            )
            .scalars()
            .all()
        )
        for sub in subs:
            retried += 1
            payment = await payment_service.charge_subscription(db, sub)
            if payment.status == "SUCCESS":
                recovered += 1
                continue
            fail_count = await payment_service.consecutive_failures(db, sub)
            if fail_count >= MAX_RETRY_FAILURES:
                sub.status = "SUSPENDED"
                await _block_tenant(db, sub.tenant_id)
                await billing_notice.suspended(db, sub.tenant_id)
                suspended += 1
    return {"retried": retried, "recovered": recovered, "suspended": suspended}


# ── check_expiring_subscriptions ───────────────────────────────────────────
@celery_app.task(
    name="app.workers.billing.check_expiring_subscriptions",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def check_expiring_subscriptions(self) -> int:
    return run_async(_check_expiring_subscriptions())


async def _check_expiring_subscriptions() -> int:
    """D-7, D-3 만료 예정 ACTIVE 구독에 대해 대상 테넌트 공지 생성."""
    from app.db.session import AsyncSessionLocal
    from app.services import announcement as announcement_service
    from app.services import billing_notice

    today = datetime.now(UTC).date()
    notified = 0
    async with AsyncSessionLocal() as db:
        await _bypass(db)
        subs = (
            (
                await db.execute(
                    select(Subscription).where(Subscription.status == "ACTIVE")
                )
            )
            .scalars()
            .all()
        )
        for sub in subs:
            days_left = (sub.current_period_end.date() - today).days
            if days_left not in EXPIRING_ALERT_DAYS:
                continue
            await announcement_service.create_announcement(
                db,
                actor_id=None,
                title="구독 만료 예정 안내",
                content=(
                    f"구독이 {days_left}일 후 만료됩니다. "
                    "서비스 중단을 방지하려면 결제 수단을 확인해 주세요."
                ),
                type="WARNING",
                target_type="SELECTIVE",
                target_plan=None,
                target_tenants=[sub.tenant_id],
                show_in_admin=True,
                send_email=False,
                send_kakao=False,
                publish_now=True,
                published_at=None,
                expires_at=sub.current_period_end,
            )
            await billing_notice.expiring(db, sub.tenant_id, days_left)
            notified += 1
    return notified


# ── suspend_expired_subscriptions ──────────────────────────────────────────
@celery_app.task(
    name="app.workers.billing.suspend_expired_subscriptions",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def suspend_expired_subscriptions(self) -> int:
    return run_async(_suspend_expired_subscriptions())


async def _suspend_expired_subscriptions() -> int:
    """현재 주기가 끝난 구독 차단 — ACTIVE 는 SUSPENDED 로, 해지는 상태 그대로 (15.7).

    PAST_DUE 는 재시도 3회가 끝날 때까지 두고 retry_billing 이 처리한다.
    """
    from app.db.session import AsyncSessionLocal
    from app.services import billing_notice

    now = datetime.now(UTC)
    suspended = 0
    async with AsyncSessionLocal() as db:
        await _bypass(db)
        subs = (
            (
                await db.execute(
                    select(Subscription).where(
                        Subscription.status.in_(("ACTIVE", "CANCELLED")),
                        Subscription.current_period_end < now,
                        Subscription.tenant_id.in_(
                            select(Tenant.id).where(Tenant.is_active.is_(True))
                        ),
                    )
                )
            )
            .scalars()
            .all()
        )
        for sub in subs:
            if sub.status == "ACTIVE":
                sub.status = "SUSPENDED"
            await _block_tenant(db, sub.tenant_id)
            await billing_notice.suspended(db, sub.tenant_id)
            suspended += 1
    return suspended


# ── delete_cancelled_tenant_data ───────────────────────────────────────────
@celery_app.task(
    name="app.workers.billing.delete_cancelled_tenant_data",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def delete_cancelled_tenant_data(self) -> int:
    return run_async(_delete_cancelled_tenant_data())


async def _delete_cancelled_tenant_data() -> int:
    """해지하고 구독 기간이 끝난 뒤 30일 지난 테넌트를 소프트 삭제(deleted_at)."""
    from app.db.session import AsyncSessionLocal

    cutoff = datetime.now(UTC) - timedelta(days=DATA_RETENTION_DAYS)
    deleted = 0
    async with AsyncSessionLocal() as db:
        await _bypass(db)
        subs = (
            (
                await db.execute(
                    select(Subscription).where(
                        Subscription.status == "CANCELLED",
                        Subscription.current_period_end < cutoff,
                    )
                )
            )
            .scalars()
            .all()
        )
        for sub in subs:
            result = await db.execute(
                update(Tenant)
                .where(Tenant.id == sub.tenant_id, Tenant.deleted_at.is_(None))
                .values(deleted_at=datetime.now(UTC), is_active=False)
            )
            deleted += affected_rows(result)
        await db.commit()
    return deleted


# ── notify_trial_ending (T-099) ────────────────────────────────────────────
@celery_app.task(
    name="app.workers.billing.notify_trial_ending",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def notify_trial_ending(self) -> int:
    return run_async(_notify_trial_ending())


async def _notify_trial_ending() -> int:
    """무료 체험 D-3 구독에 카드 등록 안내 공지 생성."""
    from app.db.session import AsyncSessionLocal
    from app.services import announcement as announcement_service
    from app.services import billing_notice

    today = datetime.now(UTC).date()
    notified = 0
    async with AsyncSessionLocal() as db:
        await _bypass(db)
        subs = (
            (
                await db.execute(
                    select(Subscription).where(
                        Subscription.status == "TRIAL",
                        Subscription.trial_ends_at.isnot(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        for sub in subs:
            if sub.trial_ends_at is None:
                continue
            days_left = (sub.trial_ends_at.date() - today).days
            if days_left != 3:
                continue
            await announcement_service.create_announcement(
                db,
                actor_id=None,
                title="무료 체험 종료 예정 안내",
                content=(
                    "무료 체험이 3일 후 종료됩니다. "
                    "서비스를 계속 이용하려면 결제 수단을 등록해 주세요."
                ),
                type="WARNING",
                target_type="SELECTIVE",
                target_plan=None,
                target_tenants=[sub.tenant_id],
                show_in_admin=True,
                send_email=False,
                send_kakao=False,
                publish_now=True,
                published_at=None,
                expires_at=sub.trial_ends_at,
            )
            await billing_notice.expiring(db, sub.tenant_id, days_left)
            notified += 1
    return notified


# ── process_trial_expirations (T-099) ──────────────────────────────────────
@celery_app.task(
    name="app.workers.billing.process_trial_expirations",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def process_trial_expirations(self) -> dict:
    return run_async(_process_trial_expirations())


async def _process_trial_expirations() -> dict:
    """종료된 무료 체험 처리: 카드 O → ACTIVE+첫 결제 / 카드 X → SUSPENDED+차단."""
    from app.db.session import AsyncSessionLocal
    from app.services import billing_notice
    from app.services import payment as payment_service

    now = datetime.now(UTC)
    converted = 0
    suspended = 0
    async with AsyncSessionLocal() as db:
        await _bypass(db)
        subs = (
            (
                await db.execute(
                    select(Subscription).where(
                        Subscription.status == "TRIAL",
                        Subscription.trial_ends_at.isnot(None),
                        Subscription.trial_ends_at < now,
                    )
                )
            )
            .scalars()
            .all()
        )
        for sub in subs:
            if sub.billing_key:
                sub.status = "ACTIVE"
                await db.commit()
                await payment_service.charge_subscription(db, sub)
                converted += 1
            else:
                sub.status = "SUSPENDED"
                await _block_tenant(db, sub.tenant_id)
                await billing_notice.suspended(db, sub.tenant_id)
                suspended += 1
    return {"converted": converted, "suspended": suspended}


# ── purge_inactive_tenants (T-198) ─────────────────────────────────────────
@celery_app.task(
    name="app.workers.billing.purge_inactive_tenants",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def purge_inactive_tenants(self) -> dict:
    return run_async(_purge_inactive_tenants())


async def _purge_inactive_tenants() -> dict:
    """해지 30일 · 정지 90일 지난 사업체 — 7일 전 예고, 예고 7일 뒤 데이터 파기."""
    from app.db.session import AsyncSessionLocal
    from app.services import tenant_purge

    async with AsyncSessionLocal() as db:
        await _bypass(db)
        notified = await tenant_purge.notify_upcoming(db)
        purged = await tenant_purge.purge_due(db)
    return {"notified": notified, "purged": purged}
