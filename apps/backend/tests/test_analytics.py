from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import select, text

from app.db.session import AsyncSessionLocal
from app.models.analytics import SiteAnalytics
from app.services.analytics import (
    _date_str,
    flush_tenant_to_db,
    get_summary,
    is_mobile,
    record_pageview,
)


class TestPageviewBeacon:
    _url = "/api/public/analytics/pageview"

    async def test_returns_gif(self, client: AsyncClient, test_tenant: dict):
        resp = await client.post(
            self._url, params={"tenant_id": test_tenant["id"]}
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/gif"
        assert len(resp.content) > 0

    async def test_no_cache_header(self, client: AsyncClient, test_tenant: dict):
        resp = await client.post(
            self._url, params={"tenant_id": test_tenant["id"]}
        )
        assert "no-cache" in resp.headers.get("cache-control", "")

    async def test_multiple_pageviews_count(
        self, client: AsyncClient, test_tenant: dict
    ):
        for _ in range(3):
            resp = await client.post(
                self._url, params={"tenant_id": test_tenant["id"]}
            )
            assert resp.status_code == 200

    async def test_invalid_tenant_still_200(self, client: AsyncClient):
        resp = await client.post(
            self._url, params={"tenant_id": "not-a-uuid"}
        )
        assert resp.status_code == 200


class TestAnalyticsSummary:
    _url = "/api/v1/analytics/summary"

    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.get(self._url)
        assert resp.status_code == 401

    async def test_summary_ok(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await client.post(
            "/api/public/analytics/pageview",
            params={"tenant_id": test_tenant["id"]},
        )
        resp = await client.get(self._url, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "today_page_views" in data
        assert "today_unique_visitors" in data
        assert "week_page_views" in data
        assert "week_unique_visitors" in data
        assert isinstance(data["today_page_views"], int)
        assert isinstance(data["today_unique_visitors"], int)

    async def test_pageview_increments_count(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        before = (await client.get(self._url, headers=auth_headers)).json()
        pv_before = before["data"]["today_page_views"]

        await client.post(
            "/api/public/analytics/pageview",
            params={"tenant_id": test_tenant["id"]},
        )

        after = (await client.get(self._url, headers=auth_headers)).json()
        pv_after = after["data"]["today_page_views"]

        assert pv_after > pv_before


class TestAnalyticsService:
    async def test_record_and_read(self, test_tenant: dict):
        tenant_id = test_tenant["id"]
        await record_pageview(tenant_id, "1.2.3.4", "Mozilla/5.0 (Linux; Android)")
        await record_pageview(tenant_id, "1.2.3.4", "Mozilla/5.0 (Linux; Android)")
        await record_pageview(tenant_id, "5.6.7.8", "Mozilla/5.0")

        async with AsyncSessionLocal() as db:
            await db.execute(
                text("SELECT set_config('app.current_tenant_id', :tid, true)"),
                {"tid": tenant_id},
            )
            summary = await get_summary(db, UUID(tenant_id))

        assert summary["today_page_views"] >= 3
        assert summary["today_unique_visitors"] >= 2

    async def test_is_mobile(self):
        assert is_mobile("Mozilla/5.0 (Linux; Android 13) AppleWebKit")
        assert is_mobile("Mozilla/5.0 (iPhone; CPU iPhone OS 16")
        assert not is_mobile("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        assert not is_mobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)")

    async def test_flush_to_db(self, test_tenant: dict):
        tenant_id = test_tenant["id"]
        await record_pageview(tenant_id, "10.0.0.1", "")
        today = _date_str()

        async with AsyncSessionLocal() as db:
            await db.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await flush_tenant_to_db(db, UUID(tenant_id), today)

            result = await db.execute(
                select(SiteAnalytics).where(
                    SiteAnalytics.tenant_id == UUID(tenant_id)
                )
            )
            row = result.scalar_one_or_none()

        assert row is not None
        assert row.page_views >= 1
        assert row.unique_visitors >= 1

        async with AsyncSessionLocal() as db:
            await db.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await db.execute(
                text("DELETE FROM site_analytics WHERE tenant_id = :tid"),
                {"tid": tenant_id},
            )
            await db.commit()
