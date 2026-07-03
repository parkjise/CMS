"""T-089 슈퍼 어드민 대시보드 API 테스트."""

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
async def dashboard_tenant():
    """PREMIUM 플랜 + 3일 후 만료 테넌트 (집계 검증용)."""
    tid = uuid.uuid4()
    slug = f"dash-{uuid.uuid4().hex[:8]}"
    expires = datetime.now(UTC) + timedelta(days=3)
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text(
                "INSERT INTO tenants "
                "(id, name, slug, plan_type, plan_expires_at, is_active, "
                " created_at, updated_at) "
                "VALUES (:id, :name, :slug, 'PREMIUM', :exp, true, now(), now())"
            ),
            {"id": str(tid), "name": "대시보드테스트", "slug": slug, "exp": expires},
        )
        await session.commit()
    yield {"id": str(tid), "slug": slug}
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("DELETE FROM tenants WHERE id = :id"), {"id": str(tid)}
        )
        await session.commit()


class TestDashboard:
    async def test_returns_all_widgets(self, client, super_headers, dashboard_tenant):
        resp = await client.get("/api/super/v1/dashboard", headers=super_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert set(data.keys()) >= {
            "stats",
            "plan_distribution",
            "mrr_trend",
            "expiring_tenants",
            "recent_tenants",
            "system",
        }

    async def test_stats_reflect_tenant(self, client, super_headers, dashboard_tenant):
        resp = await client.get("/api/super/v1/dashboard", headers=super_headers)
        data = resp.json()["data"]
        assert data["stats"]["total_tenants"] >= 1
        assert data["stats"]["active_tenants"] >= 1
        # PREMIUM 129,000원이 MRR에 반영
        assert data["stats"]["mrr"] >= 129_000

    async def test_mrr_trend_has_six_points(self, client, super_headers):
        resp = await client.get("/api/super/v1/dashboard", headers=super_headers)
        trend = resp.json()["data"]["mrr_trend"]
        assert len(trend) == 6
        assert all("month" in p and "mrr" in p for p in trend)

    async def test_expiring_includes_soon_tenant(
        self, client, super_headers, dashboard_tenant
    ):
        resp = await client.get("/api/super/v1/dashboard", headers=super_headers)
        expiring = resp.json()["data"]["expiring_tenants"]
        slugs = [e["slug"] for e in expiring]
        assert dashboard_tenant["slug"] in slugs

    async def test_recent_includes_tenant(
        self, client, super_headers, dashboard_tenant
    ):
        resp = await client.get("/api/super/v1/dashboard", headers=super_headers)
        recent = resp.json()["data"]["recent_tenants"]
        slugs = [r["slug"] for r in recent]
        assert dashboard_tenant["slug"] in slugs

    async def test_system_status_shape(self, client, super_headers):
        resp = await client.get("/api/super/v1/dashboard", headers=super_headers)
        system = resp.json()["data"]["system"]
        assert system["server"] is True
        assert set(system.keys()) == {"server", "db", "redis", "celery"}

    async def test_requires_super_admin(self, client, auth_headers):
        resp = await client.get("/api/super/v1/dashboard", headers=auth_headers)
        assert resp.status_code == 403

    async def test_unauthorized(self, client):
        resp = await client.get("/api/super/v1/dashboard")
        assert resp.status_code == 401
