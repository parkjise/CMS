"""휴지통 30일 자동 정리 · 영구 삭제 (T-196, 게시판 모듈 기획서 D-06)."""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.core.security import create_access_token
from app.services import feature as feature_service
from app.services import site_cache
from app.workers import scheduled as worker
from tests.conftest import _TestSession  # type: ignore

BOARDS = "/api/v1/boards"


async def _sql(sql: str, **params) -> list:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        rows = result.all() if result.returns_rows else []
        await s.commit()
        return rows


@pytest.fixture(autouse=True)
def no_purge(monkeypatch) -> None:
    async def fake_purge(_db, _tenant_id):
        return True

    monkeypatch.setattr(site_cache, "purge_site", fake_purge)


@pytest.fixture
async def tenant(test_tenant, test_user) -> AsyncIterator[dict]:
    await feature_service.invalidate_cache(test_tenant["id"])
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t", t=test_tenant["id"]
    )
    yield test_tenant
    await _sql("DELETE FROM audit_logs WHERE tenant_id = :t", t=test_tenant["id"])
    await feature_service.invalidate_cache(test_tenant["id"])


@pytest.fixture
async def board(client, auth_headers, tenant) -> dict:
    resp = await client.post(
        BOARDS, json={"name": "소식", "slug": "news"}, headers=auth_headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _post(client, headers, board, title="글") -> dict:
    resp = await client.post(
        f"{BOARDS}/{board['id']}/posts",
        json={"title": title, "body": [], "status": "PUBLISHED"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _age(table: str, row_id: str, days: int) -> None:
    await _sql(
        f"UPDATE {table} SET deleted_at = now() - make_interval(days => :d)"  # noqa: S608
        " WHERE id = :id",
        d=days,
        id=row_id,
    )


async def _exists(table: str, row_id: str) -> bool:
    rows = await _sql(f"SELECT 1 FROM {table} WHERE id = :id", id=row_id)  # noqa: S608
    return bool(rows)


@pytest.fixture
async def other_tenant() -> AsyncIterator[dict]:
    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    slug = f"other-{uuid.uuid4().hex[:8]}"
    await _sql(
        "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
        " updated_at) VALUES (:id, :n, :s, 'FREE', true, now(), now())",
        id=tenant_id,
        n=slug,
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
    yield {"headers": {"Authorization": f"Bearer {token}"}}
    await _sql("DELETE FROM users WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM tenants WHERE id = :t", t=tenant_id)


class TestAutoPurge:
    async def test_only_older_than_30_days(self, client, auth_headers, tenant, board):
        old = await _post(client, auth_headers, board, "오래된 글")
        recent = await _post(client, auth_headers, board, "최근 지운 글")
        alive = await _post(client, auth_headers, board, "사용 중인 글")
        await _sql(
            "INSERT INTO board_post_versions (tenant_id, post_id, title, body,"
            " custom_data, status, saved_at) VALUES (:t, :p, '예전', '[]', '{}',"
            " 'PUBLISHED', now())",
            t=tenant["id"],
            p=old["id"],
        )
        await _age("board_posts", old["id"], 31)
        await _age("board_posts", recent["id"], 29)

        result = await worker._purge_board_trash()

        assert result["posts"] >= 1
        assert not await _exists("board_posts", old["id"])
        assert await _exists("board_posts", recent["id"])
        assert await _exists("board_posts", alive["id"])
        versions = await _sql(
            "SELECT 1 FROM board_post_versions WHERE post_id = :p", p=old["id"]
        )
        assert versions == []
        logs = await _sql(
            "SELECT actor_role, after_value FROM audit_logs"
            " WHERE tenant_id = :t AND action = 'POST_PURGED'",
            t=tenant["id"],
        )
        assert [(role, value["title"]) for role, value in logs] == [
            ("SYSTEM", "오래된 글")
        ]

    async def test_old_board_goes_with_its_posts(
        self, client, auth_headers, tenant, board
    ):
        post = await _post(client, auth_headers, board)
        await client.delete(f"{BOARDS}/{board['id']}", headers=auth_headers)
        await _age("boards", board["id"], 31)

        await worker._purge_board_trash()

        assert not await _exists("boards", board["id"])
        assert not await _exists("board_posts", post["id"])
        logs = await _sql(
            "SELECT action FROM audit_logs"
            " WHERE tenant_id = :t AND action LIKE '%PURGED'",
            t=tenant["id"],
        )
        # 게시판째 지운 글은 따로 남기지 않는다
        assert [row[0] for row in logs] == ["BOARD_PURGED"]

    async def test_audit_screen_shows_system(self, client, auth_headers, tenant, board):
        post = await _post(client, auth_headers, board, "정리될 글")
        await _age("board_posts", post["id"], 40)
        await worker._purge_board_trash()

        resp = await client.get("/api/v1/audit-logs?kind=post", headers=auth_headers)
        entry = next(
            e for e in resp.json()["data"]["items"] if e["action"] == "POST_PURGED"
        )
        assert entry["actor"] == "자동 정리"
        assert entry["target_name"] == "정리될 글"


class TestManualPurge:
    async def test_post_only_from_trash(self, client, auth_headers, tenant, board):
        post = await _post(client, auth_headers, board)
        url = f"{BOARDS}/{board['id']}/posts/{post['id']}"

        alive = await client.delete(f"{url}/permanent", headers=auth_headers)
        assert alive.status_code == 409

        await client.delete(url, headers=auth_headers)
        resp = await client.delete(f"{url}/permanent", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        assert not await _exists("board_posts", post["id"])

    async def test_board_with_posts(self, client, auth_headers, tenant, board):
        post = await _post(client, auth_headers, board)
        url = f"{BOARDS}/{board['id']}"
        # 사용 중인 게시판은 휴지통에 없으므로 찾을 수 없다
        assert (
            await client.delete(f"{url}/permanent", headers=auth_headers)
        ).status_code == 404

        await client.delete(url, headers=auth_headers)
        resp = await client.delete(f"{url}/permanent", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        assert not await _exists("boards", board["id"])
        assert not await _exists("board_posts", post["id"])

    async def test_other_tenant_cannot(
        self, client, auth_headers, tenant, board, other_tenant
    ):
        post = await _post(client, auth_headers, board)
        await client.delete(
            f"{BOARDS}/{board['id']}/posts/{post['id']}", headers=auth_headers
        )
        resp = await client.delete(
            f"{BOARDS}/{board['id']}/posts/{post['id']}/permanent",
            headers=other_tenant["headers"],
        )
        assert resp.status_code == 404
        assert await _exists("board_posts", post["id"])


class TestTrashInfo:
    async def test_posts_show_purge_date_and_deleter(
        self, client, auth_headers, test_user, tenant, board
    ):
        single = await _post(client, auth_headers, board, "하나")
        bulk = await _post(client, auth_headers, board, "여럿")
        await client.delete(
            f"{BOARDS}/{board['id']}/posts/{single['id']}", headers=auth_headers
        )
        await client.post(
            "/api/v1/posts/bulk",
            json={"post_ids": [bulk["id"]], "action": "TRASH"},
            headers=auth_headers,
        )

        resp = await client.get(
            f"{BOARDS}/{board['id']}/posts?trash=true", headers=auth_headers
        )
        items = {p["title"]: p for p in resp.json()["data"]["items"]}
        for item in items.values():
            assert item["deleted_by"] == test_user["email"]
            deleted = datetime.fromisoformat(item["deleted_at"])
            assert datetime.fromisoformat(item["purge_at"]) - deleted == timedelta(
                days=30
            )
        assert set(items) == {"하나", "여럿"}

        alive = await client.get(f"{BOARDS}/{board['id']}/posts", headers=auth_headers)
        assert all(p["purge_at"] is None for p in alive.json()["data"]["items"])

    async def test_boards_show_purge_date_and_deleter(
        self, client, auth_headers, test_user, tenant, board
    ):
        await client.delete(f"{BOARDS}/{board['id']}", headers=auth_headers)
        resp = await client.get(f"{BOARDS}?trash=true", headers=auth_headers)
        (trashed,) = resp.json()["data"]
        assert trashed["deleted_by"] == test_user["email"]
        assert datetime.fromisoformat(trashed["purge_at"]) > datetime.now(UTC)


PURGE = "/api/v1/posts/purge"


class TestBulkPurge:
    """휴지통 글 여러 개 영구 삭제 (T-209)."""

    async def _trashed(self, client, headers, board, n: int) -> list[str]:
        ids = []
        for i in range(n):
            post = await _post(client, headers, board, title=f"지울 글 {i}")
            await client.delete(
                f"{BOARDS}/{board['id']}/posts/{post['id']}", headers=headers
            )
            ids.append(post["id"])
        return ids

    async def test_purges_all_and_logs(self, client, auth_headers, tenant, board):
        ids = await self._trashed(client, auth_headers, board, 2)
        resp = await client.post(PURGE, json={"post_ids": ids}, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["purged"] == 2
        for post_id in ids:
            assert not await _exists("board_posts", post_id)
        logs = await _sql(
            "SELECT after_value->>'title' FROM audit_logs"
            " WHERE tenant_id = :t AND action = 'POST_PURGED' ORDER BY 1",
            t=tenant["id"],
        )
        assert [row[0] for row in logs] == ["지울 글 0", "지울 글 1"]

    async def test_live_post_mixed_in_404_nothing_deleted(
        self, client, auth_headers, tenant, board
    ):
        ids = await self._trashed(client, auth_headers, board, 1)
        alive = await _post(client, auth_headers, board, title="살아 있는 글")
        resp = await client.post(
            PURGE, json={"post_ids": [*ids, alive["id"]]}, headers=auth_headers
        )
        assert resp.status_code == 404
        assert await _exists("board_posts", ids[0])
        assert await _exists("board_posts", alive["id"])

    async def test_other_tenant_404(
        self, client, auth_headers, tenant, board, other_tenant
    ):
        ids = await self._trashed(client, auth_headers, board, 1)
        resp = await client.post(
            PURGE, json={"post_ids": ids}, headers=other_tenant["headers"]
        )
        assert resp.status_code == 404
        assert await _exists("board_posts", ids[0])

    async def test_limits_400(self, client, auth_headers, tenant):
        for body in ({"post_ids": []}, {"post_ids": [str(uuid.uuid4())] * 101}):
            resp = await client.post(PURGE, json=body, headers=auth_headers)
            assert resp.status_code == 400

    async def test_viewer_403(self, client, auth_headers, tenant, board):
        ids = await self._trashed(client, auth_headers, board, 1)
        user_id = uuid.uuid4()
        await _sql(
            "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
            " created_at, updated_at)"
            " VALUES (:id, :t, :e, 'x', 'TENANT_VIEWER', true, now(), now())",
            id=str(user_id),
            t=tenant["id"],
            e=f"{user_id.hex[:8]}@example.com",
        )
        token = create_access_token(
            user_id=user_id, tenant_id=uuid.UUID(tenant["id"]), role="TENANT_VIEWER"
        )
        resp = await client.post(
            PURGE, json={"post_ids": ids}, headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 403
        assert await _exists("board_posts", ids[0])

    async def test_unauthenticated_401(self, client):
        resp = await client.post(PURGE, json={"post_ids": [str(uuid.uuid4())]})
        assert resp.status_code == 401
