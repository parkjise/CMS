"""비회원 글쓰기 · 신고 (T-151-B, 게시판 모듈 기획서 BM-11)."""

import json
import uuid
from collections.abc import AsyncIterator

import pytest
from fastapi import HTTPException
from sqlalchemy import text

from app.core.security import create_access_token, create_member_access_token
from app.services import (
    board_guest_post,
    board_notify,
    board_report,
    recaptcha,
    site_cache,
)
from app.services import feature as feature_service
from tests.conftest import _TestSession  # type: ignore

BOARDS = "/api/v1/boards"
PASSWORD = "pass1234"


async def _sql(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        rows = result.fetchall() if result.returns_rows else None
        await s.commit()
    return rows


class FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, int] = {}
        self.published: list[dict] = []
        self.broken = False

    def _check(self) -> None:
        if self.broken:
            raise ConnectionError("down")

    async def incr(self, key: str) -> int:
        self._check()
        self.values[key] = self.values.get(key, 0) + 1
        return self.values[key]

    async def expire(self, key: str, _ttl: int) -> None:
        self._check()

    async def get(self, key: str):
        self._check()
        return self.values.get(key)

    async def publish(self, _channel: str, payload: str) -> None:
        self.published.append(json.loads(payload))


@pytest.fixture(autouse=True)
def redis(monkeypatch) -> FakeRedis:
    fake = FakeRedis()

    async def get_fake():
        return fake

    async def fake_purge(_db, _tenant_id):
        return True

    for module in (board_guest_post, board_report, board_notify):
        monkeypatch.setattr(module, "get_redis", get_fake)
    monkeypatch.setattr(site_cache, "purge_site", fake_purge)
    return fake


@pytest.fixture
async def tenant(test_tenant, test_user) -> AsyncIterator[dict]:
    await feature_service.invalidate_cache(test_tenant["id"])
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD', template_type = 'GENERAL'"
        " WHERE id = :t",
        t=test_tenant["id"],
    )
    yield test_tenant
    await _sql("DELETE FROM audit_logs WHERE tenant_id = :t", t=test_tenant["id"])
    await _sql("DELETE FROM tenant_features WHERE tenant_id = :t", t=test_tenant["id"])
    await feature_service.invalidate_cache(test_tenant["id"])


async def _configure(client, auth_headers, board_id: str, **operation) -> object:
    return await client.patch(
        f"{BOARDS}/{board_id}",
        json={
            "permissions": {"read": "PUBLIC", "write": "MEMBER"},
            "operation": {
                "allow_secret": True,
                "notify_new_post": True,
                "allow_guest": True,
                **operation,
            },
        },
        headers=auth_headers,
    )


@pytest.fixture
async def board(client, auth_headers, tenant) -> dict:
    resp = await client.post(
        BOARDS, json={"name": "방명록", "slug": "guestbook"}, headers=auth_headers
    )
    data = resp.json()["data"]
    resp = await _configure(client, auth_headers, data["id"])
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    base = f"/api/public/site/{tenant['slug']}/boards/guestbook/posts"
    data["public"] = base
    data["guest"] = f"{base}/guest"
    data["admin_posts"] = f"{BOARDS}/{data['id']}/posts"
    return data


def _guest(**payload) -> dict:
    return {
        "name": "손님",
        "password": PASSWORD,
        "title": "안녕하세요",
        "content": "방문 후기 남겨요",
        "agree": True,
        **payload,
    }


async def _write(client, board: dict, **payload):
    return await client.post(board["guest"], json=_guest(**payload))


class TestSettings:
    async def test_public_site_flag(self, client, tenant, board):
        resp = await client.get(f"/api/public/site/{tenant['slug']}")
        found = next(
            b for b in resp.json()["data"]["boards"] if b["slug"] == "guestbook"
        )
        assert found["allow_guest"] is True

    async def test_hospital_cannot_turn_on(self, client, auth_headers, tenant):
        await _sql(
            "UPDATE tenants SET template_type = 'HOSPITAL' WHERE id = :t",
            t=tenant["id"],
        )
        created = await client.post(
            BOARDS, json={"name": "새", "slug": "fresh"}, headers=auth_headers
        )
        resp = await client.patch(
            f"{BOARDS}/{created.json()['data']['id']}",
            json={"operation": {"allow_guest": True}},
            headers=auth_headers,
        )
        assert resp.status_code == 409
        assert "병원" in resp.json()["error"]["message"]


class TestGuestWrite:
    async def test_write_publishes_and_notifies(
        self, client, auth_headers, board, redis
    ):
        resp = await _write(client, board, is_secret=False)
        assert resp.status_code == 201, resp.text
        created = resp.json()["data"]
        assert created["guest_name"] == "손님"
        assert "password" not in json.dumps(created)
        public = await client.get(f"{board['public']}/{created['id']}")
        assert public.json()["data"]["is_guest"] is True
        assert redis.published[0]["type"] == "new_post"
        admin = await client.get(board["admin_posts"], headers=auth_headers)
        item = admin.json()["data"]["items"][0]
        assert item["guest_name"] == "손님"
        assert item["author_member_id"] is None
        stored = await _sql(
            "SELECT guest_password_hash FROM board_posts WHERE id = :i",
            i=created["id"],
        )
        assert stored and stored[0][0].startswith("$2")

    @pytest.mark.parametrize(
        "payload",
        [
            {"agree": False},
            {"name": ""},
            {"password": "123"},
            {"title": ""},
            {"content": " "},
            {"is_pinned": True},
        ],
    )
    async def test_invalid_400(self, client, board, payload):
        assert (await _write(client, board, **payload)).status_code == 400

    async def test_closed_403(self, client, auth_headers, board):
        await _configure(client, auth_headers, board["id"], allow_guest=False)
        assert (await _write(client, board)).status_code == 403

    async def test_member_only_read_board_403(self, client, auth_headers, board):
        await client.patch(
            f"{BOARDS}/{board['id']}",
            json={"permissions": {"read": "MEMBER", "write": "MEMBER"}},
            headers=auth_headers,
        )
        assert (await _write(client, board)).status_code == 403

    async def test_hospital_switch_blocks(self, client, tenant, board):
        await _sql(
            "UPDATE tenants SET template_type = 'HOSPITAL' WHERE id = :t",
            t=tenant["id"],
        )
        resp = await _write(client, board)
        assert resp.status_code == 403
        assert "병원" in resp.json()["error"]["message"]

    async def test_secret_needs_permission(self, client, auth_headers, board):
        await _configure(client, auth_headers, board["id"], allow_secret=False)
        assert (await _write(client, board, is_secret=True)).status_code == 409

    async def test_rate_limit_per_ip(self, client, board, monkeypatch):
        monkeypatch.setattr(board_guest_post, "MAX_POSTS_PER_HOUR", 2)
        for _ in range(2):
            assert (await _write(client, board)).status_code == 201
        resp = await _write(client, board)
        assert resp.status_code == 429
        other_ip = await client.post(
            board["guest"], json=_guest(), headers={"X-Real-IP": "10.0.0.9"}
        )
        assert other_ip.status_code == 201

    async def test_redis_down_still_writes(self, client, board, redis):
        redis.broken = True
        assert (await _write(client, board)).status_code == 201

    async def test_recaptcha_checked(self, client, board, monkeypatch):
        seen: list[tuple[str | None, str | None]] = []

        async def fake_verify(token, action=None):
            seen.append((token, action))
            if token != "good":
                raise HTTPException(status_code=400, detail="RECAPTCHA_FAILED")

        monkeypatch.setattr(recaptcha, "verify", fake_verify)
        assert (await _write(client, board, recaptcha_token="bad")).status_code == 400
        assert (await _write(client, board, recaptcha_token="good")).status_code == 201
        assert seen == [("bad", "board_guest_write"), ("good", "board_guest_write")]


class TestGuestPassword:
    @pytest.fixture
    async def post(self, client, board) -> dict:
        resp = await _write(client, board, is_secret=True, content="연락처 010-1234")
        return resp.json()["data"]

    async def test_secret_locked_then_verified(self, client, board, post):
        url = f"{board['public']}/{post['id']}"
        locked = (await client.get(url)).json()["data"]
        assert locked["locked"] is True
        assert "010-1234" not in json.dumps(locked)
        resp = await client.post(f"{url}/guest/verify", json={"password": PASSWORD})
        assert resp.status_code == 200
        assert resp.headers["cache-control"] == "private, no-store"
        assert "010-1234" in json.dumps(resp.json()["data"]["body"], ensure_ascii=False)

    async def test_wrong_password_and_lockout(self, client, board, post, monkeypatch):
        monkeypatch.setattr(board_guest_post, "MAX_WRONG_PASSWORDS", 2)
        url = f"{board['public']}/{post['id']}/guest/verify"
        for _ in range(2):
            wrong = await client.post(url, json={"password": "nope1234"})
            assert wrong.status_code == 403
        # 틀린 횟수를 넘기면 맞는 비밀번호도 잠시 막는다
        assert (await client.post(url, json={"password": PASSWORD})).status_code == 429

    async def test_redis_down_blocks_password(self, client, board, post, redis):
        redis.broken = True
        url = f"{board['public']}/{post['id']}/guest/verify"
        assert (await client.post(url, json={"password": PASSWORD})).status_code == 429

    async def test_update_and_delete(self, client, board, post):
        url = f"{board['public']}/{post['id']}"
        bad = await client.patch(
            f"{url}/guest", json={"password": "nope1234", "title": "x"}
        )
        assert bad.status_code == 403
        updated = await client.patch(
            f"{url}/guest",
            json={"password": PASSWORD, "title": "고친 제목", "is_secret": False},
        )
        assert updated.status_code == 200
        assert updated.json()["data"]["title"] == "고친 제목"
        assert (await client.get(url)).json()["data"]["locked"] is False
        deleted = await client.post(f"{url}/guest/delete", json={"password": PASSWORD})
        assert deleted.status_code == 200
        assert (await client.get(url)).status_code == 404

    async def test_member_and_admin_posts_not_guest(
        self, client, auth_headers, tenant, board
    ):
        member_id = str(uuid.uuid4())
        await _sql(
            "INSERT INTO site_members (id, tenant_id, email, name, phone)"
            " VALUES (:id, :t, :e, '회원', '010-1111-2222')",
            id=member_id,
            t=tenant["id"],
            e=f"{member_id[:8]}@example.com",
        )
        token = create_member_access_token(
            uuid.UUID(member_id), uuid.UUID(tenant["id"])
        )
        member_post = await client.post(
            board["public"],
            json={"title": "회원 글", "content": "내용"},
            headers={"Authorization": f"Bearer {token}"},
        )
        admin_post = await client.post(
            board["admin_posts"],
            json={"title": "관리자 글", "status": "PUBLISHED"},
            headers=auth_headers,
        )
        for created in (member_post, admin_post):
            url = f"{board['public']}/{created.json()['data']['id']}/guest/verify"
            resp = await client.post(url, json={"password": PASSWORD})
            assert resp.status_code == 404


class TestReports:
    @pytest.fixture
    async def post(self, client, board) -> dict:
        return (await _write(client, board)).json()["data"]

    def _url(self, board: dict, post: dict) -> str:
        return f"{board['public']}/{post['id']}/report"

    async def test_report_once_per_visitor(self, client, board, post):
        url = self._url(board, post)
        first = await client.post(url, json={"reason": "SPAM", "detail": "광고"})
        assert first.status_code == 201
        assert first.json()["data"] == {"reported": True, "hidden": False}
        again = await client.post(url, json={"reason": "ABUSE"})
        assert again.status_code == 409
        stored = await _sql(
            "SELECT reporter_key FROM board_post_reports WHERE post_id = :p",
            p=post["id"],
        )
        assert stored and len(stored[0][0]) == 64
        assert "127.0.0.1" not in stored[0][0]

    async def test_auto_hide_then_admin_publish(
        self, client, auth_headers, board, post
    ):
        url = self._url(board, post)
        for index in range(3):
            resp = await client.post(
                url,
                json={"reason": "SPAM", "detail": f"광고 {index}"},
                headers={"X-Real-IP": f"10.0.0.{index + 1}"},
            )
        assert resp.json()["data"]["hidden"] is True
        assert (await client.get(f"{board['public']}/{post['id']}")).status_code == 404

        listed = await client.get("/api/v1/posts/reports", headers=auth_headers)
        item = listed.json()["data"][0]
        assert item["report_count"] == 3
        assert item["reasons"] == {"SPAM": 3}
        assert item["status"] == "PRIVATE"
        assert len(item["details"]) == 3

        resolved = await client.post(
            f"/api/v1/posts/{post['id']}/reports/resolve",
            json={"action": "PUBLISH"},
            headers=auth_headers,
        )
        assert resolved.status_code == 200
        assert (await client.get(f"{board['public']}/{post['id']}")).status_code == 200
        empty = await client.get("/api/v1/posts/reports", headers=auth_headers)
        assert empty.json()["data"] == []
        again = await client.post(
            f"/api/v1/posts/{post['id']}/reports/resolve",
            json={"action": "DISMISS"},
            headers=auth_headers,
        )
        assert again.status_code == 409

    @pytest.mark.parametrize(
        ("action", "status", "deleted"),
        [("DISMISS", "PUBLISHED", False), ("HIDE", "PRIVATE", False)],
    )
    async def test_resolve_actions(
        self, client, auth_headers, board, post, action, status, deleted
    ):
        await client.post(self._url(board, post), json={"reason": "OTHER"})
        await client.post(
            f"/api/v1/posts/{post['id']}/reports/resolve",
            json={"action": action},
            headers=auth_headers,
        )
        detail = await client.get(
            f"{board['admin_posts']}/{post['id']}", headers=auth_headers
        )
        assert detail.json()["data"]["status"] == status
        assert (detail.json()["data"]["deleted_at"] is not None) is deleted

    async def test_resolve_delete_and_audit(
        self, client, auth_headers, tenant, board, post
    ):
        await client.post(self._url(board, post), json={"reason": "PRIVACY"})
        await client.post(
            f"/api/v1/posts/{post['id']}/reports/resolve",
            json={"action": "DELETE"},
            headers=auth_headers,
        )
        assert (await client.get(f"{board['public']}/{post['id']}")).status_code == 404
        rows = await _sql(
            "SELECT action FROM audit_logs WHERE tenant_id = :t"
            " AND action LIKE 'POST_REPORTS_%'",
            t=tenant["id"],
        )
        assert [r[0] for r in rows or []] == ["POST_REPORTS_DELETE"]

    async def test_invalid_and_hidden_posts(self, client, auth_headers, board, post):
        url = self._url(board, post)
        assert (await client.post(url, json={"reason": "BORING"})).status_code == 400
        await client.patch(
            f"{board['admin_posts']}/{post['id']}",
            json={"status": "PRIVATE"},
            headers=auth_headers,
        )
        assert (await client.post(url, json={"reason": "SPAM"})).status_code == 404

    async def test_report_rate_limit(self, client, board, post, monkeypatch):
        monkeypatch.setattr(board_report, "MAX_REPORTS_PER_HOUR", 0)
        resp = await client.post(self._url(board, post), json={"reason": "SPAM"})
        assert resp.status_code == 429

    async def test_viewer_and_other_tenant(
        self, client, tenant, test_user, board, post
    ):
        await client.post(self._url(board, post), json={"reason": "SPAM"})
        await _sql(
            "UPDATE users SET role = 'TENANT_VIEWER' WHERE id = :i", i=test_user["id"]
        )
        viewer = create_access_token(
            user_id=uuid.UUID(test_user["id"]),
            tenant_id=uuid.UUID(tenant["id"]),
            role="TENANT_VIEWER",
        )
        headers = {"Authorization": f"Bearer {viewer}"}
        listed = await client.get("/api/v1/posts/reports", headers=headers)
        assert listed.status_code == 200
        resp = await client.post(
            f"/api/v1/posts/{post['id']}/reports/resolve",
            json={"action": "HIDE"},
            headers=headers,
        )
        assert resp.status_code == 403
        other = create_access_token(
            user_id=uuid.uuid4(), tenant_id=uuid.uuid4(), role="TENANT_ADMIN"
        )
        resp = await client.get(
            "/api/v1/posts/reports", headers={"Authorization": f"Bearer {other}"}
        )
        assert resp.status_code in (401, 403, 404) or resp.json()["data"] == []
