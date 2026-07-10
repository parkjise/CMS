"""T-103 슈퍼 어드민 결제 현황 API 테스트."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.core.security import create_access_token
from tests.conftest import _TestSession  # type: ignore


@pytest.fixture
async def super_headers() -> dict:
    user_id = uuid.uuid4()
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text(
                "INSERT INTO users "
                "(id, tenant_id, email, password_hash, role, is_active, "
                " created_at, updated_at) "
                "VALUES (:id, NULL, :email, 'x', 'SUPER_ADMIN', true, now(), now())"
            ),
            {"id": str(user_id), "email": f"sa-{uuid.uuid4().hex[:6]}@cms.io"},
        )
        await session.commit()
    token = create_access_token(
        user_id=user_id, tenant_id=None, role="SUPER_ADMIN", is_super_admin=True
    )
    yield {"Authorization": f"Bearer {token}"}
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("DELETE FROM users WHERE id = :id"), {"id": str(user_id)}
        )
        await session.commit()


@pytest.fixture
async def bypass_session():
    session = _TestSession()
    await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    yield session
    await session.close()


async def _cleanup(tenant_id: str) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        for table in ("payment_history", "subscriptions"):
            await s.execute(
                text(f"DELETE FROM {table} WHERE tenant_id = :t"), {"t": tenant_id}
            )
        await s.commit()


async def _sub(session, tenant_id: str, status: str = "PAST_DUE", **over):
    from app.models.billing import Subscription

    now = datetime.now(UTC)
    defaults = dict(
        id=uuid.uuid4(),
        tenant_id=uuid.UUID(tenant_id),
        plan_type="STANDARD",
        status=status,
        billing_key="billing_test_ok",
        monthly_amount=89_000,
        current_period_start=now - timedelta(days=30),
        current_period_end=now,
    )
    defaults.update(over)
    sub = Subscription(**defaults)
    session.add(sub)
    await session.commit()
    return sub


class TestOverview:
    async def test_overview_shape_and_past_due(
        self, client, super_headers, test_tenant, bypass_session
    ):
        try:
            await _sub(bypass_session, test_tenant["id"], status="PAST_DUE")
            resp = await client.get(
                "/api/super/v1/billing/overview", headers=super_headers
            )
            assert resp.status_code == 200, resp.text
            data = resp.json()["data"]
            assert set(data.keys()) == {
                "mrr",
                "past_due_count",
                "cancelled_count",
                "new_this_month",
                "past_due_tenants",
            }
            slugs = [t["tenant_id"] for t in data["past_due_tenants"]]
            assert test_tenant["id"] in slugs
        finally:
            await _cleanup(test_tenant["id"])

    async def test_requires_super_admin(self, client, auth_headers):
        resp = await client.get("/api/super/v1/billing/overview", headers=auth_headers)
        assert resp.status_code == 403


class TestManualCharge:
    async def test_manual_charge_success(
        self, client, super_headers, test_tenant, bypass_session
    ):
        try:
            await _sub(bypass_session, test_tenant["id"], status="PAST_DUE")
            resp = await client.post(
                f"/api/super/v1/billing/manual-charge/{test_tenant['id']}",
                headers=super_headers,
            )
            assert resp.status_code == 200, resp.text
            assert resp.json()["data"]["status"] == "SUCCESS"
        finally:
            await _cleanup(test_tenant["id"])


class TestRefund:
    async def test_refund_success_payment(
        self, client, super_headers, test_tenant, bypass_session
    ):
        from app.models.billing import PaymentHistory

        try:
            sub = await _sub(bypass_session, test_tenant["id"], status="ACTIVE")
            pay = PaymentHistory(
                id=uuid.uuid4(),
                tenant_id=uuid.UUID(test_tenant["id"]),
                subscription_id=sub.id,
                order_id=f"o-{uuid.uuid4().hex[:8]}",
                amount=89_000,
                status="SUCCESS",
                payment_key="pk_test",
            )
            bypass_session.add(pay)
            await bypass_session.commit()

            resp = await client.post(
                f"/api/super/v1/billing/refund/{pay.id}",
                headers=super_headers,
                json={"reason": "고객 요청"},
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["status"] == "REFUNDED"
        finally:
            await _cleanup(test_tenant["id"])

    async def test_refund_non_success_conflict(
        self, client, super_headers, test_tenant, bypass_session
    ):
        from app.models.billing import PaymentHistory

        try:
            sub = await _sub(bypass_session, test_tenant["id"], status="ACTIVE")
            pay = PaymentHistory(
                id=uuid.uuid4(),
                tenant_id=uuid.UUID(test_tenant["id"]),
                subscription_id=sub.id,
                order_id=f"o-{uuid.uuid4().hex[:8]}",
                amount=89_000,
                status="FAILED",
            )
            bypass_session.add(pay)
            await bypass_session.commit()

            resp = await client.post(
                f"/api/super/v1/billing/refund/{pay.id}",
                headers=super_headers,
                json={},
            )
            assert resp.status_code == 409
        finally:
            await _cleanup(test_tenant["id"])
