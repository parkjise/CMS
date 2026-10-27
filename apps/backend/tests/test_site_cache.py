"""홈페이지 캐시 비우기 (T-066-A) — Redis + 홈페이지(Next.js) /api/revalidate."""

import httpx
import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.core.redis import get_redis
from app.services import site_cache


class _Recorder:
    """httpx.AsyncClient 대역 — 홈페이지 호출을 기록한다."""

    calls: list[dict] = []
    fail: bool = False

    def __init__(self, *args, **kwargs) -> None:
        self.timeout = kwargs.get("timeout")

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc) -> None:
        return None

    async def post(self, url: str, json: dict, headers: dict) -> httpx.Response:
        _Recorder.calls.append({"url": url, "json": json, "headers": headers})
        if _Recorder.fail:
            raise httpx.ConnectError("client down")
        return httpx.Response(200, request=httpx.Request("POST", url))


@pytest.fixture
def client_revalidate(monkeypatch):
    _Recorder.calls = []
    _Recorder.fail = False
    monkeypatch.setattr(site_cache.httpx, "AsyncClient", _Recorder)
    monkeypatch.setattr(settings, "revalidate_secret", "s" * 32)
    monkeypatch.setattr(settings, "client_internal_url", "http://client:3000/")
    return _Recorder


class TestRevalidateClient:
    async def test_posts_slugs_with_secret(self, client_revalidate):
        assert await site_cache.revalidate_client(["a", "b"]) is True
        (call,) = client_revalidate.calls
        assert call["url"] == "http://client:3000/api/revalidate"
        assert call["json"] == {"slugs": ["a", "b"]}
        assert call["headers"] == {"x-revalidate-secret": "s" * 32}

    async def test_skips_without_secret(self, client_revalidate, monkeypatch):
        monkeypatch.setattr(settings, "revalidate_secret", "")
        assert await site_cache.revalidate_client(["a"]) is False
        assert client_revalidate.calls == []

    async def test_skips_without_slugs(self, client_revalidate):
        assert await site_cache.revalidate_client([]) is False
        assert client_revalidate.calls == []

    async def test_failure_does_not_raise(self, client_revalidate):
        client_revalidate.fail = True
        assert await site_cache.revalidate_client(["a"]) is False


async def _seed_cache(tenant: dict) -> None:
    redis = await get_redis()
    await redis.set(site_cache.site_key(tenant["slug"]), "{}")
    await redis.set(site_cache.sections_key(tenant["id"]), "[]")


async def _cached(tenant: dict) -> tuple[bool, bool]:
    redis = await get_redis()
    return (
        bool(await redis.exists(site_cache.site_key(tenant["slug"]))),
        bool(await redis.exists(site_cache.sections_key(tenant["id"]))),
    )


class TestPurgeOnSave:
    """저장하면 Redis 두 키 + 홈페이지 캐시를 모두 비운다."""

    async def test_inline_edit_save(
        self,
        client: AsyncClient,
        auth_headers,
        test_tenant,
        test_section,
        client_revalidate,
    ):
        await _seed_cache(test_tenant)
        resp = await client.post(
            "/api/v1/edit/batch-save",
            headers=auth_headers,
            json={
                "changes": [
                    {
                        "section_id": test_section["id"],
                        "field": "main_title",
                        "value": "v",
                    }
                ]
            },
        )
        assert resp.json()["data"]["cache_purged"] is True
        assert await _cached(test_tenant) == (False, False)
        assert client_revalidate.calls[-1]["json"] == {"slugs": [test_tenant["slug"]]}

    async def test_admin_section_save(
        self,
        client: AsyncClient,
        auth_headers,
        test_tenant,
        test_section,
        client_revalidate,
    ):
        """관리자 섹션 저장 — 전에는 공개 사이트 캐시(10분)를 안 비웠다."""
        await _seed_cache(test_tenant)
        resp = await client.patch(
            f"/api/v1/sections/{test_section['id']}",
            headers=auth_headers,
            json={"settings": [{"field_key": "main_title", "field_value": "관리자"}]},
        )
        assert resp.status_code == 200
        assert await _cached(test_tenant) == (False, False)
        assert client_revalidate.calls[-1]["json"] == {"slugs": [test_tenant["slug"]]}

    async def test_section_toggle(
        self,
        client: AsyncClient,
        auth_headers,
        test_tenant,
        test_section,
        client_revalidate,
    ):
        await _seed_cache(test_tenant)
        resp = await client.patch(
            f"/api/v1/sections/{test_section['id']}/toggle", headers=auth_headers
        )
        assert resp.status_code == 200
        assert await _cached(test_tenant) == (False, False)

    async def test_sns_save(
        self, client: AsyncClient, auth_headers, test_tenant, client_revalidate
    ):
        await _seed_cache(test_tenant)
        resp = await client.put(
            "/api/v1/sns-settings",
            headers=auth_headers,
            json={"kakao_url": "https://pf.kakao.com/_cache"},
        )
        assert resp.status_code == 200
        assert (await _cached(test_tenant))[0] is False
        assert client_revalidate.calls[-1]["json"] == {"slugs": [test_tenant["slug"]]}

    async def test_seo_save(
        self, client: AsyncClient, auth_headers, test_tenant, client_revalidate
    ):
        await _seed_cache(test_tenant)
        resp = await client.put(
            "/api/v1/seo-settings",
            headers=auth_headers,
            json={"meta_title": "캐시 테스트"},
        )
        assert resp.status_code == 200
        assert (await _cached(test_tenant))[0] is False

    async def test_client_down_still_saves(
        self,
        client: AsyncClient,
        auth_headers,
        test_tenant,
        test_section,
        client_revalidate,
    ):
        """홈페이지 호출이 실패해도 저장은 성공한다 (best-effort)."""
        client_revalidate.fail = True
        resp = await client.post(
            "/api/v1/edit/batch-save",
            headers=auth_headers,
            json={
                "changes": [
                    {
                        "section_id": test_section["id"],
                        "field": "main_title",
                        "value": "v2",
                    }
                ]
            },
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["saved_count"] == 1
