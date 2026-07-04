"""T-093 슈퍼 어드민 모니터링/수익 API 테스트."""

import uuid

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


class TestMonitoring:
    async def test_returns_all_sections(self, client, super_headers):
        resp = await client.get("/api/super/v1/monitoring", headers=super_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert set(data.keys()) == {"ai_cost", "kakao", "queue", "errors"}
        assert len(data["ai_cost"]["monthly"]) == 6
        # Sentry 미연동
        assert data["errors"]["sentry_configured"] is False

    async def test_ai_cost_shape(self, client, super_headers):
        resp = await client.get("/api/super/v1/monitoring", headers=super_headers)
        monthly = resp.json()["data"]["ai_cost"]["monthly"]
        assert all({"month", "tokens", "cost_usd"} <= set(m) for m in monthly)

    async def test_requires_super_admin(self, client, auth_headers):
        resp = await client.get("/api/super/v1/monitoring", headers=auth_headers)
        assert resp.status_code == 403

    async def test_unauthorized(self, client):
        resp = await client.get("/api/super/v1/monitoring")
        assert resp.status_code == 401


class TestRevenue:
    async def test_returns_all_sections(self, client, super_headers):
        resp = await client.get("/api/super/v1/revenue", headers=super_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert set(data.keys()) == {
            "mrr_trend",
            "plan_distribution",
            "expiring_tenants",
            "movement",
        }
        assert len(data["mrr_trend"]) == 6

    async def test_months_param(self, client, super_headers):
        resp = await client.get(
            "/api/super/v1/revenue?months=12", headers=super_headers
        )
        assert resp.status_code == 200
        assert len(resp.json()["data"]["mrr_trend"]) == 12

    async def test_movement_shape(self, client, super_headers):
        resp = await client.get("/api/super/v1/revenue", headers=super_headers)
        movement = resp.json()["data"]["movement"]
        assert set(movement.keys()) == {"new", "churned", "upgraded", "downgraded"}

    async def test_requires_super_admin(self, client, auth_headers):
        resp = await client.get("/api/super/v1/revenue", headers=auth_headers)
        assert resp.status_code == 403
