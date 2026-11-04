"""SEO 소셜 제목 · 설명 · 대표 주소 · 검색 노출 (T-129, 기획서 5.7)."""

import pytest
from httpx import AsyncClient

_URL = "/api/v1/seo-settings"


class TestSeoMetaFields:
    async def test_save_and_read(self, client: AsyncClient, auth_headers: dict):
        resp = await client.put(
            _URL,
            headers=auth_headers,
            json={
                "og_title": "소셜 제목",
                "og_description": "소셜 설명",
                "canonical_url": " https://my-hospital.com ",
                "robots": "noindex,follow",
            },
        )
        assert resp.status_code == 200, resp.text
        data = (await client.get(_URL, headers=auth_headers)).json()["data"]
        assert data["og_title"] == "소셜 제목"
        assert data["og_description"] == "소셜 설명"
        assert data["canonical_url"] == "https://my-hospital.com"
        assert data["robots"] == "noindex,follow"

    async def test_first_save_defaults_robots(self, client, auth_headers):
        resp = await client.put(_URL, headers=auth_headers, json={"meta_title": "제목"})
        assert resp.status_code == 200
        assert resp.json()["data"]["robots"] == "index,follow"

    async def test_null_clears_and_omitted_stays(self, client, auth_headers):
        first = {"og_title": "제목", "og_description": "설명", "meta_title": "검색 제목"}
        await client.put(_URL, headers=auth_headers, json=first)
        resp = await client.put(_URL, headers=auth_headers, json={"og_title": None})
        data = resp.json()["data"]
        assert data["og_title"] is None
        assert data["og_description"] == "설명"
        assert data["meta_title"] == "검색 제목"

    @pytest.mark.parametrize(
        "url",
        ["http://my-hospital.com", "javascript:alert(1)", "/about", "https://a b.com"],
    )
    async def test_bad_canonical_400(self, client, auth_headers, url):
        resp = await client.put(_URL, headers=auth_headers, json={"canonical_url": url})
        assert resp.status_code == 400

    async def test_empty_canonical_clears(self, client, auth_headers):
        body = {"canonical_url": "https://a.com"}
        await client.put(_URL, headers=auth_headers, json=body)
        resp = await client.put(_URL, headers=auth_headers, json={"canonical_url": ""})
        assert resp.json()["data"]["canonical_url"] is None

    @pytest.mark.parametrize(
        "body",
        [{"robots": "all"}, {"og_title": "a" * 61}, {"og_description": "a" * 201}],
    )
    async def test_bad_values_400(self, client, auth_headers, body):
        resp = await client.put(_URL, headers=auth_headers, json=body)
        assert resp.status_code == 400

    async def test_requires_auth(self, client):
        assert (await client.put(_URL, json={"robots": "index,follow"})).status_code == 401

    async def test_public_site_response(self, client, auth_headers, test_tenant):
        body = {"og_title": "공개 제목", "robots": "noindex,nofollow"}
        await client.put(_URL, headers=auth_headers, json=body)
        resp = await client.get(f"/api/public/site/{test_tenant['slug']}")
        seo = resp.json()["data"]["seo_settings"]
        assert seo["og_title"] == "공개 제목"
        assert seo["robots"] == "noindex,nofollow"
