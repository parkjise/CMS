import uuid
from datetime import UTC, datetime
from io import BytesIO

import pytest
from httpx import AsyncClient
from openpyxl import load_workbook
from sqlalchemy import text

from tests.conftest import _TestSession  # type: ignore


class TestSubmitInquiry:
    async def test_submit_success(self, client: AsyncClient, test_tenant: dict):
        resp = await client.post(
            "/api/public/inquiries",
            params={"tenant_slug": test_tenant["slug"]},
            json={
                "name": "홍길동",
                "phone": "010-1234-5678",
                "message": "테스트 문의입니다. 답변 부탁드립니다.",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert "inquiry_id" in body["data"]

    async def test_submit_invalid_phone(self, client: AsyncClient, test_tenant: dict):
        resp = await client.post(
            "/api/public/inquiries",
            params={"tenant_slug": test_tenant["slug"]},
            json={
                "name": "홍길동",
                "phone": "02-123-4567",
                "message": "테스트 문의입니다. 답변 부탁드립니다.",
            },
        )
        assert resp.status_code == 400

    async def test_submit_message_too_short(self, client: AsyncClient, test_tenant: dict):
        resp = await client.post(
            "/api/public/inquiries",
            params={"tenant_slug": test_tenant["slug"]},
            json={"name": "홍길동", "phone": "010-1234-5678", "message": "짧음"},
        )
        assert resp.status_code == 400

    async def test_submit_tenant_not_found(self, client: AsyncClient):
        resp = await client.post(
            "/api/public/inquiries",
            params={"tenant_slug": "no-such-tenant"},
            json={
                "name": "홍길동",
                "phone": "010-1234-5678",
                "message": "테스트 문의입니다. 답변 부탁드립니다.",
            },
        )
        assert resp.status_code == 404


class TestListInquiries:
    async def test_list_empty(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/inquiries", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert "total" in body["data"]
        assert "items" in body["data"]

    async def test_list_unauthenticated(self, client: AsyncClient):
        resp = await client.get("/api/v1/inquiries")
        assert resp.status_code == 401

    async def test_list_with_inquiry(
        self, client: AsyncClient, auth_headers: dict, test_inquiry: dict
    ):
        resp = await client.get("/api/v1/inquiries", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] >= 1
        ids = [item["id"] for item in data["items"]]
        assert test_inquiry["id"] in ids

    async def test_list_pagination(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get(
            "/api/v1/inquiries", params={"page": 1, "limit": 5}, headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["page"] == 1
        assert data["limit"] == 5

    async def test_list_filter_by_status(
        self, client: AsyncClient, auth_headers: dict, test_inquiry: dict
    ):
        resp = await client.get(
            "/api/v1/inquiries", params={"status": "PENDING"}, headers=auth_headers
        )
        assert resp.status_code == 200
        items = resp.json()["data"]["items"]
        assert all(item["status"] == "PENDING" for item in items)


class TestGetInquiry:
    async def test_get_success(
        self, client: AsyncClient, auth_headers: dict, test_inquiry: dict
    ):
        resp = await client.get(f"/api/v1/inquiries/{test_inquiry['id']}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["id"] == test_inquiry["id"]
        assert data["name"] == "테스트문의자"
        assert data["status"] == "PENDING"
        assert data["admin_memo"] is None

    async def test_get_not_found(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get(f"/api/v1/inquiries/{uuid.uuid4()}", headers=auth_headers)
        assert resp.status_code == 404


class TestUpdateInquiry:
    async def test_update_status_and_memo(
        self, client: AsyncClient, auth_headers: dict, test_inquiry: dict
    ):
        resp = await client.patch(
            f"/api/v1/inquiries/{test_inquiry['id']}",
            json={"status": "IN_PROGRESS", "admin_memo": "콜백 예정"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["status"] == "IN_PROGRESS"
        assert data["admin_memo"] == "콜백 예정"

    async def test_update_mark_read(
        self, client: AsyncClient, auth_headers: dict, test_inquiry: dict
    ):
        resp = await client.patch(
            f"/api/v1/inquiries/{test_inquiry['id']}",
            json={"is_read": True},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["is_read"] is True

    async def test_update_invalid_status(
        self, client: AsyncClient, auth_headers: dict, test_inquiry: dict
    ):
        resp = await client.patch(
            f"/api/v1/inquiries/{test_inquiry['id']}",
            json={"status": "INVALID_STATUS"},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_update_not_found(self, client: AsyncClient, auth_headers: dict):
        resp = await client.patch(
            f"/api/v1/inquiries/{uuid.uuid4()}",
            json={"status": "DONE"},
            headers=auth_headers,
        )
        assert resp.status_code == 404


class TestDeleteInquiry:
    async def test_delete_success(
        self, client: AsyncClient, auth_headers: dict, test_inquiry: dict
    ):
        resp = await client.delete(
            f"/api/v1/inquiries/{test_inquiry['id']}", headers=auth_headers
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        get_resp = await client.get(
            f"/api/v1/inquiries/{test_inquiry['id']}", headers=auth_headers
        )
        assert get_resp.status_code == 404

    async def test_delete_not_found(self, client: AsyncClient, auth_headers: dict):
        resp = await client.delete(
            f"/api/v1/inquiries/{uuid.uuid4()}", headers=auth_headers
        )
        assert resp.status_code == 404


class TestExportInquiries:
    async def test_export_xlsx(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/inquiries/export", headers=auth_headers)
        assert resp.status_code == 200
        assert "spreadsheetml" in resp.headers["content-type"]

    async def test_export_unauthenticated(self, client: AsyncClient):
        resp = await client.get("/api/v1/inquiries/export")
        assert resp.status_code == 401


class TestInquiryFilters:
    async def test_filter_by_is_read_false(
        self, client: AsyncClient, auth_headers: dict, test_inquiry: dict
    ):
        resp = await client.get(
            "/api/v1/inquiries", params={"is_read": "false"}, headers=auth_headers
        )
        assert resp.status_code == 200
        items = resp.json()["data"]["items"]
        assert all(item["is_read"] is False for item in items)

    async def test_filter_by_inquiry_type(
        self, client: AsyncClient, auth_headers: dict, test_inquiry: dict
    ):
        resp = await client.get(
            "/api/v1/inquiries",
            params={"inquiry_type": "GENERAL"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        items = resp.json()["data"]["items"]
        assert all(item["inquiry_type"] == "GENERAL" for item in items)

    async def test_search_by_name(
        self, client: AsyncClient, auth_headers: dict, test_inquiry: dict
    ):
        resp = await client.get(
            "/api/v1/inquiries", params={"search": "테스트문의자"}, headers=auth_headers
        )
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()["data"]["items"]]
        assert test_inquiry["id"] in ids

    async def test_search_no_match_returns_empty(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get(
            "/api/v1/inquiries",
            params={"search": "절대존재하지않는이름XYZ"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["total"] == 0


class TestInquiryStatusCycle:
    async def test_full_status_cycle(
        self, client: AsyncClient, auth_headers: dict, test_inquiry: dict
    ):
        iid = test_inquiry["id"]
        for s in ("IN_PROGRESS", "DONE"):
            resp = await client.patch(
                f"/api/v1/inquiries/{iid}",
                json={"status": s},
                headers=auth_headers,
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["status"] == s

    async def test_mark_as_spam(
        self, client: AsyncClient, auth_headers: dict, test_inquiry: dict
    ):
        resp = await client.patch(
            f"/api/v1/inquiries/{test_inquiry['id']}",
            json={"status": "SPAM"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "SPAM"


class TestInquiryValidation:
    async def test_submit_name_too_long(
        self, client: AsyncClient, test_tenant: dict
    ):
        resp = await client.post(
            "/api/public/inquiries",
            params={"tenant_slug": test_tenant["slug"]},
            json={
                "name": "a" * 101,
                "phone": "010-1234-5678",
                "message": "테스트 문의입니다. 답변 부탁드립니다.",
            },
        )
        assert resp.status_code == 400

    async def test_submit_message_too_long(
        self, client: AsyncClient, test_tenant: dict
    ):
        resp = await client.post(
            "/api/public/inquiries",
            params={"tenant_slug": test_tenant["slug"]},
            json={
                "name": "홍길동",
                "phone": "010-1234-5678",
                "message": "a" * 1001,
            },
        )
        assert resp.status_code == 400

    async def test_submit_with_email(
        self, client: AsyncClient, test_tenant: dict
    ):
        resp = await client.post(
            "/api/public/inquiries",
            params={"tenant_slug": test_tenant["slug"]},
            json={
                "name": "이메일포함",
                "phone": "010-5555-6666",
                "email": "test@example.com",
                "message": "이메일 포함 문의 테스트입니다. 답변 주시면 감사합니다.",
            },
        )
        assert resp.status_code == 200


class TestInquiryPeriodFilter:
    """접수일 기간 필터 — 한국 날짜 기준 (T-127)."""

    _url = "/api/v1/inquiries"

    @pytest.fixture
    async def dated(self, client: AsyncClient, test_tenant: dict, test_inquiry: dict):
        # 11-02 00:30 KST = 11-01 15:30 UTC — UTC 날짜로 자르면 전날로 잘못 들어간다
        async with _TestSession() as s:
            await s.execute(text("SELECT set_config('app.is_super_admin','true',false)"))
            await s.execute(
                text("UPDATE inquiries SET created_at=:at WHERE id=:id"),
                {"at": datetime(2026, 11, 1, 15, 30, tzinfo=UTC), "id": test_inquiry["id"]},
            )
            await s.commit()
        return test_inquiry

    async def _total(self, client, headers, **params) -> int:
        resp = await client.get(self._url, headers=headers, params=params)
        assert resp.status_code == 200
        return resp.json()["data"]["total"]

    async def test_korean_date_boundary(self, client, auth_headers, dated):
        day = {"from_date": "2026-11-02", "to_date": "2026-11-02"}
        assert await self._total(client, auth_headers, **day) == 1
        prev = {"from_date": "2026-11-01", "to_date": "2026-11-01"}
        assert await self._total(client, auth_headers, **prev) == 0

    async def test_open_ended(self, client, auth_headers, dated):
        assert await self._total(client, auth_headers, from_date="2026-11-03") == 0
        assert await self._total(client, auth_headers, to_date="2026-11-02") == 1

    async def test_reversed_period_400(self, client, auth_headers):
        resp = await client.get(
            self._url,
            headers=auth_headers,
            params={"from_date": "2026-11-03", "to_date": "2026-11-01"},
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["field"] == "from_date"

    async def test_bad_date_400(self, client, auth_headers):
        resp = await client.get(
            self._url, headers=auth_headers, params={"from_date": "어제"}
        )
        assert resp.status_code == 400

    async def test_export_uses_period(self, client, auth_headers, dated):
        url = f"{self._url}/export"
        hit = await client.get(
            url, headers=auth_headers, params={"from_date": "2026-11-02"}
        )
        miss = await client.get(
            url, headers=auth_headers, params={"from_date": "2026-11-03"}
        )
        assert hit.status_code == miss.status_code == 200
        rows = lambda r: load_workbook(BytesIO(r.content)).active.max_row  # noqa: E731
        assert rows(hit) == rows(miss) + 1
        reversed_period = {"from_date": "2026-11-03", "to_date": "2026-11-01"}
        bad = await client.get(url, headers=auth_headers, params=reversed_period)
        assert bad.status_code == 400
