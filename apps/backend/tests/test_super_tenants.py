"""T-085 슈퍼 어드민 테넌트 관리 API 테스트."""

import uuid

import pytest
from httpx import AsyncClient
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


async def _cleanup_tenant(slug: str) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        # Trial 구독(T-099) 등 tenant 참조 데이터 먼저 삭제
        await session.execute(
            text(
                "DELETE FROM subscriptions WHERE tenant_id IN "
                "(SELECT id FROM tenants WHERE slug = :s)"
            ),
            {"s": slug},
        )
        await session.execute(
            text(
                "DELETE FROM sections WHERE tenant_id IN "
                "(SELECT id FROM tenants WHERE slug = :s)"
            ),
            {"s": slug},
        )
        await session.execute(
            text(
                "DELETE FROM users WHERE tenant_id IN "
                "(SELECT id FROM tenants WHERE slug = :s)"
            ),
            {"s": slug},
        )
        await session.execute(text("DELETE FROM tenants WHERE slug = :s"), {"s": slug})
        await session.commit()


def _payload(slug: str) -> dict:
    return {
        "name": "테스트 상점",
        "slug": slug,
        "template_type": "GENERAL",
        "plan_type": "BASIC",
        "admin_email": f"owner-{slug}@shop.com",
        "admin_password": "password123",
    }


class TestAuthGuard:
    async def test_requires_auth(self, client: AsyncClient):
        assert (await client.get("/api/super/v1/tenants")).status_code == 401

    async def test_tenant_admin_forbidden(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get("/api/super/v1/tenants", headers=auth_headers)
        assert resp.status_code == 403


class TestCreateTenant:
    async def test_create_then_admin_can_login(
        self, client: AsyncClient, super_headers: dict
    ):
        slug = f"shop-{uuid.uuid4().hex[:6]}"
        try:
            resp = await client.post(
                "/api/super/v1/tenants",
                headers=super_headers,
                json=_payload(slug),
            )
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert data["tenant"]["slug"] == slug
            assert data["admin_email"] == f"owner-{slug}@shop.com"

            # 생성된 어드민 계정으로 실제 로그인 가능 (완료 조건)
            login = await client.post(
                "/api/v1/auth/login",
                json={
                    "email": f"owner-{slug}@shop.com",
                    "password": "password123",
                    "tenant_slug": slug,
                },
            )
            assert login.status_code == 200
        finally:
            await _cleanup_tenant(slug)

    async def test_default_sections_created(
        self, client: AsyncClient, super_headers: dict
    ):
        slug = f"shop-{uuid.uuid4().hex[:6]}"
        try:
            resp = await client.post(
                "/api/super/v1/tenants", headers=super_headers, json=_payload(slug)
            )
            tid = resp.json()["data"]["tenant"]["id"]
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                count = (
                    await session.execute(
                        text("SELECT count(*) FROM sections WHERE tenant_id = :t"),
                        {"t": tid},
                    )
                ).scalar_one()
            assert count == 4
        finally:
            await _cleanup_tenant(slug)

    async def test_duplicate_slug_conflict(
        self, client: AsyncClient, super_headers: dict
    ):
        slug = f"shop-{uuid.uuid4().hex[:6]}"
        try:
            await client.post(
                "/api/super/v1/tenants", headers=super_headers, json=_payload(slug)
            )
            dup = await client.post(
                "/api/super/v1/tenants", headers=super_headers, json=_payload(slug)
            )
            assert dup.status_code == 409
        finally:
            await _cleanup_tenant(slug)


class TestTenantLifecycle:
    async def _create(self, client, super_headers, slug):
        resp = await client.post(
            "/api/super/v1/tenants", headers=super_headers, json=_payload(slug)
        )
        return resp.json()["data"]["tenant"]["id"]

    async def test_list_filters_and_detail(
        self, client: AsyncClient, super_headers: dict
    ):
        slug = f"shop-{uuid.uuid4().hex[:6]}"
        try:
            tid = await self._create(client, super_headers, slug)
            listed = await client.get(
                "/api/super/v1/tenants",
                headers=super_headers,
                params={"q": slug},
            )
            assert listed.status_code == 200
            body = listed.json()["data"]
            assert body["total"] >= 1
            assert any(t["id"] == tid for t in body["items"])

            detail = await client.get(
                f"/api/super/v1/tenants/{tid}", headers=super_headers
            )
            assert detail.status_code == 200
            assert f"owner-{slug}@shop.com" in detail.json()["data"]["admin_emails"]
        finally:
            await _cleanup_tenant(slug)

    async def test_update_and_plan_change(
        self, client: AsyncClient, super_headers: dict
    ):
        slug = f"shop-{uuid.uuid4().hex[:6]}"
        try:
            tid = await self._create(client, super_headers, slug)
            upd = await client.patch(
                f"/api/super/v1/tenants/{tid}",
                headers=super_headers,
                json={"name": "이름 변경"},
            )
            assert upd.json()["data"]["name"] == "이름 변경"

            plan = await client.patch(
                f"/api/super/v1/tenants/{tid}/plan",
                headers=super_headers,
                json={"plan_type": "STANDARD"},
            )
            assert plan.json()["data"]["plan_type"] == "STANDARD"
        finally:
            await _cleanup_tenant(slug)

    async def test_reset_password_then_login(
        self, client: AsyncClient, super_headers: dict
    ):
        slug = f"shop-{uuid.uuid4().hex[:6]}"
        try:
            tid = await self._create(client, super_headers, slug)
            resp = await client.post(
                f"/api/super/v1/tenants/{tid}/reset-password",
                headers=super_headers,
            )
            assert resp.status_code == 200
            temp = resp.json()["data"]["temporary_password"]
            assert temp

            login = await client.post(
                "/api/v1/auth/login",
                json={
                    "email": f"owner-{slug}@shop.com",
                    "password": temp,
                    "tenant_slug": slug,
                },
            )
            assert login.status_code == 200
        finally:
            await _cleanup_tenant(slug)

    async def test_stats_shape(self, client: AsyncClient, super_headers: dict):
        slug = f"shop-{uuid.uuid4().hex[:6]}"
        try:
            tid = await self._create(client, super_headers, slug)
            resp = await client.get(
                f"/api/super/v1/tenants/{tid}/stats", headers=super_headers
            )
            assert resp.status_code == 200
            data = resp.json()["data"]
            for key in (
                "page_views",
                "unique_visitors",
                "inquiries",
                "ai_usage",
                "storage_bytes",
            ):
                assert key in data
        finally:
            await _cleanup_tenant(slug)

    async def test_soft_delete(self, client: AsyncClient, super_headers: dict):
        slug = f"shop-{uuid.uuid4().hex[:6]}"
        try:
            tid = await self._create(client, super_headers, slug)
            resp = await client.delete(
                f"/api/super/v1/tenants/{tid}", headers=super_headers
            )
            assert resp.status_code == 200
            # 삭제 후 상세 조회 404
            detail = await client.get(
                f"/api/super/v1/tenants/{tid}", headers=super_headers
            )
            assert detail.status_code == 404
        finally:
            await _cleanup_tenant(slug)


class TestImpersonate:
    async def test_impersonate_token_and_audit(
        self, client: AsyncClient, super_headers: dict
    ):
        slug = f"shop-{uuid.uuid4().hex[:6]}"
        try:
            resp = await client.post(
                "/api/super/v1/tenants", headers=super_headers, json=_payload(slug)
            )
            tid = resp.json()["data"]["tenant"]["id"]

            imp = await client.post(
                f"/api/super/v1/tenants/{tid}/impersonate", headers=super_headers
            )
            assert imp.status_code == 200
            data = imp.json()["data"]
            assert data["impersonate_token"]
            assert slug in data["redirect_url"]
            assert data["expires_in"] == 1800

            # audit_logs에 IMPERSONATE_START 기록
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                count = (
                    await session.execute(
                        text(
                            "SELECT count(*) FROM audit_logs "
                            "WHERE action = 'IMPERSONATE_START' AND target_id = :t"
                        ),
                        {"t": tid},
                    )
                ).scalar_one()
            assert count >= 1
        finally:
            await _cleanup_tenant(slug)


class TestAuditLogs:
    async def _create(self, client, super_headers, slug):
        resp = await client.post(
            "/api/super/v1/tenants", headers=super_headers, json=_payload(slug)
        )
        return resp.json()["data"]["tenant"]["id"]

    async def test_plan_change_appears_in_audit_logs(
        self, client: AsyncClient, super_headers: dict
    ):
        slug = f"shop-{uuid.uuid4().hex[:6]}"
        try:
            tid = await self._create(client, super_headers, slug)
            await client.patch(
                f"/api/super/v1/tenants/{tid}/plan",
                headers=super_headers,
                json={"plan_type": "STANDARD"},
            )
            resp = await client.get(
                f"/api/super/v1/tenants/{tid}/audit-logs", headers=super_headers
            )
            assert resp.status_code == 200
            data = resp.json()["data"]
            actions = [i["action"] for i in data["items"]]
            assert "TENANT_PLAN_CHANGED" in actions
            assert data["total"] >= 1
        finally:
            await _cleanup_tenant(slug)

    async def test_audit_logs_requires_super_admin(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get(
            f"/api/super/v1/tenants/{uuid.uuid4()}/audit-logs", headers=auth_headers
        )
        assert resp.status_code == 403
