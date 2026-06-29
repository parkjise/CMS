import pytest
from httpx import AsyncClient


class TestSnsSettings:
    async def test_get_empty(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/sns-settings", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    async def test_unauthenticated(self, client: AsyncClient):
        resp = await client.get("/api/v1/sns-settings")
        assert resp.status_code == 401

    async def test_update_and_get(self, client: AsyncClient, auth_headers: dict):
        resp = await client.put(
            "/api/v1/sns-settings",
            json={"kakao_url": "https://pf.kakao.com/_test"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["kakao_url"] == "https://pf.kakao.com/_test"

        # 조회
        get_resp = await client.get("/api/v1/sns-settings", headers=auth_headers)
        assert get_resp.json()["data"]["kakao_url"] == "https://pf.kakao.com/_test"

    async def test_update_invalid_url(self, client: AsyncClient, auth_headers: dict):
        resp = await client.put(
            "/api/v1/sns-settings",
            json={"kakao_url": "not-a-url"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_plan_limit_exceeded(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        # BASIC 플랜 → 2채널 제한, 3개 전송
        resp = await client.put(
            "/api/v1/sns-settings",
            json={
                "kakao_url": "https://pf.kakao.com/_test",
                "instagram_url": "https://instagram.com/test",
                "facebook_url": "https://facebook.com/test",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_test_url_invalid_format(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/sns-settings/test-url",
            json={"url": "not-a-url"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_test_url_valid_format(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/sns-settings/test-url",
            json={"url": "https://example.com"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "is_valid" in resp.json()["data"]


class TestSeoSettings:
    async def test_get_empty(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/seo-settings", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    async def test_unauthenticated(self, client: AsyncClient):
        resp = await client.get("/api/v1/seo-settings")
        assert resp.status_code == 401

    async def test_update_and_get(self, client: AsyncClient, auth_headers: dict):
        resp = await client.put(
            "/api/v1/seo-settings",
            json={
                "meta_title": "테스트 병원",
                "meta_description": "최고의 의료 서비스를 제공합니다.",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["meta_title"] == "테스트 병원"
        assert data["meta_description"] == "최고의 의료 서비스를 제공합니다."

    async def test_meta_title_too_long(self, client: AsyncClient, auth_headers: dict):
        resp = await client.put(
            "/api/v1/seo-settings",
            json={"meta_title": "a" * 61},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_meta_description_too_long(self, client: AsyncClient, auth_headers: dict):
        resp = await client.put(
            "/api/v1/seo-settings",
            json={"meta_description": "a" * 161},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_upsert(self, client: AsyncClient, auth_headers: dict):
        await client.put(
            "/api/v1/seo-settings",
            json={"meta_title": "처음 제목"},
            headers=auth_headers,
        )
        resp = await client.put(
            "/api/v1/seo-settings",
            json={"meta_title": "업데이트 제목"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["meta_title"] == "업데이트 제목"

    async def test_sitemap(self, client: AsyncClient, test_tenant: dict):
        resp = await client.get(
            f"/api/public/sitemap/{test_tenant['slug']}.xml"
        )
        assert resp.status_code == 200
        assert "urlset" in resp.text
        assert test_tenant["slug"] in resp.text

    async def test_sitemap_not_found(self, client: AsyncClient):
        resp = await client.get("/api/public/sitemap/no-such-tenant.xml")
        assert resp.status_code == 404


class TestGoogleSiteVerification:
    """T-077 Google 서치 콘솔 사이트 인증 코드."""

    async def test_save_and_read_google_verification(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.put(
            "/api/v1/seo-settings",
            json={
                "google_site_verification": "google-abc-123",
                "naver_site_verification": "naver-xyz-789",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["google_site_verification"] == "google-abc-123"
        assert data["naver_site_verification"] == "naver-xyz-789"

    async def test_exposed_on_public_site(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await client.put(
            "/api/v1/seo-settings",
            json={"google_site_verification": "google-public-1"},
            headers=auth_headers,
        )
        pub = await client.get(f"/api/public/site/{test_tenant['slug']}")
        assert pub.status_code == 200
        seo = pub.json()["data"]["seo_settings"]
        assert seo["google_site_verification"] == "google-public-1"
