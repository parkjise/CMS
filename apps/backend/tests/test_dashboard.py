from httpx import AsyncClient


class TestDashboardStats:
    async def test_stats_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/dashboard/stats")
        assert resp.status_code == 401

    async def test_stats_ok(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_analytics: dict,
        test_inquiry: dict,
    ):
        resp = await client.get("/api/v1/dashboard/stats", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]

        assert "today_page_views" in data
        assert "today_unique_visitors" in data
        assert "week_page_views" in data
        assert "week_unique_visitors" in data
        assert "new_inquiries_today" in data
        assert "pending_inquiries" in data

        # analytics fixture 삽입값 확인
        assert data["today_page_views"] == 42
        assert data["today_unique_visitors"] == 17

    async def test_stats_ok_no_analytics(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        resp = await client.get("/api/v1/dashboard/stats", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["today_page_views"] == 0
        assert data["today_unique_visitors"] == 0
        assert data["week_page_views"] == 0
        assert data["week_unique_visitors"] == 0


class TestDashboardChart:
    async def test_chart_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/dashboard/chart")
        assert resp.status_code == 401

    async def test_chart_returns_7_days(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        resp = await client.get("/api/v1/dashboard/chart", headers=auth_headers)
        assert resp.status_code == 200
        chart = resp.json()["data"]
        assert isinstance(chart, list)
        assert len(chart) == 7

    async def test_chart_structure(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        resp = await client.get("/api/v1/dashboard/chart", headers=auth_headers)
        assert resp.status_code == 200
        for item in resp.json()["data"]:
            assert "date" in item
            assert "page_views" in item
            assert "unique_visitors" in item
            assert isinstance(item["page_views"], int)
            assert isinstance(item["unique_visitors"], int)

    async def test_chart_dates_ascending(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        resp = await client.get("/api/v1/dashboard/chart", headers=auth_headers)
        dates = [item["date"] for item in resp.json()["data"]]
        assert dates == sorted(dates)

    async def test_chart_with_analytics(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_analytics: dict,
    ):
        resp = await client.get("/api/v1/dashboard/chart", headers=auth_headers)
        assert resp.status_code == 200
        chart = resp.json()["data"]
        # 오늘 데이터(마지막 항목)에 분석 값 반영 확인
        today_item = chart[-1]
        assert today_item["page_views"] == 42
        assert today_item["unique_visitors"] == 17


class TestDashboardRecentInquiries:
    async def test_recent_inquiries_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/dashboard/recent-inquiries")
        assert resp.status_code == 401

    async def test_recent_inquiries_empty(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        url = "/api/v1/dashboard/recent-inquiries"
        resp = await client.get(url, headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json()["data"], list)

    async def test_recent_inquiries_includes_unread(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_inquiry: dict,
    ):
        url = "/api/v1/dashboard/recent-inquiries"
        resp = await client.get(url, headers=auth_headers)
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()["data"]]
        assert test_inquiry["id"] in ids

    async def test_recent_inquiries_structure(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_inquiry: dict,
    ):
        url = "/api/v1/dashboard/recent-inquiries"
        resp = await client.get(url, headers=auth_headers)
        assert resp.status_code == 200
        for item in resp.json()["data"]:
            assert "id" in item
            assert "name" in item
            assert "inquiry_type" in item
            assert "status" in item
            assert "created_at" in item

    async def test_recent_inquiries_max_5(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_inquiry: dict,
    ):
        url = "/api/v1/dashboard/recent-inquiries"
        resp = await client.get(url, headers=auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()["data"]) <= 5


class TestDashboardSampleCount:
    """대시보드 할 일 안내용 샘플 값 개수 (T-043-A)"""

    async def test_counts_only_active_not_deleted_sample_settings(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        import uuid
        from datetime import UTC, datetime

        from sqlalchemy import text

        from app.models.section import Section, SectionSetting
        from tests.conftest import _TestSession  # type: ignore

        def section(active: bool = True, deleted: bool = False) -> Section:
            s = Section(
                id=uuid.uuid4(),
                tenant_id=uuid.UUID(test_tenant["id"]),
                section_type="HERO_BANNER",
                label="메인",
                display_order=1,
                is_active=active,
                page_key="home",
                deleted_at=datetime.now(UTC) if deleted else None,
            )
            s.settings = [
                SectionSetting(
                    tenant_id=s.tenant_id,
                    field_key=k,
                    field_value="v",
                    value_type="STRING",
                    is_sample=sample,
                )
                for k, sample in (
                    ("main_title", True),
                    ("sub_title", True),
                    ("x", False),
                )
            ]
            return s

        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            session.add_all([section(), section(active=False), section(deleted=True)])
            await session.commit()

        resp = await client.get("/api/v1/dashboard/stats", headers=auth_headers)
        assert resp.status_code == 200
        # 보이는 섹션의 샘플 2개만 — 숨긴 · 지운 섹션 제외
        assert resp.json()["data"]["sample_count"] == 2

    async def test_zero_without_sections(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/dashboard/stats", headers=auth_headers)
        assert resp.json()["data"]["sample_count"] == 0
