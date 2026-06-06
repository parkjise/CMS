import uuid

from httpx import AsyncClient


def _change(section_id: str, field: str, value) -> dict:
    return {"section_id": section_id, "field": field, "value": value}


def _body(section_id: str, field: str, value) -> dict:
    return {"changes": [_change(section_id, field, value)]}


class TestBatchSave:
    _url = "/api/v1/edit/batch-save"

    async def test_requires_auth(self, client: AsyncClient, test_section: dict):
        resp = await client.post(
            self._url, json=_body(test_section["id"], "main_title", "v")
        )
        assert resp.status_code == 401

    async def test_single_change(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_section: dict,
    ):
        resp = await client.post(
            self._url,
            headers=auth_headers,
            json=_body(test_section["id"], "main_title", "새 타이틀"),
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["saved_count"] == 1
        assert data["failed_count"] == 0
        assert data["cache_purged"] is True

    async def test_multiple_changes(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_section: dict,
    ):
        sid = test_section["id"]
        changes = [
            _change(sid, "main_title", "배치 타이틀"),
            _change(sid, "sub_title", "서브 타이틀"),
            _change(sid, "description", "설명 텍스트"),
        ]
        resp = await client.post(
            self._url, headers=auth_headers, json={"changes": changes}
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["saved_count"] == 3
        assert data["failed_count"] == 0

    async def test_update_existing_field(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_section: dict,
    ):
        sid = test_section["id"]
        await client.post(
            self._url,
            headers=auth_headers,
            json=_body(sid, "main_title", "초기값"),
        )
        resp = await client.post(
            self._url,
            headers=auth_headers,
            json=_body(sid, "main_title", "변경값"),
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["saved_count"] == 1

    async def test_field_validation_main_title_too_long(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_section: dict,
    ):
        resp = await client.post(
            self._url,
            headers=auth_headers,
            json=_body(test_section["id"], "main_title", "a" * 41),
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["saved_count"] == 0
        assert data["failed_count"] == 1
        assert data["cache_purged"] is False

    async def test_partial_failure(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_section: dict,
    ):
        sid = test_section["id"]
        changes = [
            _change(sid, "main_title", "정상 타이틀"),
            _change(sid, "main_title", "a" * 41),  # 실패
            _change(sid, "sub_title", "서브 타이틀"),
        ]
        resp = await client.post(
            self._url, headers=auth_headers, json={"changes": changes}
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["saved_count"] == 2
        assert data["failed_count"] == 1

    async def test_nonexistent_section_fails(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        fake_id = str(uuid.uuid4())
        resp = await client.post(
            self._url,
            headers=auth_headers,
            json=_body(fake_id, "main_title", "값"),
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["saved_count"] == 0
        assert data["failed_count"] == 1

    async def test_empty_changes_rejected(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            self._url, headers=auth_headers, json={"changes": []}
        )
        assert resp.status_code == 422

    async def test_null_value_allowed(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_section: dict,
    ):
        resp = await client.post(
            self._url,
            headers=auth_headers,
            json=_body(test_section["id"], "bg_image_url", None),
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["saved_count"] == 1

    async def test_url_field_infers_type(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_section: dict,
    ):
        resp = await client.post(
            self._url,
            headers=auth_headers,
            json=_body(
                test_section["id"],
                "hero_image_url",
                "https://example.com/img.jpg",
            ),
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["saved_count"] == 1

    async def test_too_many_changes_rejected(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_section: dict,
    ):
        sid = test_section["id"]
        changes = [_change(sid, f"field_{i}", "v") for i in range(51)]
        resp = await client.post(
            self._url, headers=auth_headers, json={"changes": changes}
        )
        assert resp.status_code == 422
