"""게시판 카테고리 (T-149, 게시판 모듈 기획서 BM-09)."""

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text

from app.core.security import create_access_token
from app.db.session import set_rls_context
from app.services import feature as feature_service
from app.services import site_cache
from tests.conftest import _TestSession  # type: ignore
from tests.test_rls_enforcement import _app_session  # type: ignore

BOARDS = "/api/v1/boards"


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


async def _board(client, headers, name: str, slug: str) -> dict:
    resp = await client.post(BOARDS, json={"name": name, "slug": slug}, headers=headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    data["categories"] = f"{BOARDS}/{data['id']}/categories"
    data["posts"] = f"{BOARDS}/{data['id']}/posts"
    return data


@pytest.fixture
async def board(client, auth_headers, tenant) -> dict:
    return await _board(client, auth_headers, "채용", "jobs")


async def _category(client, headers, board: dict, name: str, **extra) -> dict:
    resp = await client.post(
        board["categories"], json={"name": name, **extra}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _post(client, headers, board: dict, **payload) -> dict:
    body = {"title": "글", "status": "PUBLISHED", **payload}
    resp = await client.post(board["posts"], json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _list(client, headers, board: dict) -> list[dict]:
    resp = await client.get(board["categories"], headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


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


class TestCategories:
    async def test_create_list_in_order(self, client, auth_headers, board, purged):
        await _category(client, auth_headers, board, "개발")
        await _category(client, auth_headers, board, "  디자인  ")
        data = await _list(client, auth_headers, board)
        assert [(c["name"], c["display_order"]) for c in data] == [
            ("개발", 0),
            ("디자인", 1),
        ]
        assert all(c["is_active"] and c["post_count"] == 0 for c in data)
        assert purged

    async def test_duplicate_name_409(self, client, auth_headers, board):
        await _category(client, auth_headers, board, "개발")
        resp = await client.post(
            board["categories"], json={"name": "개발"}, headers=auth_headers
        )
        assert resp.status_code == 409

    async def test_same_name_in_other_board(self, client, auth_headers, board):
        await _category(client, auth_headers, board, "개발")
        second = await _board(client, auth_headers, "후기", "reviews")
        await _category(client, auth_headers, second, "개발")

    async def test_deleted_name_can_be_reused(self, client, auth_headers, board):
        category = await _category(client, auth_headers, board, "개발")
        url = f"{board['categories']}/{category['id']}"
        assert (await client.delete(url, headers=auth_headers)).status_code == 200
        await _category(client, auth_headers, board, "개발")

    @pytest.mark.parametrize(
        "payload",
        [{"name": ""}, {"name": "   "}, {"name": "가" * 31}, {"name": "a", "x": 1}],
    )
    async def test_invalid_400(self, client, auth_headers, board, payload):
        resp = await client.post(
            board["categories"], json=payload, headers=auth_headers
        )
        assert resp.status_code == 400, resp.text

    async def test_update_name_and_hide(self, client, auth_headers, board):
        category = await _category(client, auth_headers, board, "개발")
        await _category(client, auth_headers, board, "디자인")
        url = f"{board['categories']}/{category['id']}"
        resp = await client.patch(
            url, json={"name": "개발 직군", "is_active": False}, headers=auth_headers
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["name"] == "개발 직군"
        assert resp.json()["data"]["is_active"] is False
        clash = await client.patch(url, json={"name": "디자인"}, headers=auth_headers)
        assert clash.status_code == 409
        same = await client.patch(url, json={"name": "개발 직군"}, headers=auth_headers)
        assert same.status_code == 200

    async def test_reorder(self, client, auth_headers, board):
        a = await _category(client, auth_headers, board, "가")
        b = await _category(client, auth_headers, board, "나")
        resp = await client.patch(
            f"{board['categories']}/order",
            json={"category_ids": [b["id"], a["id"]]},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert [c["name"] for c in resp.json()["data"]] == ["나", "가"]
        partial = await client.patch(
            f"{board['categories']}/order",
            json={"category_ids": [a["id"]]},
            headers=auth_headers,
        )
        assert partial.status_code == 400

    async def test_limit(self, client, auth_headers, board, monkeypatch):
        from app.services import board_category

        monkeypatch.setattr(board_category, "MAX_CATEGORIES", 2)
        await _category(client, auth_headers, board, "가")
        await _category(client, auth_headers, board, "나")
        resp = await client.post(
            board["categories"], json={"name": "다"}, headers=auth_headers
        )
        assert resp.status_code == 409

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
            f"{BOARDS}/{board_id}/categories",
            json={"name": "가"},
            headers=auth_headers,
        )
        assert resp.status_code == 409

    async def test_audit_logged(self, client, auth_headers, tenant, board):
        await _category(client, auth_headers, board, "개발")
        rows = await _sql(
            "SELECT action FROM audit_logs WHERE tenant_id = :t"
            " AND target_type = 'board_category'",
            t=tenant["id"],
        )
        assert [r[0] for r in rows or []] == ["BOARD_CATEGORY_CREATED"]


class TestDelete:
    async def test_moves_posts_including_trash(self, client, auth_headers, board):
        source = await _category(client, auth_headers, board, "가")
        target = await _category(client, auth_headers, board, "나")
        kept = await _post(client, auth_headers, board, category_id=source["id"])
        trashed = await _post(client, auth_headers, board, category_id=source["id"])
        await client.delete(f"{board['posts']}/{trashed['id']}", headers=auth_headers)

        counts = {
            c["name"]: c["post_count"] for c in await _list(client, auth_headers, board)
        }
        assert counts == {"가": 1, "나": 0}

        resp = await client.delete(
            f"{board['categories']}/{source['id']}",
            params={"move_to": target["id"]},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["moved"] == 2
        assert [c["name"] for c in await _list(client, auth_headers, board)] == ["나"]
        for post in (kept, trashed):
            got = await client.get(
                f"{board['posts']}/{post['id']}", headers=auth_headers
            )
            assert got.json()["data"]["category_id"] == target["id"]

    async def test_without_target_clears(self, client, auth_headers, board):
        source = await _category(client, auth_headers, board, "가")
        post = await _post(client, auth_headers, board, category_id=source["id"])
        resp = await client.delete(
            f"{board['categories']}/{source['id']}", headers=auth_headers
        )
        assert resp.status_code == 200
        got = await client.get(f"{board['posts']}/{post['id']}", headers=auth_headers)
        assert got.json()["data"]["category_id"] is None

    async def test_bad_target_changes_nothing(self, client, auth_headers, board):
        source = await _category(client, auth_headers, board, "가")
        other = await _board(client, auth_headers, "후기", "reviews")
        foreign = await _category(client, auth_headers, other, "남의 것")
        post = await _post(client, auth_headers, board, category_id=source["id"])
        url = f"{board['categories']}/{source['id']}"
        for move_to in (source["id"], foreign["id"]):
            resp = await client.delete(
                url, params={"move_to": move_to}, headers=auth_headers
            )
            assert resp.status_code == 400
        got = await client.get(f"{board['posts']}/{post['id']}", headers=auth_headers)
        assert got.json()["data"]["category_id"] == source["id"]
        assert len(await _list(client, auth_headers, board)) == 1

    async def test_deleted_category_404(self, client, auth_headers, board):
        category = await _category(client, auth_headers, board, "가")
        url = f"{board['categories']}/{category['id']}"
        await client.delete(url, headers=auth_headers)
        assert (await client.delete(url, headers=auth_headers)).status_code == 404
        resp = await client.patch(url, json={"name": "x"}, headers=auth_headers)
        assert resp.status_code == 404


class TestPostCategory:
    async def test_set_change_and_clear(self, client, auth_headers, board):
        a = await _category(client, auth_headers, board, "가")
        b = await _category(client, auth_headers, board, "나")
        post = await _post(client, auth_headers, board, category_id=a["id"])
        assert post["category_id"] == a["id"]
        url = f"{board['posts']}/{post['id']}"

        title_only = await client.patch(url, json={"title": "새"}, headers=auth_headers)
        assert title_only.json()["data"]["category_id"] == a["id"]
        moved = await client.patch(
            url, json={"category_id": b["id"]}, headers=auth_headers
        )
        assert moved.json()["data"]["category_id"] == b["id"]
        cleared = await client.patch(
            url, json={"category_id": None}, headers=auth_headers
        )
        assert cleared.json()["data"]["category_id"] is None

    async def test_other_board_or_deleted_rejected(self, client, auth_headers, board):
        other = await _board(client, auth_headers, "후기", "reviews")
        foreign = await _category(client, auth_headers, other, "남의 것")
        resp = await client.post(
            board["posts"],
            json={"title": "글", "category_id": foreign["id"]},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        gone = await _category(client, auth_headers, board, "가")
        await client.delete(f"{board['categories']}/{gone['id']}", headers=auth_headers)
        resp = await client.post(
            board["posts"],
            json={"title": "글", "category_id": gone["id"]},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_admin_list_filter(self, client, auth_headers, board):
        a = await _category(client, auth_headers, board, "가")
        await _post(client, auth_headers, board, title="분류", category_id=a["id"])
        await _post(client, auth_headers, board, title="없음")
        resp = await client.get(
            board["posts"], params={"category_id": a["id"]}, headers=auth_headers
        )
        data = resp.json()["data"]
        assert data["total"] == 1
        assert data["items"][0]["title"] == "분류"
        assert data["items"][0]["category_id"] == a["id"]

    async def test_duplicate_board_copies_categories(self, client, auth_headers, board):
        await _category(client, auth_headers, board, "가")
        await _category(client, auth_headers, board, "나", is_active=False)
        resp = await client.post(
            f"{BOARDS}/{board['id']}/duplicate", headers=auth_headers
        )
        assert resp.status_code == 201
        copy = resp.json()["data"]
        copied = await client.get(
            f"{BOARDS}/{copy['id']}/categories", headers=auth_headers
        )
        assert [(c["name"], c["is_active"]) for c in copied.json()["data"]] == [
            ("가", True),
            ("나", False),
        ]


class TestPublic:
    async def test_site_lists_active_categories(
        self, client, auth_headers, tenant, board
    ):
        await _category(client, auth_headers, board, "가")
        await _category(client, auth_headers, board, "숨김", is_active=False)
        resp = await client.get(f"/api/public/site/{tenant['slug']}")
        boards = resp.json()["data"]["boards"]
        found = next(b for b in boards if b["slug"] == board["slug"])
        assert [c["name"] for c in found["categories"]] == ["가"]

    async def test_list_filter_by_category(self, client, auth_headers, tenant, board):
        a = await _category(client, auth_headers, board, "가")
        await _post(client, auth_headers, board, title="분류", category_id=a["id"])
        await _post(client, auth_headers, board, title="없음")
        url = f"/api/public/site/{tenant['slug']}/boards/{board['slug']}/posts"
        everything = (await client.get(url)).json()["data"]
        assert everything["total"] == 2
        filtered = (await client.get(url, params={"category": a["id"]})).json()["data"]
        assert filtered["total"] == 1
        assert filtered["items"][0]["category_id"] == a["id"]
        assert filtered["has_posts"] is True
        unknown = (await client.get(url, params={"category": str(uuid.uuid4())})).json()
        assert unknown["data"]["total"] == 0
        assert (await client.get(url, params={"category": "x"})).status_code in (
            400,
            422,
        )


class TestSecurity:
    async def test_requires_login(self, client, board):
        assert (await client.get(board["categories"])).status_code == 401

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
        assert (
            await client.get(board["categories"], headers=headers)
        ).status_code == 200
        resp = await client.post(
            board["categories"], json={"name": "가"}, headers=headers
        )
        assert resp.status_code == 403

    async def test_other_tenant_404(self, client, auth_headers, other_headers, board):
        category = await _category(client, auth_headers, board, "가")
        url = f"{board['categories']}/{category['id']}"
        assert (
            await client.get(board["categories"], headers=other_headers)
        ).status_code == 404
        assert (
            await client.patch(url, json={"name": "x"}, headers=other_headers)
        ).status_code == 404
        assert (await client.delete(url, headers=other_headers)).status_code == 404

    async def test_category_of_other_board_404(self, client, auth_headers, board):
        category = await _category(client, auth_headers, board, "가")
        second = await _board(client, auth_headers, "후기", "reviews")
        resp = await client.patch(
            f"{second['categories']}/{category['id']}",
            json={"name": "x"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_rls_only_own_rows(self, client, auth_headers, tenant, board):
        await _category(client, auth_headers, board, "가")
        count = text("SELECT count(*) FROM board_categories WHERE board_id = :b")
        async with _app_session() as db:
            await set_rls_context(db, uuid.UUID(tenant["id"]))
            own = (await db.execute(count, {"b": board["id"]})).scalar_one()
        async with _app_session() as db:
            await set_rls_context(db, uuid.uuid4())
            others = (await db.execute(count, {"b": board["id"]})).scalar_one()
        assert (own, others) == (1, 0)


@pytest.fixture
async def merge_set(client, auth_headers, board):
    a = await _category(client, auth_headers, board, "원본 가")
    b = await _category(client, auth_headers, board, "원본 나")
    target = await _category(client, auth_headers, board, "통합", is_active=False)
    return a, b, target


class TestBulkMerge:
    async def test_moves_trash_and_records_one_audit(
        self, client, auth_headers, board, merge_set, purged
    ):
        a, b, target = merge_set
        first = await _post(
            client, auth_headers, board, category_id=a["id"], is_pinned=True
        )
        second = await _post(
            client, auth_headers, board, category_id=b["id"], status="PRIVATE"
        )
        await client.delete(f"{board['posts']}/{second['id']}", headers=auth_headers)
        untouched = await _post(client, auth_headers, board)
        purged.clear()
        resp = await client.post(
            f"{board['categories']}/merge",
            json={"source_ids": [a["id"], b["id"]], "target_id": target["id"]},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"] == {"merged": 2, "moved": 2}
        rows = await _sql(
            "SELECT id::text, category_id::text, status, deleted_at IS NOT NULL, is_pinned FROM board_posts WHERE board_id=:b",
            b=board["id"],
        )
        by_id = {row[0]: row[1:] for row in rows}
        assert by_id[first["id"]] == (target["id"], "PUBLISHED", False, True)
        assert by_id[second["id"]] == (target["id"], "PRIVATE", True, False)
        assert by_id[untouched["id"]][0] is None
        remaining = await _list(client, auth_headers, board)
        assert [c["id"] for c in remaining] == [target["id"]]
        assert remaining[0]["is_active"] is False
        logs = await _sql(
            "SELECT before_value, after_value, ip_address FROM audit_logs WHERE action='BOARD_CATEGORIES_MERGED' AND target_id=:i",
            i=target["id"],
        )
        assert len(logs) == 1
        assert logs[0][0] == {"source_ids": [a["id"], b["id"]]}
        assert logs[0][1]["moved_posts"] == 2
        assert logs[0][2] is None
        assert len(purged) == 1

    @pytest.mark.parametrize("invalid", ["source", "target", "deleted", "foreign"])
    async def test_invalid_part_is_atomic(
        self, client, auth_headers, board, merge_set, invalid
    ):
        a, b, target = merge_set
        post = await _post(client, auth_headers, board, category_id=a["id"])
        sources, target_id = [a["id"], b["id"]], target["id"]
        if invalid == "source":
            sources[1] = str(uuid.uuid4())
        elif invalid == "target":
            target_id = str(uuid.uuid4())
        elif invalid == "deleted":
            gone = await _category(client, auth_headers, board, "삭제됨")
            await client.delete(
                f"{board['categories']}/{gone['id']}", headers=auth_headers
            )
            sources[1] = gone["id"]
        else:
            foreign_board = await _board(
                client, auth_headers, "다른 게시판", "elsewhere"
            )
            sources[1] = (await _category(client, auth_headers, foreign_board, "외부"))[
                "id"
            ]
        resp = await client.post(
            f"{board['categories']}/merge",
            json={"source_ids": sources, "target_id": target_id},
            headers=auth_headers,
        )
        assert resp.status_code == 400, resp.text
        assert {c["id"] for c in await _list(client, auth_headers, board)} == {
            a["id"],
            b["id"],
            target["id"],
        }
        assert (
            await _sql(
                "SELECT category_id::text FROM board_posts WHERE id=:i", i=post["id"]
            )
        )[0][0] == a["id"]
        assert not await _sql(
            "SELECT id FROM audit_logs WHERE action='BOARD_CATEGORIES_MERGED' AND target_id=:i",
            i=target["id"],
        )

    @pytest.mark.parametrize(
        "invalid", ["empty", "single", "duplicate", "self", "too_many", "bad_uuid"]
    )
    async def test_bad_payload(self, client, auth_headers, board, merge_set, invalid):
        a, b, target = merge_set
        sources = [a["id"], b["id"]]
        if invalid == "empty":
            sources = []
        if invalid == "single":
            sources = [a["id"]]
        if invalid == "duplicate":
            sources = [a["id"], a["id"]]
        if invalid == "self":
            sources = [a["id"], target["id"]]
        if invalid == "too_many":
            sources = [str(uuid.uuid4()) for _ in range(30)]
        if invalid == "bad_uuid":
            sources = [a["id"], "bad"]
        resp = await client.post(
            f"{board['categories']}/merge",
            json={"source_ids": sources, "target_id": target["id"]},
            headers=auth_headers,
        )
        assert resp.status_code == 400, resp.text
        assert len(await _list(client, auth_headers, board)) == 3

    async def test_access_restrictions(
        self, client, auth_headers, board, merge_set, other_headers, test_user, tenant
    ):
        a, b, target = merge_set
        url = f"{board['categories']}/merge"
        payload = {"source_ids": [a["id"], b["id"]], "target_id": target["id"]}
        assert (await client.post(url, json=payload)).status_code == 401
        assert (
            await client.post(url, json=payload, headers=other_headers)
        ).status_code == 404
        await _sql(
            "UPDATE users SET role='TENANT_VIEWER' WHERE id=:i", i=test_user["id"]
        )
        token = create_access_token(
            user_id=uuid.UUID(test_user["id"]),
            tenant_id=uuid.UUID(tenant["id"]),
            role="TENANT_VIEWER",
        )
        assert (
            await client.post(
                url, json=payload, headers={"Authorization": f"Bearer {token}"}
            )
        ).status_code == 403

    async def test_failure_before_commit_rolls_back(
        self, client, auth_headers, board, merge_set, monkeypatch
    ):
        from app.services import board_category

        a, b, target = merge_set
        post = await _post(client, auth_headers, board, category_id=a["id"])

        async def fail_commit(*args, **kwargs):
            raise RuntimeError("audit/commit failed")

        monkeypatch.setattr(board_category, "log_action", fail_commit)
        with pytest.raises(RuntimeError, match="audit/commit failed"):
            await client.post(
                f"{board['categories']}/merge",
                json={"source_ids": [a["id"], b["id"]], "target_id": target["id"]},
                headers=auth_headers,
            )
        assert len(await _list(client, auth_headers, board)) == 3
        assert (
            await _sql(
                "SELECT category_id::text FROM board_posts WHERE id=:i", i=post["id"]
            )
        )[0][0] == a["id"]

    async def test_empty_sources_and_system_feature_protection(
        self, client, auth_headers, board, merge_set, monkeypatch
    ):
        a, b, target = merge_set
        payload = {"source_ids": [a["id"], b["id"]], "target_id": target["id"]}
        await _sql(
            "UPDATE boards SET system_key='test-system' WHERE id=:i", i=board["id"]
        )
        resp = await client.post(
            f"{board['categories']}/merge", json=payload, headers=auth_headers
        )
        assert resp.status_code == 409, resp.text
        await _sql("UPDATE boards SET system_key=NULL WHERE id=:i", i=board["id"])

        async def disabled(*args):
            return False

        with monkeypatch.context() as scoped:
            scoped.setattr(feature_service, "is_enabled", disabled)
            resp = await client.post(
                f"{board['categories']}/merge", json=payload, headers=auth_headers
            )
            assert resp.status_code == 403, resp.text
        assert len(await _list(client, auth_headers, board)) == 3
        resp = await client.post(
            f"{board['categories']}/merge", json=payload, headers=auth_headers
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"] == {"merged": 2, "moved": 0}
