"""T-097 정기결제 Celery 태스크 테스트 (async 헬퍼 직접 호출)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from tests.conftest import _TestSession  # type: ignore


@pytest.fixture
async def bypass_session():
    session = _TestSession()
    await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    yield session
    await session.close()


async def _make_sub(session, tenant_id: str, **overrides):
    from app.models.billing import Subscription

    now = datetime.now(UTC)
    defaults = dict(
        id=uuid.uuid4(),
        tenant_id=uuid.UUID(tenant_id),
        plan_type="STANDARD",
        status="ACTIVE",
        billing_key="billing_test_x",
        monthly_amount=89_000,
        current_period_start=now - timedelta(days=30),
        current_period_end=now,
    )
    defaults.update(overrides)
    sub = Subscription(**defaults)
    session.add(sub)
    await session.commit()
    return sub


async def _cleanup(tenant_id: str) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        for table in (
            "payment_history",
            "plan_change_history",
            "subscriptions",
            "announcement_reads",
            "announcements",
        ):
            if table == "announcements":
                await s.execute(
                    text(
                        "DELETE FROM announcements "
                        "WHERE target_tenants @> ARRAY[:t]::uuid[]"
                    ),
                    {"t": tenant_id},
                )
            else:
                await s.execute(
                    text(f"DELETE FROM {table} WHERE tenant_id = :t"), {"t": tenant_id}
                )
        await s.commit()


class TestBeatSchedule:
    def test_five_billing_tasks_registered(self):
        from app.workers.celery_app import celery_app

        names = {v["task"] for v in celery_app.conf.beat_schedule.values()}
        assert "app.workers.billing.process_monthly_billing" in names
        assert "app.workers.billing.retry_billing" in names
        assert "app.workers.billing.check_expiring_subscriptions" in names
        assert "app.workers.billing.suspend_expired_subscriptions" in names
        assert "app.workers.billing.delete_cancelled_tenant_data" in names


class TestProcessMonthlyBilling:
    async def test_charges_due_subscription(self, test_tenant, bypass_session):
        from app.models.billing import PaymentHistory
        from app.workers import billing as worker

        try:
            now = datetime.now(UTC)
            await _make_sub(
                bypass_session,
                test_tenant["id"],
                current_period_end=now,  # 오늘 결제일
            )
            charged = await worker._process_monthly_billing()
            assert charged >= 1

            async with _TestSession() as s:
                await s.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                from sqlalchemy import select

                pay = (
                    await s.execute(
                        select(PaymentHistory).where(
                            PaymentHistory.tenant_id == uuid.UUID(test_tenant["id"])
                        )
                    )
                ).scalar_one()
                assert pay.status == "SUCCESS"
        finally:
            await _cleanup(test_tenant["id"])


class TestSuspendExpired:
    async def test_suspends_and_blocks(self, test_tenant, bypass_session):
        from app.models.billing import Subscription
        from app.workers import billing as worker

        try:
            now = datetime.now(UTC)
            sub = await _make_sub(
                bypass_session,
                test_tenant["id"],
                current_period_end=now - timedelta(days=1),  # 만료됨
            )
            suspended = await worker._suspend_expired_subscriptions()
            assert suspended >= 1

            async with _TestSession() as s:
                await s.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                fresh = await s.get(Subscription, sub.id)
                assert fresh.status == "SUSPENDED"
                active = (
                    await s.execute(
                        text("SELECT is_active FROM tenants WHERE id = :t"),
                        {"t": test_tenant["id"]},
                    )
                ).scalar_one()
                assert active is False
        finally:
            await _cleanup(test_tenant["id"])


class TestCheckExpiring:
    async def test_creates_announcement(self, test_tenant, bypass_session):
        from app.workers import billing as worker

        try:
            now = datetime.now(UTC)
            await _make_sub(
                bypass_session,
                test_tenant["id"],
                current_period_end=now + timedelta(days=7),  # D-7
            )
            notified = await worker._check_expiring_subscriptions()
            assert notified >= 1

            async with _TestSession() as s:
                await s.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                cnt = (
                    await s.execute(
                        text(
                            "SELECT count(*) FROM announcements "
                            "WHERE target_tenants @> ARRAY[:t]::uuid[]"
                        ),
                        {"t": test_tenant["id"]},
                    )
                ).scalar_one()
                assert cnt >= 1
        finally:
            await _cleanup(test_tenant["id"])


class TestRetryBilling:
    async def test_recovers_with_billing_key(self, test_tenant, bypass_session):
        from app.models.billing import Subscription
        from app.workers import billing as worker

        try:
            sub = await _make_sub(
                bypass_session,
                test_tenant["id"],
                status="PAST_DUE",
                billing_key="billing_test_ok",
            )
            result = await worker._retry_billing()
            assert result["recovered"] >= 1

            async with _TestSession() as s:
                await s.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                fresh = await s.get(Subscription, sub.id)
                assert fresh.status == "ACTIVE"
        finally:
            await _cleanup(test_tenant["id"])

    async def test_suspends_after_three_failures(self, test_tenant, bypass_session):
        from app.models.billing import PaymentHistory, Subscription
        from app.workers import billing as worker

        try:
            # 결제수단 없음 → 청구 실패 유도
            sub = await _make_sub(
                bypass_session,
                test_tenant["id"],
                status="PAST_DUE",
                billing_key=None,
            )
            # 기존 실패 이력 3건
            for _ in range(3):
                bypass_session.add(
                    PaymentHistory(
                        id=uuid.uuid4(),
                        tenant_id=uuid.UUID(test_tenant["id"]),
                        subscription_id=sub.id,
                        order_id=f"fail-{uuid.uuid4().hex[:10]}",
                        amount=89_000,
                        status="FAILED",
                    )
                )
            await bypass_session.commit()

            result = await worker._retry_billing()
            assert result["suspended"] >= 1

            async with _TestSession() as s:
                await s.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                fresh = await s.get(Subscription, sub.id)
                assert fresh.status == "SUSPENDED"
        finally:
            await _cleanup(test_tenant["id"])


class TestDeleteCancelled:
    async def test_soft_deletes_old_cancelled_tenant(self, test_tenant, bypass_session):
        from app.workers import billing as worker

        try:
            now = datetime.now(UTC)
            await _make_sub(
                bypass_session,
                test_tenant["id"],
                status="CANCELLED",
                cancelled_at=now - timedelta(days=31),
            )
            deleted = await worker._delete_cancelled_tenant_data()
            assert deleted >= 1

            async with _TestSession() as s:
                await s.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                del_at = (
                    await s.execute(
                        text("SELECT deleted_at FROM tenants WHERE id = :t"),
                        {"t": test_tenant["id"]},
                    )
                ).scalar_one()
                assert del_at is not None
        finally:
            await _cleanup(test_tenant["id"])
