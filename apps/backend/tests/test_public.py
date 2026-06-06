"""
공개 API 통합 테스트:
  - /api/public/site/{slug} 데이터 정합성
  - /api/public/inquiries 테넌트 격리
  - /api/public/analytics/pageview 수집
  - 비활성 테넌트 차단
"""
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from tests.conftest import _TestSession


@pytest.fixture
async def inactive_tenant() -> dict:
    slug = f"inactive-{uuid.uuid4().hex[:6]}"
    tid = uuid.uuid4()

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text(
                "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at, updated_at) "
                "VALUES (:id, :name, :slug, 'FREE', false, now(), now())"
            ),
            {"id": str(tid), "name": "Inactive Tenant", "slug": slug},
        )
        await session.commit()

    yield {"id": str(tid), "slug": slug}

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("DELETE FROM tenants WHERE id = :tid"), {"tid": str(tid)}
        )
        await session.commit()


class TestPublicSiteData:
    async def test_tenant_data_correct(
        self, client: AsyncClient, test_tenant: dict
    ):
        resp = await client.get(f"/api/public/site/{test_tenant['slug']}")
        assert resp.status_code == 200
        tenant = resp.json()["data"]["tenant"]
        assert tenant["id"] == test_tenant["id"]
        assert tenant["slug"] == test_tenant["slug"]

    async def test_inactive_tenant_returns_404(
        self, client: AsyncClient, inactive_tenant: dict
    ):
        resp = await client.get(f"/api/public/site/{inactive_tenant['slug']}")
        assert resp.status_code == 404

    async def test_unknown_slug_returns_404(self, client: AsyncClient):
        resp = await client.get("/api/public/site/this-slug-does-not-exist")
        assert resp.status_code == 404

    async def test_sections_endpoint_inactive_tenant(
        self, client: AsyncClient, inactive_tenant: dict
    ):
        resp = await client.get(
            f"/api/public/site/{inactive_tenant['slug']}/sections"
        )
        assert resp.status_code == 404

    async def test_site_response_has_required_fields(
        self, client: AsyncClient, test_tenant: dict
    ):
        resp = await client.get(f"/api/public/site/{test_tenant['slug']}")
        data = resp.json()["data"]
        for field in ("tenant", "sections", "seo_settings", "sns_settings", "template"):
            assert field in data

    async def test_sections_list_returns_array(
        self, client: AsyncClient, test_tenant: dict, test_section: dict
    ):
        resp = await client.get(
            f"/api/public/site/{test_tenant['slug']}/sections"
        )
        assert resp.status_code == 200
        assert isinstance(resp.json()["data"], list)

    async def test_sections_include_settings_field(
        self, client: AsyncClient, test_tenant: dict, test_section: dict
    ):
        resp = await client.get(
            f"/api/public/site/{test_tenant['slug']}/sections"
        )
        for section in resp.json()["data"]:
            assert "settings" in section

    async def test_cache_returns_same_data(
        self, client: AsyncClient, test_tenant: dict
    ):
        r1 = await client.get(f"/api/public/site/{test_tenant['slug']}")
        r2 = await client.get(f"/api/public/site/{test_tenant['slug']}")
        assert r1.status_code == 200
        assert r1.json()["data"]["tenant"]["id"] == r2.json()["data"]["tenant"]["id"]


class TestPublicInquiryIsolation:
    async def test_submit_to_correct_tenant(
        self, client: AsyncClient, test_tenant: dict
    ):
        resp = await client.post(
            "/api/public/inquiries",
            params={"tenant_slug": test_tenant["slug"]},
            json={
                "name": "공개 API 테스트",
                "phone": "010-9999-0000",
                "message": "공개 API를 통한 문의 테스트입니다. 확인해 주세요.",
            },
        )
        assert resp.status_code == 200
        assert "inquiry_id" in resp.json()["data"]

    async def test_submit_creates_pending_status(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await client.post(
            "/api/public/inquiries",
            params={"tenant_slug": test_tenant["slug"]},
            json={
                "name": "상태 확인",
                "phone": "010-1111-2222",
                "message": "문의 상태가 PENDING인지 확인하는 테스트입니다.",
            },
        )
        resp = await client.get(
            "/api/v1/inquiries", params={"status": "PENDING"}, headers=auth_headers
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["total"] >= 1

    async def test_inactive_tenant_cannot_receive_inquiry(
        self, client: AsyncClient, inactive_tenant: dict
    ):
        resp = await client.post(
            "/api/public/inquiries",
            params={"tenant_slug": inactive_tenant["slug"]},
            json={
                "name": "테스터",
                "phone": "010-0000-1111",
                "message": "비활성 테넌트에 문의 시도입니다. 차단되어야 합니다.",
            },
        )
        assert resp.status_code == 404

    async def test_inquiry_not_visible_to_wrong_tenant(
        self, client: AsyncClient, test_inquiry: dict, inactive_tenant: dict
    ):
        """공개 API는 테넌트 슬러그로만 접근 — 다른 슬러그의 문의 접근 불가"""
        from uuid import UUID
        from app.core.security import create_access_token
        from app.core.redis import get_redis

        # inactive_tenant에 임시 유저 생성
        uid = uuid.uuid4()
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text(
                    "INSERT INTO users "
                    "(id, tenant_id, email, password_hash, role, is_active, created_at, updated_at) "
                    "VALUES (:id, :tid, :email, 'hash', 'TENANT_ADMIN', true, now(), now())"
                ),
                {
                    "id": str(uid),
                    "tid": inactive_tenant["id"],
                    "email": f"test-{uid}@inactive.com",
                },
            )
            await session.commit()

        token = create_access_token(
            user_id=uid,
            tenant_id=UUID(inactive_tenant["id"]),
            role="TENANT_ADMIN",
        )
        headers = {"Authorization": f"Bearer {token}"}

        resp = await client.get(
            f"/api/v1/inquiries/{test_inquiry['id']}", headers=headers
        )
        assert resp.status_code == 404

        # cleanup
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text("DELETE FROM users WHERE id = :uid"), {"uid": str(uid)}
            )
            await session.commit()
