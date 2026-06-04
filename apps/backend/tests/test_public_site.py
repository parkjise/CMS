import pytest
from httpx import AsyncClient


class TestPublicSite:
    async def test_get_site(self, client: AsyncClient, test_tenant: dict, test_section: dict):
        resp = await client.get(f"/api/public/site/{test_tenant['slug']}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        data = body["data"]

        assert data["tenant"]["slug"] == test_tenant["slug"]
        assert isinstance(data["sections"], list)
        assert data["seo_settings"] is None or isinstance(data["seo_settings"], dict)
        assert data["sns_settings"] is None or isinstance(data["sns_settings"], dict)

    async def test_get_site_sections_included(
        self, client: AsyncClient, test_tenant: dict, test_section: dict
    ):
        resp = await client.get(f"/api/public/site/{test_tenant['slug']}")
        assert resp.status_code == 200
        section_ids = [s["id"] for s in resp.json()["data"]["sections"]]
        assert test_section["id"] in section_ids

    async def test_get_site_not_found(self, client: AsyncClient):
        resp = await client.get("/api/public/site/no-such-tenant")
        assert resp.status_code == 404

    async def test_get_site_cached(self, client: AsyncClient, test_tenant: dict):
        # 첫 요청 → DB 조회
        r1 = await client.get(f"/api/public/site/{test_tenant['slug']}")
        assert r1.status_code == 200
        # 두 번째 요청 → 캐시 히트 (동일 결과)
        r2 = await client.get(f"/api/public/site/{test_tenant['slug']}")
        assert r2.status_code == 200
        assert r1.json()["data"]["tenant"]["slug"] == r2.json()["data"]["tenant"]["slug"]

    async def test_get_sections_only(
        self, client: AsyncClient, test_tenant: dict, test_section: dict
    ):
        resp = await client.get(f"/api/public/site/{test_tenant['slug']}/sections")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert isinstance(data, list)
        ids = [s["id"] for s in data]
        assert test_section["id"] in ids

    async def test_get_sections_not_found(self, client: AsyncClient):
        resp = await client.get("/api/public/site/no-such-tenant/sections")
        assert resp.status_code == 404

    async def test_site_structure(self, client: AsyncClient, test_tenant: dict):
        resp = await client.get(f"/api/public/site/{test_tenant['slug']}")
        assert resp.status_code == 200
        data = resp.json()["data"]

        # 필수 키 존재 확인
        assert "tenant" in data
        assert "sections" in data
        assert "seo_settings" in data
        assert "sns_settings" in data
        assert "template" in data

        # tenant 필드 확인
        tenant = data["tenant"]
        assert "id" in tenant
        assert "slug" in tenant
        assert "name" in tenant
        assert "template_type" in tenant

    async def test_sections_have_settings_field(
        self, client: AsyncClient, test_tenant: dict, test_section: dict
    ):
        resp = await client.get(f"/api/public/site/{test_tenant['slug']}/sections")
        assert resp.status_code == 200
        for section in resp.json()["data"]:
            assert "settings" in section
            assert "section_type" in section
            assert "display_order" in section
