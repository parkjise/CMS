"""전체 글 · 일괄 처리 · 사이트맵 · 감사 로그 (T-140-C, 기획서 BM-05 · 11.4)."""

import json
import uuid
from collections.abc import AsyncIterator
from datetime import datetime

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.core.security import create_access_token
from app.db.session import set_rls_context
from app.services import feature as feature_service
from app.services import site_cache
from tests.conftest import _TestSession  # type: ignore
from tests.test_rls_enforcement import _app_session  # type: ignore

BOARDS = "/api/v1/boards"
POSTS = "/api/v1/posts"
SECRET_BODY = "본문에만 있는 비밀 문장"


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
async def other() -> AsyncIterator[dict]:
    """다른 사업체 — 게시판 · 공개 글 하나."""
    tenant_id, user_id, board_id, post_id = (str(uuid.uuid4()) for _ in range(4))
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
    await _sql(
        "INSERT INTO boards (id, tenant_id, name, slug, board_type, status, settings)"
        " VALUES (:id, :t, '남의 게시판', 'theirs', 'LIST', 'ACTIVE', '{}')",
        id=board_id,
        t=tenant_id,
    )
    await _sql(
        "INSERT INTO board_posts (id, tenant_id, board_id, title, body, status,"
        " is_pinned, custom_data, published_at)"
        " VALUES (:id, :t, :b, '남의 글', '[]', 'PUBLISHED', false, '{}', now())",
        id=post_id,
        t=tenant_id,
        b=board_id,
    )
    token = create_access_token(
        user_id=uuid.UUID(user_id), tenant_id=uuid.UUID(tenant_id), role="TENANT_ADMIN"
    )
    yield {
        "id": tenant_id,
        "slug": slug,
        "post_id": post_id,
        "board_id": board_id,
        "headers": {"Authorization": f"Bearer {token}"},
    }
    await _sql("DELETE FROM audit_logs WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM board_posts WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM boards WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM users WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM tenants WHERE id = :t", t=tenant_id)


async def _board(client, headers, slug: str = "news", **fields) -> dict:
    resp = await client.post(
        BOARDS, json={"name": f"{slug} 게시판", "slug": slug, **fields}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _post(
    client, headers, board_id: str, title: str, status: str = "PUBLISHED", **fields
) -> dict:
    resp = await client.post(
        f"{BOARDS}/{board_id}/posts",
        json={
            "title": title,
            "status": status,
            "body": [{"type": "p", "text": SECRET_BODY}],
            **fields,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _bulk(client, headers, ids: list[str], action: str):
    return await client.post(
        f"{POSTS}/bulk", json={"post_ids": ids, "action": action}, headers=headers
    )


async def _status_of(post_id: str) -> tuple:
    rows = await _sql(
        "SELECT status, deleted_at IS NOT NULL, published_at IS NOT NULL"
        " FROM board_posts WHERE id = :i",
        i=post_id,
    )
    assert rows
    return tuple(rows[0])


async def _logs(tenant_id: str) -> list:
    return await _sql(
        "SELECT action, target_type, target_id, before_value, after_value, ip_address"
        " FROM audit_logs WHERE tenant_id = :t ORDER BY created_at",
        t=tenant_id,
    )


class TestOverview:
    async def test_lists_all_boards_newest_first(self, client, auth_headers, tenant):
        a = await _board(client, auth_headers, "news")
        b = await _board(client, auth_headers, "faq-box", board_type="FAQ")
        await _post(client, auth_headers, a["id"], "A")
        await _post(client, auth_headers, b["id"], "B")

        data = (await client.get(POSTS, headers=auth_headers)).json()["data"]

        assert data["total"] == 2
        assert [(p["title"], p["board_name"]) for p in data["items"]] == [
            ("B", "faq-box 게시판"),
            ("A", "news 게시판"),
        ]

    async def test_filters(self, client, auth_headers, tenant):
        a = await _board(client, auth_headers, "news")
        b = await _board(client, auth_headers, "other-box")
        await _post(client, auth_headers, a["id"], "가나다")
        await _post(client, auth_headers, a["id"], "임시", status="DRAFT")
        await _post(client, auth_headers, b["id"], "다른 곳")

        async def titles(**params) -> set[str]:
            resp = await client.get(POSTS, params=params, headers=auth_headers)
            assert resp.status_code == 200, resp.text
            return {p["title"] for p in resp.json()["data"]["items"]}

        assert await titles(board_id=b["id"]) == {"다른 곳"}
        assert await titles(status="DRAFT") == {"임시"}
        assert await titles(q="나다") == {"가나다"}
        # 검색 글자로 쓰이는 % · _ 는 글자 그대로
        assert await titles(q="%") == set()

    async def test_trash_filter(self, client, auth_headers, tenant):
        a = await _board(client, auth_headers, "news")
        kept = await _post(client, auth_headers, a["id"], "남음")
        gone = await _post(client, auth_headers, a["id"], "지움")
        await client.delete(
            f"{BOARDS}/{a['id']}/posts/{gone['id']}", headers=auth_headers
        )

        normal = (await client.get(POSTS, headers=auth_headers)).json()["data"]
        trash = (
            await client.get(POSTS, params={"trash": True}, headers=auth_headers)
        ).json()["data"]

        assert [p["id"] for p in normal["items"]] == [kept["id"]]
        assert [p["id"] for p in trash["items"]] == [gone["id"]]

    async def test_trashed_board_posts_hidden(self, client, auth_headers, tenant):
        a = await _board(client, auth_headers, "news")
        await _post(client, auth_headers, a["id"], "글")
        await client.delete(f"{BOARDS}/{a['id']}", headers=auth_headers)

        data = (await client.get(POSTS, headers=auth_headers)).json()["data"]

        assert data["total"] == 0

    async def test_other_tenant_not_listed(self, client, auth_headers, tenant, other):
        data = (await client.get(POSTS, headers=auth_headers)).json()["data"]
        assert other["post_id"] not in [p["id"] for p in data["items"]]

    async def test_requires_login(self, client):
        assert (await client.get(POSTS)).status_code == 401

    async def test_feature_off_403(self, client, auth_headers, tenant):
        await _sql(
            "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled)"
            " SELECT gen_random_uuid(), :t, id, false FROM features"
            " WHERE key = 'BOARD_MANAGER'",
            t=tenant["id"],
        )
        await feature_service.invalidate_cache(tenant["id"])
        assert (await client.get(POSTS, headers=auth_headers)).status_code == 403


class TestOverviewCategories:
    async def category(self, client, headers, board_id, name="행사", **extra):
        response = await client.post(
            f"{BOARDS}/{board_id}/categories",
            json={"name": name, **extra},
            headers=headers,
        )
        assert response.status_code == 201, response.text
        return response.json()["data"]["id"]

    async def test_category_with_search_status_and_pagination(
        self, client, auth_headers, tenant
    ):
        board = await _board(client, auth_headers)
        category = await self.category(client, auth_headers, board["id"])
        for title, status, cat in [
            ("소식 A", "DRAFT", category),
            ("소식 B", "DRAFT", category),
            ("다른 제목", "DRAFT", category),
            ("소식 공개", "PUBLISHED", category),
            ("소식 미분류", "DRAFT", None),
        ]:
            await _post(
                client, auth_headers, board["id"], title, status, category_id=cat
            )
        params = {
            "board_id": board["id"],
            "category_id": category,
            "q": "소식",
            "status": "DRAFT",
            "size": 1,
        }
        pages = []
        for page in (1, 2):
            response = await client.get(
                POSTS, params={**params, "page": page}, headers=auth_headers
            )
            assert response.status_code == 200, response.text
            data = response.json()["data"]
            assert data["total"] == 2
            assert len(data["items"]) == 1
            pages.append(data["items"][0]["title"])
        assert set(pages) == {"소식 A", "소식 B"}

    async def test_board_category_mismatch_returns_empty(
        self, client, auth_headers, tenant
    ):
        board = await _board(client, auth_headers)
        second = await _board(client, auth_headers, "second")
        category = await self.category(client, auth_headers, board["id"])
        await _post(client, auth_headers, board["id"], "글", category_id=category)
        for board_id, expected in [(second["id"], 0), (board["id"], 1)]:
            data = (
                await client.get(
                    POSTS,
                    params={"board_id": board_id, "category_id": category},
                    headers=auth_headers,
                )
            ).json()["data"]
            assert data["total"] == expected
        data = (
            await client.get(
                POSTS, params={"category_id": str(uuid.uuid4())}, headers=auth_headers
            )
        ).json()["data"]
        assert data["items"] == []
        assert data["total"] == 0

    async def test_hidden_category_and_trash(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers)
        category = await self.category(
            client, auth_headers, board["id"], is_active=False
        )
        kept = await _post(
            client, auth_headers, board["id"], "남음", category_id=category
        )
        gone = await _post(
            client, auth_headers, board["id"], "삭제", category_id=category
        )
        await client.delete(
            f"{BOARDS}/{board['id']}/posts/{gone['id']}", headers=auth_headers
        )
        for trash, expected in [(False, kept["id"]), (True, gone["id"])]:
            response = await client.get(
                POSTS,
                params={"category_id": category, "trash": trash},
                headers=auth_headers,
            )
            data = response.json()["data"]
            assert data["total"] == 1
            assert [post["id"] for post in data["items"]] == [expected]

    async def test_foreign_tenant_category_cannot_leak_posts(
        self, client, auth_headers, tenant, other
    ):
        category = await self.category(client, other["headers"], other["board_id"])
        await client.patch(
            f"{BOARDS}/{other['board_id']}/posts/{other['post_id']}",
            json={"category_id": category},
            headers=other["headers"],
        )
        response = await client.get(
            POSTS, params={"category_id": category}, headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["data"]["total"] == 0
        assert response.json()["data"]["items"] == []
        own = await client.get(
            POSTS, params={"category_id": category}, headers=other["headers"]
        )
        assert own.json()["data"]["total"] == 1

    async def test_malformed_category_is_rejected(self, client, auth_headers, tenant):
        response = await client.get(
            POSTS, params={"category_id": "not-a-uuid"}, headers=auth_headers
        )
        assert response.status_code in (400, 422)


class TestBulk:
    async def test_publish_private_trash_restore(self, client, auth_headers, tenant):
        a = await _board(client, auth_headers, "news")
        draft = await _post(client, auth_headers, a["id"], "임시", status="DRAFT")
        pid = draft["id"]

        resp = await _bulk(client, auth_headers, [pid], "PUBLISH")
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"] == {"updated": 1}
        assert await _status_of(pid) == ("PUBLISHED", False, True)

        await _bulk(client, auth_headers, [pid], "PRIVATE")
        assert (await _status_of(pid))[0] == "PRIVATE"

        await _bulk(client, auth_headers, [pid], "TRASH")
        assert (await _status_of(pid))[1] is True

        await _bulk(client, auth_headers, [pid], "RESTORE")
        assert (await _status_of(pid))[1] is False

    async def test_several_boards_at_once_purges_cache(
        self, client, auth_headers, tenant, purged
    ):
        a = await _board(client, auth_headers, "news")
        b = await _board(client, auth_headers, "other-box")
        one = await _post(client, auth_headers, a["id"], "1", status="DRAFT")
        two = await _post(client, auth_headers, b["id"], "2", status="DRAFT")
        purged.clear()

        resp = await _bulk(client, auth_headers, [one["id"], two["id"]], "PUBLISH")

        assert resp.json()["data"]["updated"] == 2
        assert purged == [tenant["id"]]

    async def test_other_tenant_post_cancels_everything(
        self, client, auth_headers, tenant, other
    ):
        a = await _board(client, auth_headers, "news")
        mine = await _post(client, auth_headers, a["id"], "내 글", status="DRAFT")

        resp = await _bulk(
            client, auth_headers, [mine["id"], other["post_id"]], "PUBLISH"
        )

        assert resp.status_code == 404
        assert (await _status_of(mine["id"]))[0] == "DRAFT"
        assert (await _status_of(other["post_id"]))[1] is False

    async def test_already_trashed_cancels_everything(
        self, client, auth_headers, tenant
    ):
        a = await _board(client, auth_headers, "news")
        ok = await _post(client, auth_headers, a["id"], "남음", status="DRAFT")
        gone = await _post(client, auth_headers, a["id"], "지움")
        await client.delete(
            f"{BOARDS}/{a['id']}/posts/{gone['id']}", headers=auth_headers
        )

        resp = await _bulk(client, auth_headers, [ok["id"], gone["id"]], "PUBLISH")

        assert resp.status_code == 404
        assert (await _status_of(ok["id"]))[0] == "DRAFT"

    async def test_restore_needs_trashed(self, client, auth_headers, tenant):
        a = await _board(client, auth_headers, "news")
        live = await _post(client, auth_headers, a["id"], "글")
        resp = await _bulk(client, auth_headers, [live["id"]], "RESTORE")
        assert resp.status_code == 404

    async def test_duplicates_count_once(self, client, auth_headers, tenant):
        a = await _board(client, auth_headers, "news")
        one = await _post(client, auth_headers, a["id"], "글", status="DRAFT")
        resp = await _bulk(client, auth_headers, [one["id"], one["id"]], "PUBLISH")
        assert resp.json()["data"]["updated"] == 1

    @pytest.mark.parametrize(
        ("count", "action"), [(0, "PUBLISH"), (101, "PUBLISH"), (1, "DESTROY")]
    )
    async def test_invalid_request(self, client, auth_headers, tenant, count, action):
        ids = [str(uuid.uuid4()) for _ in range(count)]
        resp = await _bulk(client, auth_headers, ids, action)
        assert resp.status_code in (400, 422)

    async def test_viewer_403(self, client, tenant, test_user):
        token = create_access_token(
            user_id=uuid.UUID(test_user["id"]),
            tenant_id=uuid.UUID(tenant["id"]),
            role="TENANT_VIEWER",
        )
        await _sql(
            "UPDATE users SET role = 'TENANT_VIEWER' WHERE id = :i", i=test_user["id"]
        )
        resp = await _bulk(
            client,
            {"Authorization": f"Bearer {token}"},
            [str(uuid.uuid4())],
            "PUBLISH",
        )
        assert resp.status_code == 403

    async def test_notice_publish_clears_samples_only_for_notice(
        self, client, auth_headers, tenant
    ):
        section_id = str(uuid.uuid4())
        await _sql(
            "INSERT INTO sections (id, tenant_id, section_type, label, display_order,"
            " page_key, is_active, created_at, updated_at)"
            " VALUES (:id, :t, 'BOARD', '공지', 0, 'notice', true, now(), now())",
            id=section_id,
            t=tenant["id"],
        )
        await _sql(
            "INSERT INTO section_settings (id, tenant_id, section_id, field_key,"
            " field_value, value_type, is_sample, created_at, updated_at)"
            " VALUES (gen_random_uuid(), :t, :s, 'items', :v, 'JSON', true, now(),"
            " now())",
            t=tenant["id"],
            s=section_id,
            v=json.dumps([{"id": "n1", "subject": "샘플"}]),
        )

        async def items() -> str:
            rows = await _sql(
                "SELECT field_value FROM section_settings"
                " WHERE section_id = :s AND field_key = 'items'",
                s=section_id,
            )
            assert rows
            return rows[0][0]

        boards = (await client.get(BOARDS, headers=auth_headers)).json()["data"]
        notice = next(b for b in boards if b["system_key"] == "notice")
        custom = await _board(client, auth_headers, "news")
        other_post = await _post(client, auth_headers, custom["id"], "글", "DRAFT")
        notice_post = await _post(client, auth_headers, notice["id"], "공지", "DRAFT")

        await _bulk(client, auth_headers, [other_post["id"]], "PUBLISH")
        assert await items() != "[]"

        await _bulk(client, auth_headers, [notice_post["id"]], "PUBLISH")
        assert await items() == "[]"

        await _sql("DELETE FROM section_settings WHERE section_id = :s", s=section_id)
        await _sql("DELETE FROM sections WHERE id = :s", s=section_id)


class TestSitemapPosts:
    async def _entries(self, client, slug: str) -> list[dict]:
        resp = await client.get(f"/api/public/site/{slug}/sitemap-posts")
        assert resp.status_code == 200, resp.text
        return resp.json()["data"]

    async def test_only_public_posts(self, client, auth_headers, tenant):
        a = await _board(client, auth_headers, "news")
        public = await _post(client, auth_headers, a["id"], "공개")
        await _post(client, auth_headers, a["id"], "임시", status="DRAFT")
        await _post(client, auth_headers, a["id"], "비공개", status="PRIVATE")
        gone = await _post(client, auth_headers, a["id"], "삭제")
        await client.delete(
            f"{BOARDS}/{a['id']}/posts/{gone['id']}", headers=auth_headers
        )

        entries = await self._entries(client, tenant["slug"])

        assert [e["id"] for e in entries] == [public["id"]]
        assert entries[0]["board_slug"] == "news"
        assert entries[0]["is_system"] is False
        assert entries[0]["updated_at"]

    async def test_inactive_and_trashed_boards_excluded(
        self, client, auth_headers, tenant
    ):
        off = await _board(client, auth_headers, "off-box")
        trashed = await _board(client, auth_headers, "gone-box")
        await _post(client, auth_headers, off["id"], "글")
        await _post(client, auth_headers, trashed["id"], "글")
        await client.patch(
            f"{BOARDS}/{off['id']}", json={"status": "INACTIVE"}, headers=auth_headers
        )
        await client.delete(f"{BOARDS}/{trashed['id']}", headers=auth_headers)

        assert await self._entries(client, tenant["slug"]) == []

    async def test_other_tenant_separated(self, client, auth_headers, tenant, other):
        a = await _board(client, auth_headers, "news")
        await _post(client, auth_headers, a["id"], "내 글")

        mine = await self._entries(client, tenant["slug"])
        theirs = await self._entries(client, other["slug"])

        assert other["post_id"] not in [e["id"] for e in mine]
        assert [e["id"] for e in theirs] == [other["post_id"]]

    async def test_unknown_tenant_404(self, client):
        resp = await client.get("/api/public/site/no-such-tenant/sitemap-posts")
        assert resp.status_code == 404

    async def test_private_post_detail_is_404(self, client, auth_headers, tenant):
        """D-09 — 비공개 글은 공개 주소에서 404 라 검색엔진에 노출되지 않는다."""
        a = await _board(client, auth_headers, "news")
        hidden = await _post(client, auth_headers, a["id"], "비공개", status="PRIVATE")
        resp = await client.get(
            f"/api/public/site/{tenant['slug']}/boards/news/posts/{hidden['id']}"
        )
        assert resp.status_code == 404


class TestAuditLog:
    async def test_board_lifecycle(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, "news")
        await client.patch(
            f"{BOARDS}/{board['id']}", json={"name": "새 이름"}, headers=auth_headers
        )
        copy = await client.post(
            f"{BOARDS}/{board['id']}/duplicate", headers=auth_headers
        )
        assert copy.status_code == 201, copy.text
        await client.delete(f"{BOARDS}/{board['id']}", headers=auth_headers)
        await client.post(f"{BOARDS}/{board['id']}/restore", headers=auth_headers)

        logs = await _logs(tenant["id"])

        assert [row[0] for row in logs] == [
            "BOARD_CREATED",
            "BOARD_UPDATED",
            "BOARD_DUPLICATED",
            "BOARD_DELETED",
            "BOARD_RESTORED",
        ]
        updated = logs[1]
        assert updated[3]["name"] == "news 게시판"
        assert updated[4]["name"] == "새 이름"

    async def test_post_trash_restore_and_bulk_no_body(
        self, client, auth_headers, tenant
    ):
        board = await _board(client, auth_headers, "news")
        post = await _post(client, auth_headers, board["id"], "글 제목")
        url = f"{BOARDS}/{board['id']}/posts/{post['id']}"
        await client.delete(url, headers=auth_headers)
        await client.post(f"{url}/restore", headers=auth_headers)
        await _bulk(client, auth_headers, [post["id"]], "PRIVATE")

        logs = await _logs(tenant["id"])

        assert [row[0] for row in logs] == [
            "BOARD_CREATED",
            "POST_DELETED",
            "POST_RESTORED",
            "POST_BULK_PRIVATE",
        ]
        assert logs[1][4]["title"] == "글 제목"
        assert logs[3][4] == {"post_ids": [post["id"]]}
        dumped = json.dumps([[str(c) for c in row] for row in logs], ensure_ascii=False)
        assert SECRET_BODY not in dumped
        assert all(row[5] is None for row in logs)

    async def test_ordinary_post_save_not_logged(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, "news")
        post = await _post(client, auth_headers, board["id"], "글")
        await client.patch(
            f"{BOARDS}/{board['id']}/posts/{post['id']}",
            json={"title": "수정"},
            headers=auth_headers,
        )
        assert [row[0] for row in await _logs(tenant["id"])] == ["BOARD_CREATED"]

    async def test_failed_bulk_not_logged(self, client, auth_headers, tenant):
        await _bulk(client, auth_headers, [str(uuid.uuid4())], "PUBLISH")
        assert await _logs(tenant["id"]) == []


class TestAuditRls:
    """앱 계정(cms_app) · RLS 가 실제로 적용된 상태."""

    @pytest.fixture
    async def two_logs(self, tenant, other) -> AsyncIterator[dict]:
        actor = str(uuid.uuid4())
        for tid, action in ((tenant["id"], "MINE"), (other["id"], "THEIRS")):
            await _sql(
                "INSERT INTO audit_logs (id, tenant_id, actor_id, actor_role, action,"
                " target_type) VALUES (gen_random_uuid(), :t, :a, 'TENANT_ADMIN', :x,"
                " 'board')",
                t=tid,
                a=actor,
                x=action,
            )
        await _sql(
            "INSERT INTO audit_logs (id, actor_id, actor_role, action, target_type)"
            " VALUES (gen_random_uuid(), :a, 'SUPER_ADMIN', 'GLOBAL', 'tenant')",
            a=actor,
        )
        yield {
            "tenant": uuid.UUID(tenant["id"]),
            "other": uuid.UUID(other["id"]),
            "actor": actor,
        }
        await _sql("DELETE FROM audit_logs WHERE actor_id = :a", a=actor)

    async def _visible(self, db, actor: str) -> set[str]:
        result = await db.execute(
            text("SELECT action FROM audit_logs WHERE actor_id = :a"), {"a": actor}
        )
        return {row[0] for row in result}

    async def test_tenant_sees_only_own(self, two_logs):
        async with _app_session() as db:
            await set_rls_context(db, two_logs["tenant"])
            assert await self._visible(db, two_logs["actor"]) == {"MINE"}

    async def test_no_context_sees_nothing(self, two_logs):
        async with _app_session() as db:
            assert await self._visible(db, two_logs["actor"]) == set()

    async def test_super_admin_sees_all(self, two_logs):
        async with _app_session() as db:
            await set_rls_context(db, uuid.uuid4(), is_super_admin=True)
            assert await self._visible(db, two_logs["actor"]) == {
                "MINE",
                "THEIRS",
                "GLOBAL",
            }

    async def test_tenant_cannot_write_for_other_tenant(self, two_logs):
        async with _app_session() as db:
            await set_rls_context(db, two_logs["tenant"])
            with pytest.raises(DBAPIError):
                await db.execute(
                    text(
                        "INSERT INTO audit_logs (id, tenant_id, actor_id, actor_role,"
                        " action, target_type) VALUES (gen_random_uuid(), :t, :a, 'X',"
                        " 'FORGED', 'board')"
                    ),
                    {"t": str(two_logs["other"]), "a": two_logs["actor"]},
                )

    async def test_no_context_can_write_global_log(self, two_logs):
        """2FA 등록처럼 로그인 전 요청의 기록 — 컨텍스트가 없어도 남는다."""
        async with _app_session() as db:
            await db.execute(
                text(
                    "INSERT INTO audit_logs (id, actor_id, actor_role, action,"
                    " target_type) VALUES (gen_random_uuid(), :a, 'X', 'PRELOGIN',"
                    " 'user')"
                ),
                {"a": two_logs["actor"]},
            )
            await db.commit()
        rows = await _sql(
            "SELECT count(*) FROM audit_logs"
            " WHERE actor_id = :a AND action = 'PRELOGIN'",
            a=two_logs["actor"],
        )
        assert rows[0][0] == 1

    async def test_tenant_cannot_change_or_delete(self, two_logs):
        async with _app_session() as db:
            await set_rls_context(db, two_logs["tenant"])
            await db.execute(
                text("UPDATE audit_logs SET action = 'X' WHERE actor_id = :a"),
                {"a": two_logs["actor"]},
            )
            await db.execute(
                text("DELETE FROM audit_logs WHERE actor_id = :a"),
                {"a": two_logs["actor"]},
            )
            await db.commit()
        rows = await _sql(
            "SELECT action FROM audit_logs WHERE actor_id = :a", a=two_logs["actor"]
        )
        assert {r[0] for r in rows} == {"MINE", "THEIRS", "GLOBAL"}


class TestSuperAdminHistory:
    async def test_tenant_history_includes_board_logs(
        self, client, auth_headers, tenant
    ):
        """슈퍼 어드민 사업체 이력에 게시판 기록도 나온다."""
        from app.services import super_tenant

        await _board(client, auth_headers, "news")
        async with _TestSession() as db:
            await db.execute(
                text("SELECT set_config('app.is_super_admin', 'true', false)")
            )
            logs, total = await super_tenant.list_audit_logs(
                db, uuid.UUID(tenant["id"])
            )
        assert total >= 1
        assert "BOARD_CREATED" in [log.action for log in logs]


async def _dated_posts(client, auth_headers):
    board = await _board(client, auth_headers)
    times = [
        "2026-11-06T14:59:59+00:00",
        "2026-11-06T15:00:00+00:00",
        "2026-11-07T14:59:59.999999+00:00",
        "2026-11-07T15:00:00+00:00",
    ]
    posts = []
    for index, created_at in enumerate(times):
        post = await _post(client, auth_headers, board["id"], f"행사 {index}")
        await _sql(
            "UPDATE board_posts SET created_at=CAST(:created AS timestamptz), "
            "published_at='2030-01-01T00:00:00Z' WHERE id=:i",
            created=datetime.fromisoformat(created_at),
            i=post["id"],
        )
        posts.append(post)
    return board, posts


class TestCreationDateFilter:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "params, expected",
        [
            ({"created_from": "2026-11-07T00:00:00+09:00"}, {1, 2, 3}),
            ({"created_before": "2026-11-08T00:00:00+09:00"}, {0, 1, 2}),
            (
                {
                    "created_from": "2026-11-07T00:00:00+09:00",
                    "created_before": "2026-11-08T00:00:00+09:00",
                },
                {1, 2},
            ),
        ],
    )
    async def test_creation_boundaries_not_publication(
        self, client, auth_headers, tenant, params, expected
    ):
        _board_row, posts = await _dated_posts(client, auth_headers)
        response = await client.get(POSTS, params=params, headers=auth_headers)
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["total"] == len(expected)
        assert {p["id"] for p in data["items"]} == {
            posts[index]["id"] for index in expected
        }

    @pytest.mark.asyncio
    async def test_filters_total_pagination_and_tenant(
        self, client, auth_headers, tenant, other
    ):
        board, posts = await _dated_posts(client, auth_headers)
        await _sql(
            "UPDATE board_posts SET created_at='2026-11-07T00:00:00Z' WHERE id=:i",
            i=other["post_id"],
        )
        params = {
            "created_from": "2026-11-06T15:00:00Z",
            "created_before": "2026-11-07T15:00:00Z",
            "board_id": board["id"],
            "status": "PUBLISHED",
            "q": "행사",
            "size": 1,
        }
        pages = []
        for page in [1, 2]:
            response = await client.get(
                POSTS, params={**params, "page": page}, headers=auth_headers
            )
            assert response.status_code == 200, response.text
            assert response.json()["data"]["total"] == 2
            pages.extend(response.json()["data"]["items"])
        assert {p["id"] for p in pages} == {posts[1]["id"], posts[2]["id"]}
        # 게시판 조건 없이도 타 사업체 글이 섞이지 않는다.
        response = await client.get(
            POSTS,
            params={
                "created_from": params["created_from"],
                "created_before": params["created_before"],
            },
            headers=auth_headers,
        )
        assert response.json()["data"]["total"] == 2
        assert other["post_id"] not in response.text

    @pytest.mark.asyncio
    async def test_trash_uses_original_creation(self, client, auth_headers, tenant):
        board, posts = await _dated_posts(client, auth_headers)
        for post in [posts[0], posts[1]]:
            response = await client.delete(
                f"{BOARDS}/{board['id']}/posts/{post['id']}", headers=auth_headers
            )
            assert response.status_code == 200, response.text
        response = await client.get(
            POSTS,
            params={
                "trash": True,
                "created_from": "2026-11-07T00:00:00+09:00",
                "created_before": "2026-11-08T00:00:00+09:00",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["total"] == 1
        assert response.json()["data"]["items"][0]["id"] == posts[1]["id"]

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "params",
        [
            {"created_from": "invalid"},
            {"created_before": "2026-11-07T00:00:00"},
            {
                "created_from": "2026-11-07T00:00:00Z",
                "created_before": "2026-11-07T00:00:00Z",
            },
            {
                "created_from": "2026-11-08T00:00:00Z",
                "created_before": "2026-11-07T00:00:00Z",
            },
        ],
    )
    async def test_invalid_date_range(self, client, auth_headers, tenant, params):
        response = await client.get(POSTS, params=params, headers=auth_headers)
        assert response.status_code == 400, response.text


async def _updated_posts(client, auth_headers):
    board, posts = await _dated_posts(client, auth_headers)
    for post in posts:
        await _sql(
            "UPDATE board_posts SET updated_at=created_at, "
            "created_at='2030-01-01T00:00:00Z' WHERE id=:i",
            i=post["id"],
        )
    return board, posts


class TestModificationDateFilter:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "params, expected",
        [
            ({"updated_from": "2026-11-07T00:00:00+09:00"}, {1, 2, 3}),
            ({"updated_before": "2026-11-08T00:00:00+09:00"}, {0, 1, 2}),
            (
                {
                    "updated_from": "2026-11-07T00:00:00+09:00",
                    "updated_before": "2026-11-08T00:00:00+09:00",
                },
                {1, 2},
            ),
        ],
    )
    async def test_modification_boundaries_not_creation_or_publication(
        self, client, auth_headers, tenant, params, expected
    ):
        _board_row, posts = await _updated_posts(client, auth_headers)
        response = await client.get(POSTS, params=params, headers=auth_headers)
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["total"] == len(expected)
        assert {p["id"] for p in data["items"]} == {
            posts[index]["id"] for index in expected
        }

    @pytest.mark.asyncio
    async def test_filters_total_pagination_and_tenant(
        self, client, auth_headers, tenant, other
    ):
        board, posts = await _updated_posts(client, auth_headers)
        await _sql(
            "UPDATE board_posts SET updated_at='2026-11-07T00:00:00Z' WHERE id=:i",
            i=other["post_id"],
        )
        params = {
            "updated_from": "2026-11-06T15:00:00Z",
            "updated_before": "2026-11-07T15:00:00Z",
            "board_id": board["id"],
            "status": "PUBLISHED",
            "q": "행사",
            "size": 1,
        }
        pages = []
        for page in [1, 2]:
            response = await client.get(
                POSTS, params={**params, "page": page}, headers=auth_headers
            )
            assert response.status_code == 200, response.text
            assert response.json()["data"]["total"] == 2
            pages.extend(response.json()["data"]["items"])
        assert {p["id"] for p in pages} == {posts[1]["id"], posts[2]["id"]}
        # 게시판 조건 없이도 타 사업체 글이 섞이지 않는다.
        response = await client.get(
            POSTS,
            params={
                "updated_from": params["updated_from"],
                "updated_before": params["updated_before"],
            },
            headers=auth_headers,
        )
        assert response.json()["data"]["total"] == 2
        assert other["post_id"] not in response.text

    @pytest.mark.asyncio
    async def test_trash_uses_current_modification(self, client, auth_headers, tenant):
        board, posts = await _updated_posts(client, auth_headers)
        for post in [posts[0], posts[1]]:
            response = await client.delete(
                f"{BOARDS}/{board['id']}/posts/{post['id']}", headers=auth_headers
            )
            assert response.status_code == 200, response.text
        # 휴지통 이동도 수정 시각을 바꾸므로 현재 값을 기준으로 조회한다.
        await _sql(
            "UPDATE board_posts SET updated_at='2026-11-06T14:59:59Z' WHERE id=:i",
            i=posts[0]["id"],
        )
        await _sql(
            "UPDATE board_posts SET updated_at='2026-11-07T00:00:00Z' WHERE id=:i",
            i=posts[1]["id"],
        )
        response = await client.get(
            POSTS,
            params={
                "trash": True,
                "updated_from": "2026-11-07T00:00:00+09:00",
                "updated_before": "2026-11-08T00:00:00+09:00",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["total"] == 1
        assert response.json()["data"]["items"][0]["id"] == posts[1]["id"]

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "params",
        [
            {"updated_from": "invalid"},
            {"updated_before": "2026-11-07T00:00:00"},
            {
                "updated_from": "2026-11-07T00:00:00Z",
                "updated_before": "2026-11-07T00:00:00Z",
            },
            {
                "updated_from": "2026-11-08T00:00:00Z",
                "updated_before": "2026-11-07T00:00:00Z",
            },
        ],
    )
    async def test_invalid_date_range(self, client, auth_headers, tenant, params):
        response = await client.get(POSTS, params=params, headers=auth_headers)
        assert response.status_code == 400, response.text

    async def test_both_date_ranges_intersect(self, client, auth_headers, tenant):
        board, posts = await _updated_posts(client, auth_headers)
        await _sql(
            "UPDATE board_posts SET created_at='2025-01-01T00:00:00Z' WHERE id=:i",
            i=posts[1]["id"],
        )
        response = await client.get(
            POSTS,
            params={
                "created_before": "2026-01-01T00:00:00Z",
                "updated_from": "2026-11-06T15:00:00Z",
                "updated_before": "2026-11-07T15:00:00Z",
                "board_id": board["id"],
            },
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["total"] == 1
        assert response.json()["data"]["items"][0]["id"] == posts[1]["id"]

    async def test_viewer_can_filter(self, client, auth_headers, tenant, test_user):
        _board_row, posts = await _updated_posts(client, auth_headers)
        await _sql(
            "UPDATE users SET role='TENANT_VIEWER' WHERE id=:i", i=test_user["id"]
        )
        token = create_access_token(
            user_id=uuid.UUID(test_user["id"]),
            tenant_id=uuid.UUID(tenant["id"]),
            role="TENANT_VIEWER",
        )
        response = await client.get(
            POSTS,
            params={"updated_before": "2026-11-07T00:00:00+09:00"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["total"] == 1
        assert response.json()["data"]["items"][0]["id"] == posts[0]["id"]


async def _published_posts(client, auth_headers):
    board, posts = await _dated_posts(client, auth_headers)
    for post in posts:
        await _sql(
            "UPDATE board_posts SET published_at=created_at, "
            "created_at='2030-01-01T00:00:00Z', "
            "updated_at='2031-01-01T00:00:00Z' WHERE id=:i",
            i=post["id"],
        )
    return board, posts


class TestPublicationDateFilter:
    @pytest.mark.parametrize(
        "params, expected",
        [
            ({"published_from": "2026-11-07T00:00:00+09:00"}, {1, 2, 3}),
            ({"published_before": "2026-11-08T00:00:00+09:00"}, {0, 1, 2}),
            (
                {
                    "published_from": "2026-11-07T00:00:00+09:00",
                    "published_before": "2026-11-08T00:00:00+09:00",
                },
                {1, 2},
            ),
        ],
    )
    async def test_boundaries_not_creation_or_modification(
        self, client, auth_headers, tenant, params, expected
    ):
        board, posts = await _published_posts(client, auth_headers)
        await _post(client, auth_headers, board["id"], "미공개 초안", status="DRAFT")
        await _post(
            client, auth_headers, board["id"], "미공개 비공개", status="PRIVATE"
        )
        response = await client.get(POSTS, params=params, headers=auth_headers)
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["total"] == len(expected)
        assert {p["id"] for p in data["items"]} == {posts[i]["id"] for i in expected}

    async def test_filters_total_pages_category_and_tenant(
        self, client, auth_headers, tenant, other
    ):
        board, posts = await _published_posts(client, auth_headers)
        category = await client.post(
            f"{BOARDS}/{board['id']}/categories",
            json={"name": "행사"},
            headers=auth_headers,
        )
        assert category.status_code == 201, category.text
        category_id = category.json()["data"]["id"]
        for post in posts:
            await _sql(
                "UPDATE board_posts SET category_id=:c WHERE id=:i",
                c=category_id,
                i=post["id"],
            )
        await _sql(
            "UPDATE board_posts SET published_at='2026-11-07T00:00:00Z' WHERE id=:i",
            i=other["post_id"],
        )
        params = {
            "published_from": "2026-11-06T15:00:00Z",
            "published_before": "2026-11-07T15:00:00Z",
            "board_id": board["id"],
            "category_id": category_id,
            "status": "PUBLISHED",
            "q": "행사",
            "size": 1,
        }
        found = []
        for page in [1, 2]:
            response = await client.get(
                POSTS, params={**params, "page": page}, headers=auth_headers
            )
            assert response.status_code == 200, response.text
            assert response.json()["data"]["total"] == 2
            found.extend(p["id"] for p in response.json()["data"]["items"])
        assert set(found) == {posts[1]["id"], posts[2]["id"]}
        response = await client.get(
            POSTS,
            params={
                "published_from": params["published_from"],
                "published_before": params["published_before"],
            },
            headers=auth_headers,
        )
        assert response.json()["data"]["total"] == 2
        assert other["post_id"] not in response.text

    @pytest.mark.parametrize("trash", [False, True])
    async def test_first_publication_survives_private_republish_and_trash(
        self, client, auth_headers, tenant, trash
    ):
        board, posts = await _published_posts(client, auth_headers)
        url = f"{BOARDS}/{board['id']}/posts/{posts[1]['id']}"
        for status in ["PRIVATE", "PUBLISHED", "PRIVATE"]:
            response = await client.patch(
                url, json={"status": status}, headers=auth_headers
            )
            assert response.status_code == 200, response.text
            assert response.json()["data"]["published_at"].startswith(
                "2026-11-06T15:00:00"
            )
        if trash:
            response = await client.delete(url, headers=auth_headers)
            assert response.status_code == 200, response.text
        response = await client.get(
            POSTS,
            params={
                "published_from": "2026-11-06T15:00:00Z",
                "published_before": "2026-11-07T15:00:00Z",
                "status": "PRIVATE",
                "trash": trash,
            },
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["total"] == 1
        assert response.json()["data"]["items"][0]["id"] == posts[1]["id"]

    @pytest.mark.parametrize(
        "params",
        [
            {"published_from": "invalid"},
            {"published_before": "2026-11-07T00:00:00"},
            {
                "published_from": "2026-11-07T00:00:00Z",
                "published_before": "2026-11-07T00:00:00Z",
            },
            {
                "published_from": "2026-11-08T00:00:00Z",
                "published_before": "2026-11-07T00:00:00Z",
            },
        ],
    )
    async def test_invalid_range(self, client, auth_headers, tenant, params):
        response = await client.get(POSTS, params=params, headers=auth_headers)
        assert response.status_code == 400, response.text

    async def test_three_date_ranges_intersect(self, client, auth_headers, tenant):
        board, posts = await _published_posts(client, auth_headers)
        await _sql(
            "UPDATE board_posts SET updated_at='2032-01-01T00:00:00Z' WHERE id=:i",
            i=posts[1]["id"],
        )
        response = await client.get(
            POSTS,
            params={
                "board_id": board["id"],
                "created_from": "2030-01-01T00:00:00Z",
                "created_before": "2031-01-01T00:00:00Z",
                "updated_from": "2032-01-01T00:00:00Z",
                "published_from": "2026-11-06T15:00:00Z",
                "published_before": "2026-11-07T15:00:00Z",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["total"] == 1
        assert response.json()["data"]["items"][0]["id"] == posts[1]["id"]

    async def test_viewer_can_filter(self, client, auth_headers, tenant, test_user):
        _board_row, posts = await _published_posts(client, auth_headers)
        await _sql(
            "UPDATE users SET role='TENANT_VIEWER' WHERE id=:i", i=test_user["id"]
        )
        token = create_access_token(
            user_id=uuid.UUID(test_user["id"]),
            tenant_id=uuid.UUID(tenant["id"]),
            role="TENANT_VIEWER",
        )
        response = await client.get(
            POSTS,
            params={"published_before": "2026-11-07T00:00:00+09:00"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["total"] == 1
        assert response.json()["data"]["items"][0]["id"] == posts[0]["id"]


@pytest.fixture
async def named_authors(client, auth_headers, tenant):
    board = await _board(client, auth_headers, "author-search")
    member_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO site_members (id, tenant_id, email, name, phone)"
        " VALUES (:id, :t, 'private-email@example.com', :name, '01099998888')",
        id=member_id,
        t=tenant["id"],
        name="김작가 AbC%_\\",
    )
    member = await _post(client, auth_headers, board["id"], "회원 소식")
    guest = await _post(client, auth_headers, board["id"], "비회원 소식")
    staff = await _post(client, auth_headers, board["id"], "관리자 소식")
    await _sql(
        "UPDATE board_posts SET author_member_id = :m WHERE id = :p",
        m=member_id,
        p=member["id"],
    )
    await _sql(
        "UPDATE board_posts SET guest_name = '김작가 방문자' WHERE id = :p",
        p=guest["id"],
    )
    yield {
        "board": board,
        "member": member,
        "guest": guest,
        "staff": staff,
        "member_id": member_id,
    }
    await _sql(
        "UPDATE board_posts SET author_member_id = NULL WHERE author_member_id = :m",
        m=member_id,
    )
    await _sql("DELETE FROM site_members WHERE id = :m", m=member_id)


class TestAuthorSearch:
    @pytest.mark.parametrize(
        "keyword,titles",
        [
            (" 김작가 ", {"회원 소식", "비회원 소식"}),
            ("abc", {"회원 소식"}),
            ("%_\\", {"회원 소식"}),
            ("없는 이름", set()),
            ("   ", {"회원 소식", "비회원 소식", "관리자 소식"}),
        ],
    )
    async def test_display_names(
        self, client, auth_headers, named_authors, keyword, titles
    ):
        response = await client.get(
            POSTS, params={"author": keyword}, headers=auth_headers
        )
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["total"] == len(titles)
        assert {p["title"] for p in data["items"]} == titles

    @pytest.mark.parametrize("keyword", ["private-email", "01099998888", "소식"])
    async def test_does_not_search_contact_or_title(
        self, client, auth_headers, named_authors, keyword
    ):
        data = (
            await client.get(POSTS, params={"author": keyword}, headers=auth_headers)
        ).json()["data"]
        assert data["total"] == 0

    async def test_filters_pagination_trash(self, client, auth_headers, named_authors):
        params = {
            "author": "김작가",
            "size": 1,
            "page": 2,
            "board_id": named_authors["board"]["id"],
            "status": "PUBLISHED",
            "q": "소식",
            "created_from": "2020-01-01T00:00:00Z",
        }
        data = (await client.get(POSTS, params=params, headers=auth_headers)).json()[
            "data"
        ]
        assert data["total"] == 2
        assert len(data["items"]) == 1
        await client.delete(
            f"{BOARDS}/{named_authors['board']['id']}/posts/{named_authors['guest']['id']}",
            headers=auth_headers,
        )
        params.update(trash=True, page=1)
        data = (await client.get(POSTS, params=params, headers=auth_headers)).json()[
            "data"
        ]
        assert data["total"] == 1
        assert data["items"][0]["id"] == named_authors["guest"]["id"]
        params["status"] = "PRIVATE"
        assert (await client.get(POSTS, params=params, headers=auth_headers)).json()[
            "data"
        ]["total"] == 0

    async def test_withdrawn_name_matches_display(
        self, client, auth_headers, named_authors
    ):
        await _sql(
            "UPDATE site_members SET deleted_at = now(), is_active = false WHERE id = :m",
            m=named_authors["member_id"],
        )
        data = (
            await client.get(POSTS, params={"author": "AbC"}, headers=auth_headers)
        ).json()["data"]
        assert data["total"] == 1
        assert data["items"][0]["author_member_name"] == "김작가 AbC%_\\"

    async def test_tenant_isolation_and_viewer(
        self, client, auth_headers, named_authors, tenant, test_user, other
    ):
        data = (
            await client.get(
                POSTS, params={"author": "김작가"}, headers=other["headers"]
            )
        ).json()["data"]
        assert data["total"] == 0
        await _sql(
            "UPDATE users SET role = 'TENANT_VIEWER' WHERE id = :u", u=test_user["id"]
        )
        token = create_access_token(
            user_id=uuid.UUID(str(test_user["id"])),
            tenant_id=uuid.UUID(str(tenant["id"])),
            role="TENANT_VIEWER",
        )
        response = await client.get(
            POSTS,
            params={"author": "김작가"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["total"] == 2

    async def test_validation_and_login(self, client, auth_headers, named_authors):
        assert (
            await client.get(POSTS, params={"author": "a" * 101}, headers=auth_headers)
        ).status_code == 400
        assert (await client.get(POSTS, params={"author": "김작가"})).status_code == 401


class TestBodySearch:
    @pytest.mark.parametrize(
        "body",
        [
            [{"type": "p", "text": "본문 검색**어** AbC%_\\ 끝"}],
            [{"type": "ul", "items": ["앞", "본문 검색**어** AbC%_\\ 끝"]}],
            [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "본문 검색"},
                        {
                            "type": "text",
                            "text": "어 AbC%_\\ 끝",
                            "marks": [{"type": "bold"}],
                        },
                    ],
                }
            ],
            [
                {
                    "type": "heading",
                    "attrs": {"level": 2},
                    "content": [{"type": "text", "text": "본문 검색어 AbC%_\\ 끝"}],
                }
            ],
            [
                {
                    "type": "blockquote",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {"type": "text", "text": "본문 검색어 AbC%_\\ 끝"}
                            ],
                        }
                    ],
                }
            ],
            [
                {
                    "type": "bulletList",
                    "content": [
                        {
                            "type": "listItem",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [
                                        {
                                            "type": "text",
                                            "text": "본문 검색어 AbC%_\\ 끝",
                                        }
                                    ],
                                }
                            ],
                        }
                    ],
                }
            ],
            [
                {
                    "type": "table",
                    "content": [
                        {
                            "type": "tableRow",
                            "content": [
                                {
                                    "type": "tableCell",
                                    "content": [
                                        {
                                            "type": "paragraph",
                                            "content": [
                                                {
                                                    "type": "text",
                                                    "text": "본문 검색어 AbC%_\\ 끝",
                                                }
                                            ],
                                        }
                                    ],
                                }
                            ],
                        }
                    ],
                }
            ],
        ],
    )
    async def test_formats_inline_order_and_literal(
        self, client, auth_headers, tenant, body
    ):
        board = await _board(client, auth_headers)
        match = await _post(client, auth_headers, board["id"], "일치", body=body)
        await _post(client, auth_headers, board["id"], "본문 검색어 AbC%_\\", body=[])
        for keyword in (" 검색어 ", "abc", "%_\\"):
            response = await client.get(
                POSTS, params={"body_q": keyword}, headers=auth_headers
            )
            assert response.status_code == 200, response.text
            data = response.json()["data"]
            assert data["total"] == 1
            assert [p["id"] for p in data["items"]] == [match["id"]]
            assert "body" not in data["items"][0]

    async def test_does_not_search_urls_attributes_or_keys(
        self, client, auth_headers, tenant
    ):
        board = await _board(client, auth_headers)
        await _post(
            client,
            auth_headers,
            board["id"],
            "제목단어",
            body=[
                {"type": "image", "src": "/사진주소단어.png", "alt": "대체글자단어"},
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "보이는 글자",
                            "marks": [
                                {
                                    "type": "link",
                                    "attrs": {
                                        "href": "https://example.com/링크주소단어"
                                    },
                                }
                            ],
                        }
                    ],
                },
            ],
        )
        for keyword in (
            "사진주소단어",
            "대체글자단어",
            "링크주소단어",
            "paragraph",
            "제목단어",
            "없음",
        ):
            response = await client.get(
                POSTS, params={"body_q": keyword}, headers=auth_headers
            )
            assert response.status_code == 200, response.text
            assert response.json()["data"]["total"] == 0

    @pytest.mark.parametrize(
        "body",
        [
            [{"type": "p", "text": "앞"}, {"type": "p", "text": "뒤"}],
            [{"type": "ul", "items": ["앞", "뒤"]}],
            [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "앞"},
                        {"type": "hardBreak"},
                        {"type": "text", "text": "뒤"},
                    ],
                }
            ],
        ],
    )
    async def test_boundaries_are_not_concatenated(
        self, client, auth_headers, tenant, body
    ):
        board = await _board(client, auth_headers)
        await _post(client, auth_headers, board["id"], "경계", body=body)
        response = await client.get(
            POSTS, params={"body_q": "앞뒤"}, headers=auth_headers
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["total"] == 0

    async def test_combined_pagination_trash_and_tenant(
        self, client, auth_headers, named_authors, other
    ):
        params = {
            "body_q": SECRET_BODY,
            "author": "김작가",
            "q": "소식",
            "board_id": named_authors["board"]["id"],
            "status": "PUBLISHED",
            "created_from": "2020-01-01T00:00:00Z",
            "size": 1,
            "page": 2,
        }
        response = await client.get(POSTS, params=params, headers=auth_headers)
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["total"] == 2
        assert len(data["items"]) == 1
        assert (
            await client.get(POSTS, params=params, headers=other["headers"])
        ).json()["data"]["total"] == 0
        await client.delete(
            f"{BOARDS}/{named_authors['board']['id']}/posts/{named_authors['guest']['id']}",
            headers=auth_headers,
        )
        params.update(page=1, trash=True)
        data = (await client.get(POSTS, params=params, headers=auth_headers)).json()[
            "data"
        ]
        assert data["total"] == 1
        assert data["items"][0]["id"] == named_authors["guest"]["id"]
        params["status"] = "PRIVATE"
        assert (await client.get(POSTS, params=params, headers=auth_headers)).json()[
            "data"
        ]["total"] == 0

    async def test_empty_validation_login_and_viewer(
        self, client, auth_headers, named_authors, tenant, test_user
    ):
        assert (
            await client.get(POSTS, params={"body_q": " "}, headers=auth_headers)
        ).json()["data"]["total"] == 3
        assert (
            await client.get(POSTS, params={"body_q": "a" * 101}, headers=auth_headers)
        ).status_code == 400
        assert (
            await client.get(POSTS, params={"body_q": SECRET_BODY})
        ).status_code == 401
        await _sql(
            "UPDATE users SET role = 'TENANT_VIEWER' WHERE id = :u", u=test_user["id"]
        )
        token = create_access_token(
            user_id=uuid.UUID(str(test_user["id"])),
            tenant_id=uuid.UUID(str(tenant["id"])),
            role="TENANT_VIEWER",
        )
        response = await client.get(
            POSTS,
            params={"body_q": SECRET_BODY},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["total"] == 3

    async def test_private_secret_and_trashed_board(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers)
        post = await _post(
            client, auth_headers, board["id"], "비밀 글", status="PRIVATE"
        )
        await _sql(
            "UPDATE board_posts SET is_secret = true WHERE id = :p", p=post["id"]
        )
        params = {"body_q": SECRET_BODY, "status": "PRIVATE"}
        response = await client.get(POSTS, params=params, headers=auth_headers)
        assert response.status_code == 200, response.text
        assert response.json()["data"]["total"] == 1
        assert "body" not in response.json()["data"]["items"][0]
        await client.delete(f"{BOARDS}/{board['id']}", headers=auth_headers)
        assert (await client.get(POSTS, params=params, headers=auth_headers)).json()[
            "data"
        ]["total"] == 0
