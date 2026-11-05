"""전체 글 · 일괄 처리 · 사이트맵 · 감사 로그 (T-140-C, 기획서 BM-05 · 11.4)."""

import json
import uuid
from collections.abc import AsyncIterator

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
    client, headers, board_id: str, title: str, status: str = "PUBLISHED"
) -> dict:
    resp = await client.post(
        f"{BOARDS}/{board_id}/posts",
        json={
            "title": title,
            "status": status,
            "body": [{"type": "p", "text": SECRET_BODY}],
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
