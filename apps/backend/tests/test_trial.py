"""T-099 무료 체험(Trial) 시스템 테스트."""

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


async def _cleanup(tenant_id: str) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        for table in (
            "payment_history",
            "subscriptions",
            "announcement_reads",
        ):
            await s.execute(
                text(f"DELETE FROM {table} WHERE tenant_id = :t"), {"t": tenant_id}
            )
        await s.execute(
            text("DELETE FROM announcements WHERE target_tenants @> ARRAY[:t]::uuid[]"),
            {"t": tenant_id},
        )
        await s.commit()


async def _trial_sub(session, tenant_id: str, **overrides):
    from app.models.billing import Subscription

    now = datetime.now(UTC)
    defaults = dict(
        id=uuid.uuid4(),
        tenant_id=uuid.UUID(tenant_id),
        plan_type="STANDARD",
        status="TRIAL",
        monthly_amount=89_000,
        trial_ends_at=now + timedelta(days=14),
        current_period_start=now,
        current_period_end=now + timedelta(days=14),
    )
    defaults.update(overrides)
    sub = Subscription(**defaults)
    session.add(sub)
    await session.commit()
    return sub


class TestStartTrial:
    async def test_start_trial_creates_trial_subscription(
        self, test_tenant, bypass_session
    ):
        from app.services import payment as svc

        try:
            sub = await svc.start_trial(bypass_session, uuid.UUID(test_tenant["id"]))
            assert sub.status == "TRIAL"
            assert sub.trial_ends_at is not None
            assert sub.billing_key is None
        finally:
            await _cleanup(test_tenant["id"])


class TestTrialStatusApi:
    async def test_trial_status(
        self, client, auth_headers, test_tenant, test_user, bypass_session
    ):
        try:
            await _trial_sub(bypass_session, test_tenant["id"])
            resp = await client.get(
                "/api/v1/billing/trial-status", headers=auth_headers
            )
            assert resp.status_code == 200, resp.text
            data = resp.json()["data"]
            assert data["is_trial"] is True
            assert data["status"] == "TRIAL"
            assert 12 <= data["days_left"] <= 14
        finally:
            await _cleanup(test_tenant["id"])

    async def test_requires_auth(self, client):
        resp = await client.get("/api/v1/billing/trial-status")
        assert resp.status_code == 401


class TestTrialExpiration:
    async def test_expired_trial_with_card_converts(self, test_tenant, bypass_session):
        from app.models.billing import Subscription
        from app.workers import billing as worker

        try:
            sub = await _trial_sub(
                bypass_session,
                test_tenant["id"],
                billing_key="billing_test_ok",
                trial_ends_at=datetime.now(UTC) - timedelta(hours=1),
            )
            result = await worker._process_trial_expirations()
            assert result["converted"] >= 1

            async with _TestSession() as s:
                await s.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                fresh = await s.get(Subscription, sub.id)
                assert fresh.status == "ACTIVE"
        finally:
            await _cleanup(test_tenant["id"])

    async def test_expired_trial_without_card_suspends(
        self, test_tenant, bypass_session
    ):
        from app.models.billing import Subscription
        from app.workers import billing as worker

        try:
            sub = await _trial_sub(
                bypass_session,
                test_tenant["id"],
                billing_key=None,
                trial_ends_at=datetime.now(UTC) - timedelta(hours=1),
            )
            result = await worker._process_trial_expirations()
            assert result["suspended"] >= 1

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


class TestTrialNotify:
    async def test_d3_notice_creates_announcement(self, test_tenant, bypass_session):
        from app.workers import billing as worker

        try:
            await _trial_sub(
                bypass_session,
                test_tenant["id"],
                trial_ends_at=datetime.now(UTC) + timedelta(days=3),
            )
            notified = await worker._notify_trial_ending()
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
