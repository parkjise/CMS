"""콘텐츠 유형 · 칸 (T-253, 콘텐츠 관리 기획서 CM-03 · 6장)."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from app.services import content_type as type_service
from app.services import feature as feature_service
from tests.conftest import _TestSession  # type: ignore
from tests.test_rls import tenant_b, tenant_b_headers  # noqa: F401 (픽스처)

_URL = "/api/v1/contents/types"


async def _sql(sql: str, params: dict | None = None) -> list:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        result = await session.execute(text(sql), params or {})
        rows = result.all() if result.returns_rows else []
        await session.commit()
        return rows


async def _enable(tenant_id: str) -> None:
    await _sql(
        "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled,"
        " enabled_at, created_at, updated_at) SELECT gen_random_uuid(), :t, id,"
        " true, now(), now(), now() FROM features WHERE key = 'CONTENT_MANAGE'"
        " ON CONFLICT ON CONSTRAINT uq_tenant_features_pair DO NOTHING",
        {"t": tenant_id},
    )
    await feature_service.invalidate_cache(tenant_id)


async def _disable(tenant_id: str) -> None:
    await _sql("DELETE FROM tenant_features WHERE tenant_id = :t", {"t": tenant_id})
    await feature_service.invalidate_cache(tenant_id)


@pytest.fixture
async def contents_on(test_tenant: dict):
    """스위치 켜짐 + STANDARD (유형 10개)"""
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t",
        {"t": test_tenant["id"]},
    )
    await _enable(test_tenant["id"])
    yield test_tenant
    await _disable(test_tenant["id"])


async def _create(client: AsyncClient, headers: dict, **body):
    return await client.post(_URL, headers=headers, json=body)


async def _list(client: AsyncClient, headers: dict) -> dict:
    resp = await client.get(_URL, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


async def _add_item(tenant_id: str, type_id: str, data: dict | None = None) -> str:
    """항목 API 는 T-254 — 값이 있는 항목을 직접 넣는다."""
    item_id = str(uuid.uuid4())
    import json

    await _sql(
        "INSERT INTO content_items (id, tenant_id, type_id, title, data)"
        " VALUES (:id, :t, :ty, '항목', CAST(:d AS jsonb))",
        {"id": item_id, "t": tenant_id, "ty": type_id, "d": json.dumps(data or {})},
    )
    return item_id


def _error(resp) -> dict:
    return resp.json()["error"]


class TestAccess:
    async def test_requires_auth(self, client: AsyncClient):
        assert (await client.get(_URL)).status_code == 401
        assert (await client.post(_URL, json={"name": "x"})).status_code == 401

    async def test_switch_off_lists_but_blocks_writes(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        data = await _list(client, auth_headers)
        assert data["enabled"] is False
        assert data["types"] == []
        assert [p["key"] for p in data["presets"]] == [
            "service",
            "faq",
            "history",
            "team",
            "partner",
        ]
        resp = await _create(client, auth_headers, preset_key="faq")
        assert resp.status_code == 403

    async def test_free_plan_is_422(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _enable(test_tenant["id"])
        resp = await _create(client, auth_headers, preset_key="faq")
        assert resp.status_code == 422
        assert _error(resp)["code"] == "PLAN_LIMIT_EXCEEDED"
        assert "STANDARD" in _error(resp)["message"]
        assert (await _list(client, auth_headers))["limits"]["can_create"] is False
        await _disable(test_tenant["id"])

    async def test_viewer_cannot_write(
        self, client: AsyncClient, test_user: dict, contents_on: dict
    ):
        await _sql(
            "UPDATE users SET role = 'TENANT_VIEWER' WHERE id = :i",
            {"i": test_user["id"]},
        )
        token = create_access_token(
            user_id=uuid.UUID(test_user["id"]),
            tenant_id=uuid.UUID(contents_on["id"]),
            role="TENANT_VIEWER",
        )
        headers = {"Authorization": f"Bearer {token}"}
        assert (await client.get(_URL, headers=headers)).status_code == 200
        assert (await _create(client, headers, preset_key="faq")).status_code == 403

    async def test_other_tenant_type_is_404(
        self,
        client: AsyncClient,
        auth_headers: dict,
        contents_on: dict,
        tenant_b_headers: dict,  # noqa: F811
        tenant_b: dict,  # noqa: F811
    ):
        created = (await _create(client, auth_headers, preset_key="faq")).json()
        type_id = created["data"]["id"]
        await _enable(tenant_b["tenant_id"])
        resp = await client.patch(
            f"{_URL}/{type_id}", headers=tenant_b_headers, json={"name": "해킹"}
        )
        assert resp.status_code == 404
        resp = await client.put(
            f"{_URL}/{type_id}/fields", headers=tenant_b_headers, json={"fields": []}
        )
        assert resp.status_code == 404
        resp = await client.delete(f"{_URL}/{type_id}", headers=tenant_b_headers)
        assert resp.status_code == 404
        assert (await _list(client, tenant_b_headers))["types"] == []
        await _disable(tenant_b["tenant_id"])


class TestCreate:
    async def test_preset_type_gets_its_fields(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        resp = await _create(client, auth_headers, preset_key="history")
        assert resp.status_code == 201, resp.text
        data = resp.json()["data"]
        assert data["type_key"] == "history"
        assert data["name"] == "연혁"
        assert data["preset_key"] == "history"
        year, month = data["fields"]
        assert (year["field_key"], year["field_type"], year["is_required"]) == (
            "year",
            "NUMBER",
            True,
        )
        assert year["field_options"] == {"min": 1900, "max": 2100}
        assert month["field_key"] == "month"
        logs = await _sql(
            "SELECT action, after_value->>'type_key' FROM audit_logs"
            " WHERE tenant_id = :t AND target_type = 'content_type'",
            {"t": contents_on["id"]},
        )
        assert [tuple(r) for r in logs] == [("CONTENT_TYPE_CREATED", "history")]

    async def test_blank_type_needs_name_and_key(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        resp = await _create(client, auth_headers, type_key="products")
        assert resp.status_code == 400
        assert _error(resp)["field"] == "name"
        resp = await _create(client, auth_headers, name="제품")
        assert resp.status_code == 400
        assert _error(resp)["field"] == "type_key"
        resp = await _create(
            client, auth_headers, name="제품", type_key="products", description="설명"
        )
        assert resp.status_code == 201
        assert resp.json()["data"]["fields"] == []
        assert resp.json()["data"]["preset_key"] is None

    @pytest.mark.parametrize("key", ["A", "a", "한글", "-x", "x-", "a_b", "a" * 41])
    async def test_key_format(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict, key: str
    ):
        resp = await _create(client, auth_headers, name="유형", type_key=key)
        assert resp.status_code == 400
        assert _error(resp)["field"] == "type_key"

    async def test_key_taken_and_trash_are_409(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        first = (await _create(client, auth_headers, preset_key="faq")).json()["data"]
        resp = await _create(client, auth_headers, preset_key="faq")
        assert resp.status_code == 409
        assert _error(resp)["field"] == "type_key"
        await client.delete(f"{_URL}/{first['id']}", headers=auth_headers)
        resp = await _create(client, auth_headers, name="FAQ", type_key="faq")
        assert resp.status_code == 409
        assert _error(resp)["message"] == type_service.MSG_KEY_TRASH

    async def test_unknown_preset_is_400(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        resp = await _create(client, auth_headers, preset_key="nope")
        assert resp.status_code == 400
        assert _error(resp)["field"] == "preset_key"

    async def test_limit_counts_live_types_only(
        self,
        client: AsyncClient,
        auth_headers: dict,
        contents_on: dict,
        monkeypatch,
    ):
        monkeypatch.setitem(type_service.CONTENT_TYPE_LIMITS, "STANDARD", 2)
        a = (await _create(client, auth_headers, preset_key="faq")).json()["data"]
        await _create(client, auth_headers, preset_key="team")
        resp = await _create(client, auth_headers, preset_key="partner")
        assert resp.status_code == 422
        assert "2개" in _error(resp)["message"]
        await client.delete(f"{_URL}/{a['id']}", headers=auth_headers)
        assert (
            await _create(client, auth_headers, preset_key="partner")
        ).status_code == 201
        # 복구도 한도 안에서만
        resp = await client.post(f"{_URL}/{a['id']}/restore", headers=auth_headers)
        assert resp.status_code == 422


class TestUpdateDelete:
    async def test_rename_and_change_key(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        created = (await _create(client, auth_headers, preset_key="faq")).json()
        type_id = created["data"]["id"]
        await _create(client, auth_headers, preset_key="team")
        resp = await client.patch(
            f"{_URL}/{type_id}", headers=auth_headers, json={"type_key": "team"}
        )
        assert resp.status_code == 409
        resp = await client.patch(
            f"{_URL}/{type_id}", headers=auth_headers, json={"name": " "}
        )
        assert resp.status_code == 400
        resp = await client.patch(
            f"{_URL}/{type_id}",
            headers=auth_headers,
            json={"name": "질문과 답", "type_key": "qna", "description": ""},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert (data["name"], data["type_key"], data["description"]) == (
            "질문과 답",
            "qna",
            "",
        )

    async def test_delete_blocked_while_items_remain(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        created = (await _create(client, auth_headers, preset_key="faq")).json()
        type_id = created["data"]["id"]
        item_id = await _add_item(contents_on["id"], type_id)
        listed = await _list(client, auth_headers)
        assert listed["types"][0]["item_count"] == 1
        resp = await client.delete(f"{_URL}/{type_id}", headers=auth_headers)
        assert resp.status_code == 409
        await _sql(
            "UPDATE content_items SET deleted_at = now() WHERE id = :i", {"i": item_id}
        )
        resp = await client.delete(f"{_URL}/{type_id}", headers=auth_headers)
        assert resp.status_code == 200
        listed = await _list(client, auth_headers)
        assert listed["types"] == []
        assert [t["id"] for t in listed["trash"]] == [type_id]
        resp = await client.post(f"{_URL}/{type_id}/restore", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["data"]["deleted_at"] is None
        assert (await client.get(f"{_URL}/{type_id}", headers=auth_headers)).json()[
            "data"
        ]["type_key"] == "faq"

    async def test_reorder(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        a = (await _create(client, auth_headers, preset_key="faq")).json()["data"]
        b = (await _create(client, auth_headers, preset_key="team")).json()["data"]
        resp = await client.patch(
            f"{_URL}/order", headers=auth_headers, json={"ids": [a["id"]]}
        )
        assert resp.status_code == 400
        resp = await client.patch(
            f"{_URL}/order", headers=auth_headers, json={"ids": [b["id"], a["id"]]}
        )
        assert resp.status_code == 200
        listed = await _list(client, auth_headers)
        assert [t["type_key"] for t in listed["types"]] == ["team", "faq"]


class TestFields:
    async def _type(self, client: AsyncClient, headers: dict) -> dict:
        resp = await _create(client, headers, name="제품", type_key="products")
        return resp.json()["data"]

    async def _save(self, client: AsyncClient, headers: dict, type_id: str, fields):
        return await client.put(
            f"{_URL}/{type_id}/fields", headers=headers, json={"fields": fields}
        )

    async def test_save_add_order_and_remove(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await self._type(client, auth_headers)
        resp = await self._save(
            client,
            auth_headers,
            t["id"],
            [
                {"label": "가격", "field_type": "NUMBER", "min": 0},
                {
                    "label": "색상",
                    "field_type": "SELECT",
                    "field_key": "color",
                    "options": [
                        {"value": "red", "label": "빨강"},
                        {"value": "blue", "label": "파랑"},
                    ],
                    "default_value": "red",
                },
            ],
        )
        assert resp.status_code == 200, resp.text
        price, color = resp.json()["data"]["fields"]
        assert price["field_key"] == "field_1"
        assert price["field_options"] == {"min": 0}
        assert color["default_value"] == "red"
        # 응답 모양(field_options 등)을 그대로 보내면 400 — 입력 칸만 받는다
        resp = await self._save(client, auth_headers, t["id"], [color])
        assert resp.status_code == 400
        # 순서 바꾸고 가격 칸은 빼고 새 칸 하나
        resp = await self._save(
            client,
            auth_headers,
            t["id"],
            [
                {"label": "링크", "field_type": "URL"},
                {
                    "id": color["id"],
                    "label": "색",
                    "field_type": "SELECT",
                    "options": [
                        {"value": "red", "label": "빨강"},
                        {"value": "blue", "label": "파랑"},
                    ],
                },
            ],
        )
        assert resp.status_code == 200, resp.text
        fields = resp.json()["data"]["fields"]
        # 지운 field_1 키는 다시 쓰지 않는다
        assert [(f["field_key"], f["label"]) for f in fields] == [
            ("field_2", "링크"),
            ("color", "색"),
        ]
        rows = await _sql(
            "SELECT field_key FROM content_type_fields WHERE type_id = :t"
            " AND deleted_at IS NOT NULL",
            {"t": t["id"]},
        )
        assert [r[0] for r in rows] == ["field_1"]

    @pytest.mark.parametrize(
        ("field", "where"),
        [
            ({"label": "별", "field_type": "RATING"}, None),
            ({"label": "고르기", "field_type": "SELECT"}, "fields.0.options"),
            (
                {"label": "수", "field_type": "NUMBER", "min": 5, "max": 1},
                "fields.0.min",
            ),
            (
                {"label": "수", "field_type": "NUMBER", "default_value": "abc"},
                "fields.0.default_value",
            ),
            ({"label": "제목", "field_type": "TEXT", "field_key": "title"}, None),
        ],
    )
    async def test_invalid_fields_are_400(
        self,
        client: AsyncClient,
        auth_headers: dict,
        contents_on: dict,
        field: dict,
        where: str | None,
    ):
        t = await self._type(client, auth_headers)
        resp = await self._save(client, auth_headers, t["id"], [field])
        assert resp.status_code == 400, resp.text
        if where:
            assert _error(resp)["field"] == where

    async def test_reserved_and_duplicate_keys(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await self._type(client, auth_headers)
        resp = await self._save(
            client,
            auth_headers,
            t["id"],
            [{"label": "요약", "field_type": "TEXT", "field_key": "summary"}],
        )
        assert resp.status_code == 400
        assert _error(resp)["message"] == type_service.MSG_FIELD_KEY_RESERVED
        same = {"label": "a", "field_type": "TEXT", "field_key": "same"}
        resp = await self._save(client, auth_headers, t["id"], [same, same])
        assert resp.status_code == 400
        assert _error(resp)["field"] == "fields.1.field_key"

    async def test_existing_key_is_fixed_and_unknown_id_400(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await self._type(client, auth_headers)
        saved = await self._save(
            client, auth_headers, t["id"], [{"label": "a", "field_type": "TEXT"}]
        )
        field = saved.json()["data"]["fields"][0]
        resp = await self._save(
            client,
            auth_headers,
            t["id"],
            [
                {
                    "id": field["id"],
                    "field_key": "other",
                    "label": "a",
                    "field_type": "TEXT",
                }
            ],
        )
        assert resp.status_code == 400
        assert _error(resp)["message"] == type_service.MSG_FIELD_KEY_FIXED
        resp = await self._save(
            client,
            auth_headers,
            t["id"],
            [{"id": str(uuid.uuid4()), "label": "a", "field_type": "TEXT"}],
        )
        assert resp.status_code == 400
        assert _error(resp)["message"] == type_service.MSG_UNKNOWN_FIELD

    async def test_type_and_options_locked_while_values_exist(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await self._type(client, auth_headers)
        choices = [{"value": "s", "label": "S"}, {"value": "m", "label": "M"}]
        saved = await self._save(
            client,
            auth_headers,
            t["id"],
            [
                {
                    "label": "크기",
                    "field_type": "SELECT",
                    "field_key": "size",
                    "options": choices,
                },
                {"label": "메모", "field_type": "TEXT", "field_key": "memo"},
            ],
        )
        size, memo = saved.json()["data"]["fields"]
        await _add_item(contents_on["id"], t["id"], {"size": "s", "memo": "안녕"})
        resp = await self._save(
            client,
            auth_headers,
            t["id"],
            [
                {
                    "id": size["id"],
                    "label": "크기",
                    "field_type": "SELECT",
                    "options": choices[1:],
                },
                {"id": memo["id"], "label": "메모", "field_type": "TEXT"},
            ],
        )
        assert resp.status_code == 409
        assert _error(resp)["field"] == "fields.0.options"
        resp = await self._save(
            client,
            auth_headers,
            t["id"],
            [
                {
                    "id": size["id"],
                    "label": "크기",
                    "field_type": "SELECT",
                    "options": choices,
                },
                {"id": memo["id"], "label": "메모", "field_type": "TEXTAREA"},
            ],
        )
        assert resp.status_code == 409
        assert _error(resp)["field"] == "fields.1.field_type"
        # 값이 없는 선택지 m 은 뺄 수 있다
        resp = await self._save(
            client,
            auth_headers,
            t["id"],
            [
                {
                    "id": size["id"],
                    "label": "크기",
                    "field_type": "SELECT",
                    "options": choices[:1],
                },
                {"id": memo["id"], "label": "메모", "field_type": "TEXT"},
            ],
        )
        assert resp.status_code == 200

    async def test_too_many_fields(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await self._type(client, auth_headers)
        fields = [{"label": f"칸{i}", "field_type": "TEXT"} for i in range(21)]
        resp = await self._save(client, auth_headers, t["id"], fields)
        assert resp.status_code == 400
        assert _error(resp)["message"] == type_service.MSG_TOO_MANY_FIELDS
