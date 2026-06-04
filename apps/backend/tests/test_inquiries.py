import uuid

import pytest
from httpx import AsyncClient


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
        assert resp.status_code == 422

    async def test_submit_message_too_short(self, client: AsyncClient, test_tenant: dict):
        resp = await client.post(
            "/api/public/inquiries",
            params={"tenant_slug": test_tenant["slug"]},
            json={"name": "홍길동", "phone": "010-1234-5678", "message": "짧음"},
        )
        assert resp.status_code == 422

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
