"""T-100 커스텀 도메인 서비스/API/워커 테스트 (domain_mode=test stub)."""

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


async def _cleanup(tenant_id: str) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await s.execute(
            text("DELETE FROM tenant_domains WHERE tenant_id = :t"), {"t": tenant_id}
        )
        await s.execute(
            text("UPDATE tenants SET custom_domain = NULL WHERE id = :t"),
            {"t": tenant_id},
        )
        await s.commit()


def _domain() -> str:
    return f"www.{uuid.uuid4().hex[:8]}.com"


class TestDomainApi:
    async def test_register_and_status(
        self, client, auth_headers, test_tenant, test_user
    ):
        try:
            resp = await client.post(
                "/api/v1/domain/register",
                headers=auth_headers,
                json={"domain": _domain(), "domain_type": "CUSTOM"},
            )
            assert resp.status_code == 200, resp.text
            data = resp.json()["data"]
            assert data["status"] == "PENDING"
            assert data["cname_target"]

            st = await client.get("/api/v1/domain/status", headers=auth_headers)
            assert st.status_code == 200
        finally:
            await _cleanup(test_tenant["id"])

    async def test_verify_activates_domain(
        self, client, auth_headers, test_tenant, test_user
    ):
        try:
            dom = _domain()
            await client.post(
                "/api/v1/domain/register",
                headers=auth_headers,
                json={"domain": dom, "domain_type": "CUSTOM"},
            )
            # test 모드: DNS/SSL stub → 즉시 ACTIVE
            resp = await client.post("/api/v1/domain/verify", headers=auth_headers)
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert data["status"] == "ACTIVE"
            assert data["ssl_expires_at"] is not None
            assert data["verified_at"] is not None

            # tenants.custom_domain 반영 확인
            async with _TestSession() as s:
                await s.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                cd = (
                    await s.execute(
                        text("SELECT custom_domain FROM tenants WHERE id = :t"),
                        {"t": test_tenant["id"]},
                    )
                ).scalar_one()
                assert cd == dom
        finally:
            await _cleanup(test_tenant["id"])

    async def test_duplicate_registration_conflict(
        self, client, auth_headers, test_tenant, test_user
    ):
        try:
            await client.post(
                "/api/v1/domain/register",
                headers=auth_headers,
                json={"domain": _domain()},
            )
            dup = await client.post(
                "/api/v1/domain/register",
                headers=auth_headers,
                json={"domain": _domain()},
            )
            assert dup.status_code == 409
        finally:
            await _cleanup(test_tenant["id"])

    async def test_remove_domain(self, client, auth_headers, test_tenant, test_user):
        try:
            await client.post(
                "/api/v1/domain/register",
                headers=auth_headers,
                json={"domain": _domain()},
            )
            resp = await client.delete("/api/v1/domain", headers=auth_headers)
            assert resp.status_code == 200
            st = await client.get("/api/v1/domain/status", headers=auth_headers)
            assert st.status_code == 404
        finally:
            await _cleanup(test_tenant["id"])

    async def test_requires_auth(self, client):
        resp = await client.get("/api/v1/domain/status")
        assert resp.status_code == 401


class TestSuperDomainApi:
    async def test_list_and_ssl_renew(
        self, client, auth_headers, super_headers, test_tenant, test_user
    ):
        try:
            dom = _domain()
            await client.post(
                "/api/v1/domain/register",
                headers=auth_headers,
                json={"domain": dom},
            )
            await client.post("/api/v1/domain/verify", headers=auth_headers)

            listed = await client.get("/api/super/v1/domains", headers=super_headers)
            assert listed.status_code == 200
            items = listed.json()["data"]["items"]
            target = next(i for i in items if i["domain"] == dom)

            renew = await client.post(
                f"/api/super/v1/domains/{target['id']}/ssl-renew",
                headers=super_headers,
            )
            assert renew.status_code == 200
            assert renew.json()["data"]["ssl_expires_at"] is not None
        finally:
            await _cleanup(test_tenant["id"])

    async def test_list_requires_super_admin(self, client, auth_headers):
        resp = await client.get("/api/super/v1/domains", headers=auth_headers)
        assert resp.status_code == 403


class TestDomainWorker:
    async def test_poll_activates_in_test_mode(
        self, client, auth_headers, test_tenant, test_user
    ):
        from app.workers import domain as worker

        try:
            reg = await client.post(
                "/api/v1/domain/register",
                headers=auth_headers,
                json={"domain": _domain()},
            )
            domain_id = reg.json()["data"]["id"]
            result = await worker._poll_domain_dns(domain_id)
            assert result["status"] == "ACTIVE"
        finally:
            await _cleanup(test_tenant["id"])

    def test_ssl_renew_beat_registered(self):
        from app.workers.celery_app import celery_app

        names = {v["task"] for v in celery_app.conf.beat_schedule.values()}
        assert "app.workers.domain.renew_expiring_ssl" in names
