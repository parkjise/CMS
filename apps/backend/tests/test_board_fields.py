"""게시판 필드 정의 · 값 검증 (T-142-A, 게시판 모듈 기획서 BM-04 · 8.4)."""

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from sqlalchemy import text

from app.core.security import create_access_token
from app.db.session import set_rls_context
from app.services import feature as feature_service
from app.services import site_cache
from tests.conftest import _TestSession  # type: ignore
from tests.test_rls_enforcement import _app_session  # type: ignore

BOARDS = "/api/v1/boards"
CHOICES = [{"value": "a", "label": "가"}, {"value": "b", "label": "나"}]


async def _sql(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        rows = result.fetchall() if result.returns_rows else None
        await s.commit()
    return rows


@pytest.fixture(autouse=True)
def purged(monkeypatch) -> list[str]:
    calls: list[str] = []

    async def fake_purge(_db, tenant_id):
        calls.append(str(tenant_id))
        return True

    monkeypatch.setattr(site_cache, "purge_site", fake_purge)
    return calls


@pytest.fixture
async def tenant(test_tenant, test_user) -> AsyncIterator[dict]:
    await feature_service.invalidate_cache(test_tenant["id"])
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t", t=test_tenant["id"]
    )
    yield test_tenant
    await _sql("DELETE FROM audit_logs WHERE tenant_id = :t", t=test_tenant["id"])
    await _sql("DELETE FROM tenant_features WHERE tenant_id = :t", t=test_tenant["id"])
    await feature_service.invalidate_cache(test_tenant["id"])


@pytest.fixture
async def board(client, auth_headers, tenant) -> dict:
    resp = await client.post(
        BOARDS, json={"name": "후기", "slug": "reviews"}, headers=auth_headers
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    data["fields"] = f"{BOARDS}/{data['id']}/fields"
    data["posts"] = f"{BOARDS}/{data['id']}/posts"
    return data


@pytest.fixture
async def other_headers() -> AsyncIterator[dict]:
    tenant_id, user_id = str(uuid.uuid4()), str(uuid.uuid4())
    slug = f"other-{tenant_id[:8]}"
    await _sql(
        "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
        " updated_at) VALUES (:id, :s, :s, 'PREMIUM', true, now(), now())",
        id=tenant_id,
        s=slug,
    )
    await _sql(
        "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
        " created_at, updated_at) VALUES (:id, :t, :e, 'x', 'TENANT_ADMIN', true,"
        " now(), now())",
        id=user_id,
        t=tenant_id,
        e=f"{slug}@example.com",
    )
    token = create_access_token(
        user_id=uuid.UUID(user_id), tenant_id=uuid.UUID(tenant_id), role="TENANT_ADMIN"
    )
    yield {"Authorization": f"Bearer {token}"}
    await _sql("DELETE FROM users WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM tenants WHERE id = :t", t=tenant_id)


async def _field(client, headers, board: dict, **fields: Any) -> dict:
    payload = {"label": "칸", "field_type": "TEXT", **fields}
    resp = await client.post(board["fields"], json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _post(client, headers, board: dict, **fields: Any):
    return await client.post(
        board["posts"], json={"title": "글", **fields}, headers=headers
    )


async def _publish(client, headers, board: dict, **custom: Any) -> dict:
    resp = await _post(
        client, headers, board, status="PUBLISHED", custom_data=custom or None
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


class TestFieldCrud:
    async def test_create_auto_key_and_order(self, client, auth_headers, board):
        one = await _field(
            client, auth_headers, board, label="별점", field_type="RATING"
        )
        two = await _field(client, auth_headers, board, label="날짜", field_type="DATE")

        assert (one["field_key"], one["display_order"]) == ("field_1", 0)
        assert (two["field_key"], two["display_order"]) == ("field_2", 1)
        assert one["is_visible"] is True

        data = (await client.get(board["fields"], headers=auth_headers)).json()["data"]
        assert [f["label"] for f in data] == ["별점", "날짜"]

    async def test_custom_key(self, client, auth_headers, board):
        field = await _field(client, auth_headers, board, field_key="visit_date")
        assert field["field_key"] == "visit_date"

    @pytest.mark.parametrize("key", ["한글", "A_b", "1abc", "a", "a-b", "x" * 51])
    async def test_invalid_key_format(self, client, auth_headers, board, key):
        resp = await client.post(
            board["fields"],
            json={"label": "칸", "field_type": "TEXT", "field_key": key},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    @pytest.mark.parametrize("key", ["title", "body", "status", "custom_data"])
    async def test_reserved_key(self, client, auth_headers, board, key):
        resp = await client.post(
            board["fields"],
            json={"label": "칸", "field_type": "TEXT", "field_key": key},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["field"] == "field_key"

    async def test_deleted_key_not_reused(self, client, auth_headers, board):
        first = await _field(client, auth_headers, board, field_key="rating_x")
        await client.delete(f"{board['fields']}/{first['id']}", headers=auth_headers)

        again = await client.post(
            board["fields"],
            json={"label": "칸", "field_type": "TEXT", "field_key": "rating_x"},
            headers=auth_headers,
        )
        assert again.status_code == 409

        auto_one = await _field(client, auth_headers, board)
        await client.delete(f"{board['fields']}/{auto_one['id']}", headers=auth_headers)
        auto_two = await _field(client, auth_headers, board)
        assert auto_one["field_key"] != auto_two["field_key"]

    async def test_key_cannot_change(self, client, auth_headers, board):
        field = await _field(client, auth_headers, board)
        resp = await client.patch(
            f"{board['fields']}/{field['id']}",
            json={"field_key": "new_key"},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_update_label_and_flags(self, client, auth_headers, board):
        field = await _field(client, auth_headers, board)
        resp = await client.patch(
            f"{board['fields']}/{field['id']}",
            json={"label": "새 이름", "is_required": True, "is_visible": False},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert (data["label"], data["is_required"], data["is_visible"]) == (
            "새 이름",
            True,
            False,
        )
        assert data["field_key"] == field["field_key"]

    async def test_reorder(self, client, auth_headers, board):
        a = await _field(client, auth_headers, board, label="A")
        b = await _field(client, auth_headers, board, label="B")

        resp = await client.patch(
            f"{board['fields']}/order",
            json={"field_ids": [b["id"], a["id"]]},
            headers=auth_headers,
        )

        assert resp.status_code == 200, resp.text
        assert [f["label"] for f in resp.json()["data"]] == ["B", "A"]

    async def test_reorder_needs_every_field(self, client, auth_headers, board):
        a = await _field(client, auth_headers, board)
        await _field(client, auth_headers, board)
        resp = await client.patch(
            f"{board['fields']}/order",
            json={"field_ids": [a["id"]]},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_field_limit_counts_active_only(self, client, auth_headers, board):
        fields = [await _field(client, auth_headers, board) for _ in range(20)]
        over = await client.post(
            board["fields"],
            json={"label": "칸", "field_type": "TEXT"},
            headers=auth_headers,
        )
        assert over.status_code == 409

        await client.delete(
            f"{board['fields']}/{fields[0]['id']}", headers=auth_headers
        )
        await _field(client, auth_headers, board)
        restore = await client.post(
            f"{board['fields']}/{fields[0]['id']}/restore", headers=auth_headers
        )
        assert restore.status_code == 409

    async def test_system_board_rejected(self, client, auth_headers, tenant):
        board_id = str(uuid.uuid4())
        await _sql(
            "INSERT INTO boards (id, tenant_id, name, slug, system_key, board_type,"
            " status, settings) VALUES (:i, :t, '공지', 'notice', 'notice', 'LIST',"
            " 'ACTIVE', '{}')",
            i=board_id,
            t=tenant["id"],
        )
        resp = await client.post(
            f"{BOARDS}/{board_id}/fields",
            json={"label": "칸", "field_type": "TEXT"},
            headers=auth_headers,
        )
        assert resp.status_code == 409

    @pytest.mark.parametrize(
        "payload",
        [
            {"label": "", "field_type": "TEXT"},
            {"label": "칸", "field_type": "CHECKBOX"},
            {"label": "칸", "field_type": "SELECT"},
            {"label": "칸", "field_type": "SELECT", "options": []},
            {
                "label": "칸",
                "field_type": "SELECT",
                "options": [CHOICES[0], CHOICES[0]],
            },
            {"label": "칸", "field_type": "NUMBER", "min": 5, "max": 1},
            {"label": "칸", "field_type": "RATING", "default_value": 9},
        ],
    )
    async def test_invalid_definition(self, client, auth_headers, board, payload):
        resp = await client.post(board["fields"], json=payload, headers=auth_headers)
        assert resp.status_code == 400, resp.text

    async def test_requires_login(self, client, board):
        assert (await client.get(board["fields"])).status_code == 401

    async def test_viewer_403(self, client, tenant, test_user, board):
        await _sql(
            "UPDATE users SET role = 'TENANT_VIEWER' WHERE id = :i", i=test_user["id"]
        )
        token = create_access_token(
            user_id=uuid.UUID(test_user["id"]),
            tenant_id=uuid.UUID(tenant["id"]),
            role="TENANT_VIEWER",
        )
        headers = {"Authorization": f"Bearer {token}"}
        assert (await client.get(board["fields"], headers=headers)).status_code == 200
        resp = await client.post(
            board["fields"], json={"label": "칸", "field_type": "TEXT"}, headers=headers
        )
        assert resp.status_code == 403

    async def test_other_tenant_404(self, client, auth_headers, other_headers, board):
        field = await _field(client, auth_headers, board)
        url = f"{board['fields']}/{field['id']}"
        assert (
            await client.get(board["fields"], headers=other_headers)
        ).status_code == 404
        assert (
            await client.patch(url, json={"label": "x"}, headers=other_headers)
        ).status_code == 404
        assert (await client.delete(url, headers=other_headers)).status_code == 404

    async def test_field_of_other_board_404(self, client, auth_headers, board):
        field = await _field(client, auth_headers, board)
        second = (
            await client.post(BOARDS, json={"name": "둘째"}, headers=auth_headers)
        ).json()["data"]
        resp = await client.patch(
            f"{BOARDS}/{second['id']}/fields/{field['id']}",
            json={"label": "x"},
            headers=auth_headers,
        )
        assert resp.status_code == 404


class TestRls:
    async def test_only_own_rows_visible(self, client, auth_headers, tenant, board):
        await _field(client, auth_headers, board)
        count = text("SELECT count(*) FROM board_fields WHERE board_id = :b")
        async with _app_session() as db:
            await set_rls_context(db, uuid.UUID(tenant["id"]))
            own = (await db.execute(count, {"b": board["id"]})).scalar_one()
        async with _app_session() as db:
            await set_rls_context(db, uuid.uuid4())
            others = (await db.execute(count, {"b": board["id"]})).scalar_one()
        assert (own, others) == (1, 0)


VALUE_CASES: list[tuple[dict, Any, Any]] = [
    ({"field_type": "TEXT"}, "  글자  ", "글자"),
    ({"field_type": "TEXTAREA"}, "여러\n줄", "여러\n줄"),
    ({"field_type": "NUMBER"}, 3.5, 3.5),
    ({"field_type": "NUMBER", "min": 1, "max": 5}, 5, 5),
    ({"field_type": "DATE"}, "2026-11-04", "2026-11-04"),
    ({"field_type": "SELECT", "options": CHOICES}, "a", "a"),
    ({"field_type": "MULTI_SELECT", "options": CHOICES}, ["a", "b", "a"], ["a", "b"]),
    ({"field_type": "BOOLEAN"}, False, False),
    ({"field_type": "RATING"}, 5, 5),
    ({"field_type": "IMAGE"}, "http://x/a.webp", "http://x/a.webp"),
    ({"field_type": "IMAGE"}, "/uploads/a.webp", "/uploads/a.webp"),
]

BAD_CASES: list[tuple[dict, Any]] = [
    ({"field_type": "TEXT"}, 123),
    ({"field_type": "TEXT"}, "x" * 201),
    ({"field_type": "TEXTAREA"}, "x" * 5001),
    ({"field_type": "NUMBER"}, "3"),
    ({"field_type": "NUMBER"}, True),
    ({"field_type": "NUMBER", "min": 1, "max": 5}, 6),
    ({"field_type": "NUMBER", "min": 1, "max": 5}, 0),
    ({"field_type": "DATE"}, "2026-13-01"),
    ({"field_type": "DATE"}, "20261101"),
    ({"field_type": "DATE"}, 20261101),
    ({"field_type": "SELECT", "options": CHOICES}, "z"),
    ({"field_type": "SELECT", "options": CHOICES}, ["a"]),
    ({"field_type": "MULTI_SELECT", "options": CHOICES}, "a"),
    ({"field_type": "MULTI_SELECT", "options": CHOICES}, ["a", "z"]),
    ({"field_type": "BOOLEAN"}, "true"),
    ({"field_type": "RATING"}, 0),
    ({"field_type": "RATING"}, 6),
    ({"field_type": "RATING"}, 3.5),
    ({"field_type": "RATING"}, True),
    ({"field_type": "IMAGE"}, "javascript:alert(1)"),
    ({"field_type": "IMAGE"}, "data:image/png;base64,AAAA"),
    ({"field_type": "IMAGE"}, "//evil.example/a.png"),
    ({"field_type": "IMAGE"}, ["http://x/a.webp"]),
]


class TestValues:
    @pytest.mark.parametrize(("definition", "value", "stored"), VALUE_CASES)
    async def test_valid(self, client, auth_headers, board, definition, value, stored):
        field = await _field(client, auth_headers, board, **definition)
        data = await _publish(
            client, auth_headers, board, **{field["field_key"]: value}
        )
        assert data["custom_data"] == {field["field_key"]: stored}

    @pytest.mark.parametrize(("definition", "value"), BAD_CASES)
    async def test_invalid(self, client, auth_headers, board, definition, value):
        field = await _field(client, auth_headers, board, **definition)
        resp = await _post(
            client,
            auth_headers,
            board,
            status="DRAFT",
            custom_data={field["field_key"]: value},
        )
        assert resp.status_code == 400, resp.text
        assert resp.json()["error"]["field"] == f"custom_data.{field['field_key']}"

    async def test_undefined_key_rejected(self, client, auth_headers, board):
        resp = await _post(client, auth_headers, board, custom_data={"nope": 1})
        assert resp.status_code == 400
        assert resp.json()["error"]["field"] == "custom_data.nope"

    async def test_html_stays_text(self, client, auth_headers, board):
        field = await _field(client, auth_headers, board)
        value = "<script>alert(1)</script>"
        data = await _publish(
            client, auth_headers, board, **{field["field_key"]: value}
        )
        assert data["custom_data"][field["field_key"]] == value

    async def test_empty_not_stored(self, client, auth_headers, board):
        a = await _field(client, auth_headers, board)
        b = await _field(
            client, auth_headers, board, field_type="MULTI_SELECT", options=CHOICES
        )
        resp = await _post(
            client,
            auth_headers,
            board,
            custom_data={a["field_key"]: "  ", b["field_key"]: []},
        )
        assert resp.json()["data"]["custom_data"] == {}

    async def test_default_applied_on_create_only(self, client, auth_headers, board):
        field = await _field(
            client, auth_headers, board, field_type="RATING", default_value=3
        )
        key = field["field_key"]
        created = (await _post(client, auth_headers, board)).json()["data"]
        assert created["custom_data"] == {key: 3}

        cleared = await client.patch(
            f"{board['posts']}/{created['id']}",
            json={"custom_data": {key: None}},
            headers=auth_headers,
        )
        assert cleared.json()["data"]["custom_data"] == {}
        unchanged = await client.patch(
            f"{board['posts']}/{created['id']}",
            json={"title": "새 제목"},
            headers=auth_headers,
        )
        assert unchanged.json()["data"]["custom_data"] == {}

    async def test_partial_update_keeps_other_values(self, client, auth_headers, board):
        a = await _field(client, auth_headers, board)
        b = await _field(client, auth_headers, board)
        post = await _publish(
            client,
            auth_headers,
            board,
            **{a["field_key"]: "하나", b["field_key"]: "둘"},
        )
        resp = await client.patch(
            f"{board['posts']}/{post['id']}",
            json={"custom_data": {a["field_key"]: "바꿈"}},
            headers=auth_headers,
        )
        assert resp.json()["data"]["custom_data"] == {
            a["field_key"]: "바꿈",
            b["field_key"]: "둘",
        }

    async def test_failed_update_changes_nothing(self, client, auth_headers, board):
        field = await _field(client, auth_headers, board, field_type="RATING")
        post = await _publish(client, auth_headers, board, **{field["field_key"]: 3})
        url = f"{board['posts']}/{post['id']}"
        resp = await client.patch(
            url,
            json={"title": "바뀌면 안 됨", "custom_data": {field["field_key"]: 9}},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        data = (await client.get(url, headers=auth_headers)).json()["data"]
        assert data["title"] == "글"
        assert data["custom_data"] == {field["field_key"]: 3}


class TestRequired:
    async def _required(self, client, headers, board) -> str:
        field = await _field(client, headers, board, is_required=True)
        return field["field_key"]

    async def test_new_public_post_needs_value(self, client, auth_headers, board):
        key = await self._required(client, auth_headers, board)
        resp = await _post(client, auth_headers, board, status="PUBLISHED")
        assert resp.status_code == 400
        assert resp.json()["error"]["field"] == f"custom_data.{key}"

    @pytest.mark.parametrize("post_status", ["DRAFT", "PRIVATE"])
    async def test_not_public_skips_check(
        self, client, auth_headers, board, post_status
    ):
        await self._required(client, auth_headers, board)
        resp = await _post(client, auth_headers, board, status=post_status)
        assert resp.status_code == 201, resp.text

    async def test_draft_to_public_checked(self, client, auth_headers, board):
        key = await self._required(client, auth_headers, board)
        draft = (await _post(client, auth_headers, board)).json()["data"]
        url = f"{board['posts']}/{draft['id']}"

        bad = await client.patch(
            url, json={"status": "PUBLISHED"}, headers=auth_headers
        )
        assert bad.status_code == 400

        ok = await client.patch(
            url,
            json={"status": "PUBLISHED", "custom_data": {key: "값"}},
            headers=auth_headers,
        )
        assert ok.status_code == 200, ok.text

    async def test_existing_post_can_still_be_edited(self, client, auth_headers, board):
        """필수 칸을 나중에 만들어도 예전 글을 고칠 수 있다 (기획서 8.4)."""
        post = await _publish(client, auth_headers, board)
        await self._required(client, auth_headers, board)
        resp = await client.patch(
            f"{board['posts']}/{post['id']}",
            json={"title": "고친 제목"},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text

    async def test_existing_value_cannot_be_cleared(self, client, auth_headers, board):
        key = await self._required(client, auth_headers, board)
        post = await _publish(client, auth_headers, board, **{key: "값"})
        resp = await client.patch(
            f"{board['posts']}/{post['id']}",
            json={"custom_data": {key: ""}},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_bulk_publish_checks_required(self, client, auth_headers, board):
        key = await self._required(client, auth_headers, board)
        empty = (await _post(client, auth_headers, board, title="빈 글")).json()["data"]
        full = (
            await _post(client, auth_headers, board, custom_data={key: "값"})
        ).json()["data"]

        resp = await client.post(
            "/api/v1/posts/bulk",
            json={"post_ids": [empty["id"], full["id"]], "action": "PUBLISH"},
            headers=auth_headers,
        )

        assert resp.status_code == 400
        assert "빈 글" in resp.json()["error"]["message"]
        got = await client.get(f"{board['posts']}/{full['id']}", headers=auth_headers)
        assert got.json()["data"]["status"] == "DRAFT"

    async def test_bulk_republish_of_old_post_allowed(
        self, client, auth_headers, board
    ):
        post = await _publish(client, auth_headers, board)
        await client.post(
            "/api/v1/posts/bulk",
            json={"post_ids": [post["id"]], "action": "PRIVATE"},
            headers=auth_headers,
        )
        await self._required(client, auth_headers, board)
        resp = await client.post(
            "/api/v1/posts/bulk",
            json={"post_ids": [post["id"]], "action": "PUBLISH"},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text


class TestChangePolicy:
    async def test_type_change_without_values(self, client, auth_headers, board):
        field = await _field(client, auth_headers, board)
        resp = await client.patch(
            f"{board['fields']}/{field['id']}",
            json={"field_type": "SELECT", "options": CHOICES},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["options"] == CHOICES

    async def test_type_change_with_values_blocked(self, client, auth_headers, board):
        field = await _field(client, auth_headers, board)
        await _publish(client, auth_headers, board, **{field["field_key"]: "값"})
        resp = await client.patch(
            f"{board['fields']}/{field['id']}",
            json={"field_type": "NUMBER"},
            headers=auth_headers,
        )
        assert resp.status_code == 409
        assert resp.json()["error"]["field"] == "field_type"

    async def test_trashed_post_counts_as_value(self, client, auth_headers, board):
        field = await _field(client, auth_headers, board)
        post = await _publish(client, auth_headers, board, **{field["field_key"]: "값"})
        await client.delete(f"{board['posts']}/{post['id']}", headers=auth_headers)
        resp = await client.patch(
            f"{board['fields']}/{field['id']}",
            json={"field_type": "NUMBER"},
            headers=auth_headers,
        )
        assert resp.status_code == 409

    async def test_value_in_other_board_ignored(self, client, auth_headers, board):
        """다른 게시판의 같은 칸 이름은 상관없다."""
        field = await _field(client, auth_headers, board)
        second = (
            await client.post(BOARDS, json={"name": "둘째"}, headers=auth_headers)
        ).json()["data"]
        second["fields"] = f"{BOARDS}/{second['id']}/fields"
        second["posts"] = f"{BOARDS}/{second['id']}/posts"
        other = await _field(client, auth_headers, second)
        assert other["field_key"] == field["field_key"]
        await _publish(client, auth_headers, second, **{other["field_key"]: "값"})
        resp = await client.patch(
            f"{board['fields']}/{field['id']}",
            json={"field_type": "NUMBER"},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text

    @pytest.mark.parametrize(
        ("field_type", "value"), [("SELECT", "a"), ("MULTI_SELECT", ["a"])]
    )
    async def test_used_option_cannot_be_removed(
        self, client, auth_headers, board, field_type, value
    ):
        field = await _field(
            client, auth_headers, board, field_type=field_type, options=CHOICES
        )
        await _publish(client, auth_headers, board, **{field["field_key"]: value})
        url = f"{board['fields']}/{field['id']}"

        removed = await client.patch(
            url, json={"options": [CHOICES[1]]}, headers=auth_headers
        )
        assert removed.status_code == 409

        unused = await client.patch(
            url, json={"options": [CHOICES[0]]}, headers=auth_headers
        )
        assert unused.status_code == 200, unused.text

        renamed = await client.patch(
            url,
            json={"options": [{"value": "a", "label": "새 이름"}]},
            headers=auth_headers,
        )
        assert renamed.status_code == 200, renamed.text

    async def test_delete_keeps_values_and_restore(self, client, auth_headers, board):
        field = await _field(client, auth_headers, board)
        key = field["field_key"]
        post = await _publish(client, auth_headers, board, **{key: "값"})
        url = f"{board['fields']}/{field['id']}"
        post_url = f"{board['posts']}/{post['id']}"

        assert (await client.delete(url, headers=auth_headers)).status_code == 200
        listed = (await client.get(board["fields"], headers=auth_headers)).json()[
            "data"
        ]
        assert listed == []
        trash = await client.get(
            board["fields"], params={"trash": True}, headers=auth_headers
        )
        assert [f["id"] for f in trash.json()["data"]] == [field["id"]]

        # 삭제한 칸은 새 값을 받지 않고, 글을 고쳐도 값이 지워지지 않는다
        rejected = await client.patch(
            post_url, json={"custom_data": {key: "새 값"}}, headers=auth_headers
        )
        assert rejected.status_code == 400
        edited = await client.patch(
            post_url, json={"title": "고침"}, headers=auth_headers
        )
        assert edited.json()["data"]["custom_data"] == {key: "값"}

        assert (
            await client.patch(url, json={"label": "x"}, headers=auth_headers)
        ).status_code == 404
        restored = await client.post(f"{url}/restore", headers=auth_headers)
        assert restored.status_code == 200, restored.text
        assert restored.json()["data"]["deleted_at"] is None
        got = await client.get(post_url, headers=auth_headers)
        assert got.json()["data"]["custom_data"] == {key: "값"}

    async def test_deleted_required_field_not_checked(
        self, client, auth_headers, board
    ):
        field = await _field(client, auth_headers, board, is_required=True)
        await client.delete(f"{board['fields']}/{field['id']}", headers=auth_headers)
        resp = await _post(client, auth_headers, board, status="PUBLISHED")
        assert resp.status_code == 201, resp.text


class TestValueCount:
    async def test_counts_posts_with_values(self, client, auth_headers, board):
        used = await _field(client, auth_headers, board, label="쓰는 칸")
        await _field(client, auth_headers, board, label="빈 칸")
        await _publish(client, auth_headers, board, **{used["field_key"]: "값"})
        gone = await _publish(client, auth_headers, board, **{used["field_key"]: "값"})
        await client.delete(f"{board['posts']}/{gone['id']}", headers=auth_headers)

        data = (await client.get(board["fields"], headers=auth_headers)).json()["data"]

        assert {f["label"]: f["value_count"] for f in data} == {
            "쓰는 칸": 2,
            "빈 칸": 0,
        }

    async def test_no_posts(self, client, auth_headers, board):
        await _field(client, auth_headers, board)
        data = (await client.get(board["fields"], headers=auth_headers)).json()["data"]
        assert data[0]["value_count"] == 0


class TestPublicFields:
    def _url(self, tenant: dict, board: dict, post_id: str = "") -> str:
        base = f"/api/public/site/{tenant['slug']}/boards/{board['slug']}/posts"
        return f"{base}/{post_id}" if post_id else base

    async def test_detail_shows_values_in_order_with_labels(
        self, client, auth_headers, tenant, board
    ):
        rating = await _field(
            client, auth_headers, board, label="별점", field_type="RATING"
        )
        kind = await _field(
            client,
            auth_headers,
            board,
            label="과목",
            field_type="SELECT",
            options=CHOICES,
        )
        tags = await _field(
            client,
            auth_headers,
            board,
            label="태그",
            field_type="MULTI_SELECT",
            options=CHOICES,
        )
        post = await _publish(
            client,
            auth_headers,
            board,
            **{
                rating["field_key"]: 5,
                kind["field_key"]: "a",
                tags["field_key"]: ["a", "b"],
            },
        )

        data = (await client.get(self._url(tenant, board, post["id"]))).json()["data"]

        assert [(f["label"], f["field_type"], f["value"]) for f in data["fields"]] == [
            ("별점", "RATING", 5),
            ("과목", "SELECT", "가"),
            ("태그", "MULTI_SELECT", ["가", "나"]),
        ]
        assert "custom_data" not in data

    async def test_hidden_deleted_and_empty_excluded(
        self, client, auth_headers, tenant, board
    ):
        shown = await _field(client, auth_headers, board, label="보임")
        hidden = await _field(client, auth_headers, board, is_visible=False)
        gone = await _field(client, auth_headers, board)
        await _field(client, auth_headers, board, label="빈 칸")
        post = await _publish(
            client,
            auth_headers,
            board,
            **{
                shown["field_key"]: "공개 값",
                hidden["field_key"]: "내부 메모",
                gone["field_key"]: "지운 칸 값",
            },
        )
        await client.delete(f"{board['fields']}/{gone['id']}", headers=auth_headers)

        resp = await client.get(self._url(tenant, board, post["id"]))

        assert [f["label"] for f in resp.json()["data"]["fields"]] == ["보임"]
        assert "내부 메모" not in resp.text
        assert "지운 칸 값" not in resp.text

    async def test_false_is_shown(self, client, auth_headers, tenant, board):
        field = await _field(client, auth_headers, board, field_type="BOOLEAN")
        post = await _publish(
            client, auth_headers, board, **{field["field_key"]: False}
        )
        data = (await client.get(self._url(tenant, board, post["id"]))).json()["data"]
        assert data["fields"][0]["value"] is False

    async def test_list_has_no_values(self, client, auth_headers, tenant, board):
        field = await _field(client, auth_headers, board)
        await _publish(
            client, auth_headers, board, **{field["field_key"]: "목록에 없음"}
        )
        resp = await client.get(self._url(tenant, board))
        assert resp.status_code == 200
        assert "목록에 없음" not in resp.text

    async def test_no_fields(self, client, auth_headers, tenant, board):
        post = await _publish(client, auth_headers, board)
        data = (await client.get(self._url(tenant, board, post["id"]))).json()["data"]
        assert data["fields"] == []


class TestDuplicate:
    async def test_copies_fields_not_values(self, client, auth_headers, board):
        field = await _field(
            client,
            auth_headers,
            board,
            label="선택",
            field_type="SELECT",
            options=CHOICES,
            is_required=True,
        )
        gone = await _field(client, auth_headers, board, label="지운 칸")
        await client.delete(f"{board['fields']}/{gone['id']}", headers=auth_headers)

        copy = await client.post(
            f"{BOARDS}/{board['id']}/duplicate", headers=auth_headers
        )
        assert copy.status_code == 201, copy.text
        copied = (
            await client.get(
                f"{BOARDS}/{copy.json()['data']['id']}/fields", headers=auth_headers
            )
        ).json()["data"]

        assert len(copied) == 1
        assert copied[0]["id"] != field["id"]
        assert copied[0]["field_key"] == field["field_key"]
        assert copied[0]["options"] == CHOICES
        assert copied[0]["is_required"] is True


class TestAudit:
    async def _actions(self, tenant_id: str) -> list:
        return await _sql(
            "SELECT action, after_value, before_value FROM audit_logs"
            " WHERE tenant_id = :t AND target_type = 'board_field'"
            " ORDER BY created_at",
            t=tenant_id,
        )

    async def test_field_changes_logged_no_values(
        self, client, auth_headers, tenant, board
    ):
        field = await _field(client, auth_headers, board, label="이름")
        url = f"{board['fields']}/{field['id']}"
        await _publish(client, auth_headers, board, **{field["field_key"]: "비밀 값"})
        await client.patch(url, json={"label": "새 이름"}, headers=auth_headers)
        await client.delete(url, headers=auth_headers)
        await client.post(f"{url}/restore", headers=auth_headers)

        logs = await self._actions(tenant["id"])

        assert [row[0] for row in logs] == [
            "BOARD_FIELD_CREATED",
            "BOARD_FIELD_UPDATED",
            "BOARD_FIELD_DELETED",
            "BOARD_FIELD_RESTORED",
        ]
        assert logs[1][2]["label"] == "이름"
        assert logs[1][1]["label"] == "새 이름"
        assert "비밀 값" not in str(logs)

    async def test_failed_change_not_logged(self, client, auth_headers, tenant, board):
        await client.post(
            board["fields"],
            json={"label": "칸", "field_type": "SELECT"},
            headers=auth_headers,
        )
        assert await self._actions(tenant["id"]) == []
