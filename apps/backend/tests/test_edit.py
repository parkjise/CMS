import json
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
        resp = await client.post(self._url, headers=auth_headers, json={"changes": []})
        assert resp.status_code == 400

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
        assert resp.status_code == 400


async def _seed_list_setting(section_id: str, tenant_id: str, value: str) -> None:
    from sqlalchemy import text

    from tests.conftest import _TestSession

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text(
                "INSERT INTO section_settings (id, tenant_id, section_id, field_key,"
                " field_value, value_type, created_at, updated_at) VALUES"
                " (gen_random_uuid(), :tid, :sid, 'slides', :v, 'JSON', now(), now())"
            ),
            {"tid": tenant_id, "sid": section_id, "v": value},
        )
        await session.commit()


async def _setting(section_id: str, field: str) -> tuple[str, str]:
    from sqlalchemy import text

    from tests.conftest import _TestSession

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        row = (
            await session.execute(
                text(
                    "SELECT field_value, value_type FROM section_settings"
                    " WHERE section_id = :sid AND field_key = :f"
                ),
                {"sid": section_id, "f": field},
            )
        ).one()
        return row[0], row[1]


class TestBatchSaveListField:
    """목록 칸(슬라이드 · 카드) 안 사진 교체 — 목록 전체를 저장 (T-125-B)"""

    _url = "/api/v1/edit/batch-save"

    def _slides(self, n: int, url: str = "https://example.com/a.jpg") -> str:
        return json.dumps(
            [{"image_url": url, "title": "슬라이드 제목 " * 10} for _ in range(n)],
            ensure_ascii=False,
        )

    async def test_long_list_saved_as_json(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        sid = test_section["id"]
        await _seed_list_setting(sid, test_section["tenant_id"], self._slides(1))
        value = self._slides(12, "https://example.com/new.jpg")
        assert len(value) > 1000  # 일반 칸 한도를 넘는 목록
        resp = await client.post(
            self._url, headers=auth_headers, json=_body(sid, "slides", value)
        )
        assert resp.json()["data"]["saved_count"] == 1
        saved, value_type = await _setting(sid, "slides")
        assert value_type == "JSON"
        assert json.loads(saved)[0]["image_url"] == "https://example.com/new.jpg"

    async def test_list_rejects_non_list(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        sid = test_section["id"]
        await _seed_list_setting(sid, test_section["tenant_id"], self._slides(1))
        for bad in ("그냥 글자", '{"image_url": "x"}'):
            resp = await client.post(
                self._url, headers=auth_headers, json=_body(sid, "slides", bad)
            )
            assert resp.json()["data"]["failed_count"] == 1
        saved, _ = await _setting(sid, "slides")
        assert json.loads(saved)[0]["image_url"] == "https://example.com/a.jpg"

    async def test_list_rejects_unsafe_nested_url(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        sid = test_section["id"]
        await _seed_list_setting(sid, test_section["tenant_id"], self._slides(1))
        resp = await client.post(
            self._url,
            headers=auth_headers,
            json=_body(sid, "slides", self._slides(1, "javascript:alert(1)")),
        )
        assert resp.json()["data"]["failed_count"] == 1

    async def test_list_too_long_rejected(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        sid = test_section["id"]
        await _seed_list_setting(sid, test_section["tenant_id"], self._slides(1))
        resp = await client.post(
            self._url,
            headers=auth_headers,
            json=_body(sid, "slides", self._slides(300)),
        )
        assert resp.json()["data"]["failed_count"] == 1

    async def test_text_field_keeps_text_limit(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        """목록이 아닌 칸은 '[' 로 시작해도 일반 글자 한도 그대로"""
        resp = await client.post(
            self._url,
            headers=auth_headers,
            json=_body(test_section["id"], "notes", "[" + "a" * 1000),
        )
        assert resp.json()["data"]["failed_count"] == 1


class TestBatchSaveFieldLimits:
    """편집 모드 저장도 같은 글자 수 한도 (T-127)."""

    _url = "/api/v1/edit/batch-save"

    async def _save(self, client, headers, section_id, field, value) -> dict:
        resp = await client.post(
            self._url, headers=headers, json=_body(section_id, field, value)
        )
        assert resp.status_code == 200
        return resp.json()["data"]

    async def test_over_limit_fails(self, client, auth_headers, test_section):
        sid = test_section["id"]
        cases = [("sub_copy", "a" * 81), ("cta_text", "a" * 21), ("cta_url", "/" + "a" * 200)]
        for field, value in cases:
            assert (await self._save(client, auth_headers, sid, field, value))["failed_count"] == 1

    async def test_rich_counts_plain_text(self, client, auth_headers, test_section):
        resp = await client.post(
            self._url,
            headers=auth_headers,
            json={
                "changes": [
                    {
                        "section_id": test_section["id"],
                        "field": "sub_copy",
                        "value": "<strong>" + "a" * 81 + "</strong>",
                        "format": "rich",
                    }
                ]
            },
        )
        assert resp.json()["data"]["failed_count"] == 1
