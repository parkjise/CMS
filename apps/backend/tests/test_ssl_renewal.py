"""T-105 SSL 자동 갱신 실패 알림 + 대시보드 SSL 만료 위젯 테스트."""

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


async def _make_domain(tenant_id: str, days_to_expire: int, status: str = "ACTIVE"):
    from app.models.domain import TenantDomain

    did = uuid.uuid4()
    dom = f"www.{uuid.uuid4().hex[:8]}.com"
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        s.add(
            TenantDomain(
                id=did,
                tenant_id=uuid.UUID(tenant_id),
                domain=dom,
                domain_type="CUSTOM",
                status=status,
                ssl_expires_at=datetime.now(UTC) + timedelta(days=days_to_expire),
                verified_at=datetime.now(UTC),
            )
        )
        await s.commit()
    return did, dom


async def _cleanup(tenant_id: str) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await s.execute(
            text("DELETE FROM tenant_domains WHERE tenant_id = :t"), {"t": tenant_id}
        )
        await s.commit()


class TestSslRenewal:
    async def test_renew_success_extends_expiry(self, test_tenant):
        from app.workers import domain as worker

        try:
            await _make_domain(test_tenant["id"], days_to_expire=10)  # D-10 → 갱신 대상
            result = await worker._renew_expiring_ssl()
            assert result["renewed"] >= 1
            assert result["failed"] == 0
        finally:
            await _cleanup(test_tenant["id"])

    async def test_renew_failure_alerts_super_admin(self, test_tenant, monkeypatch):
        from app.services import domain as domain_service
        from app.workers import domain as worker
        from app.workers import email as email_worker

        calls: list[str] = []
        monkeypatch.setattr(
            email_worker.send_email_async,
            "delay",
            lambda *a, **k: calls.append(a[2] if len(a) > 2 else k.get("template")),
        )

        def _boom(domain):
            raise domain_service.DomainError("certbot 실패")

        monkeypatch.setattr(domain_service, "renew_ssl_certificate", _boom)

        try:
            await _make_domain(test_tenant["id"], days_to_expire=5)
            result = await worker._renew_expiring_ssl()
            assert result["failed"] >= 1
            assert "ssl_renew_failed" in calls
        finally:
            await _cleanup(test_tenant["id"])


class TestDashboardSslWidget:
    async def test_ssl_expiring_in_dashboard(self, client, super_headers, test_tenant):
        try:
            _, dom = await _make_domain(test_tenant["id"], days_to_expire=7)
            resp = await client.get("/api/super/v1/dashboard", headers=super_headers)
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert "ssl_expiring" in data
            domains = [d["domain"] for d in data["ssl_expiring"]]
            assert dom in domains
        finally:
            await _cleanup(test_tenant["id"])
