"""게시판 마무리 보완 (T-152) — 갭 분석에서 찾은 서버 불일치."""

import uuid
from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import text

from app.core.config import settings
from app.services import (
    board_guest_post,
    board_notify,
    board_report,
    recaptcha,
    site_cache,
)
from app.services import feature as feature_service
from tests.conftest import _TestSession  # type: ignore
from tests.test_board_guest_posts import FakeRedis  # type: ignore

BOARDS = "/api/v1/boards"


async def _sql(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        rows = result.fetchall() if result.returns_rows else None
        await s.commit()
    return rows


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


async def _board(client, auth_headers, slug: str, **settings_payload) -> dict:
    resp = await client.post(
        BOARDS, json={"name": slug, "slug": slug}, headers=auth_headers
    )
    data = resp.json()["data"]
    if settings_payload:
        patched = await client.patch(
            f"{BOARDS}/{data['id']}", json=settings_payload, headers=auth_headers
        )
        assert patched.status_code == 200, patched.text
    return data


async def _public_board(client, tenant: dict, slug: str) -> dict:
    await _sql("SELECT 1")
    from app.core.redis import get_redis

    await (await get_redis()).delete(f"site:{tenant['slug']}")
    resp = await client.get(f"/api/public/site/{tenant['slug']}")
    return next(b for b in resp.json()["data"]["boards"] if b["slug"] == slug)


OPEN_GUEST = {
    "permissions": {"read": "PUBLIC", "write": "MEMBER"},
    "operation": {"allow_secret": False, "notify_new_post": False, "allow_guest": True},
}


class TestEffectiveWriteFlags:
    async def test_open_board(self, client, auth_headers, tenant):
        await _board(client, auth_headers, "open-board", **OPEN_GUEST)
        board = await _public_board(client, tenant, "open-board")
        assert board["write_access"] == "MEMBER"
        assert board["allow_guest"] is True

    async def test_member_only_read_closes_guest(self, client, auth_headers, tenant):
        await _board(
            client,
            auth_headers,
            "members-only",
            permissions={"read": "MEMBER", "write": "MEMBER"},
            operation=OPEN_GUEST["operation"],
        )
        board = await _public_board(client, tenant, "members-only")
        assert board["write_access"] == "MEMBER"
        assert board["allow_guest"] is False

    async def test_hospital_closes_all_writing(self, client, auth_headers, tenant):
        await _board(client, auth_headers, "clinic", **OPEN_GUEST)
        await _sql(
            "UPDATE tenants SET template_type = 'HOSPITAL' WHERE id = :t",
            t=tenant["id"],
        )
        board = await _public_board(client, tenant, "clinic")
        assert board["write_access"] == "ADMIN"
        assert board["allow_guest"] is False

    async def test_member_feature_off_keeps_guest(self, client, auth_headers, tenant):
        await _board(client, auth_headers, "guest-only", **OPEN_GUEST)
        await _sql(
            "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled,"
            " created_at, updated_at) SELECT gen_random_uuid(), :t, id, false,"
            " now(), now() FROM features WHERE key = 'SITE_MEMBER'"
            " ON CONFLICT ON CONSTRAINT uq_tenant_features_pair"
            " DO UPDATE SET is_enabled = false",
            t=tenant["id"],
        )
        await feature_service.invalidate_cache(tenant["id"])
        board = await _public_board(client, tenant, "guest-only")
        # 회원은 못 쓰지만 비회원 글쓰기는 열려 있다 — 글쓰기 화면은 연다
        assert board["write_access"] == "MEMBER"
        assert board["allow_guest"] is True


class TestSystemBoardGuards:
    @pytest.fixture
    async def notice(self, tenant) -> str:
        board_id = str(uuid.uuid4())
        await _sql(
            "INSERT INTO boards (id, tenant_id, name, slug, system_key, board_type,"
            " status, settings) VALUES (:i, :t, '공지', 'notice', 'notice', 'LIST',"
            " 'ACTIVE', '{}')",
            i=board_id,
            t=tenant["id"],
        )
        return board_id

    async def test_operation_locked(self, client, auth_headers, notice):
        resp = await client.patch(
            f"{BOARDS}/{notice}",
            json={"operation": {"allow_secret": True}},
            headers=auth_headers,
        )
        assert resp.status_code == 409
        default = await client.patch(
            f"{BOARDS}/{notice}",
            json={"operation": {}},
            headers=auth_headers,
        )
        assert default.status_code == 200

    async def test_secret_post_locked(self, client, auth_headers, notice):
        url = f"{BOARDS}/{notice}/posts"
        secret = await client.post(
            url, json={"title": "비밀 공지", "is_secret": True}, headers=auth_headers
        )
        assert secret.status_code == 409
        created = await client.post(url, json={"title": "공지"}, headers=auth_headers)
        assert created.status_code == 201
        post_id = created.json()["data"]["id"]
        patched = await client.patch(
            f"{url}/{post_id}", json={"is_secret": True}, headers=auth_headers
        )
        assert patched.status_code == 409


class TestNeighbors:
    async def test_prev_next_in_list_order(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, "news")
        posts = f"{BOARDS}/{board['id']}/posts"
        ids = []
        for title in ("첫째", "둘째", "셋째"):
            resp = await client.post(
                posts,
                json={"title": title, "status": "PUBLISHED"},
                headers=auth_headers,
            )
            ids.append(resp.json()["data"]["id"])
        pinned = await client.post(
            posts,
            json={"title": "고정", "status": "PUBLISHED", "is_pinned": True},
            headers=auth_headers,
        )
        pinned_id = pinned.json()["data"]["id"]
        base = f"/api/public/site/{tenant['slug']}/boards/news/posts"
        # 목록 순서: 고정 → 셋째 → 둘째 → 첫째
        middle = (await client.get(f"{base}/{ids[1]}")).json()["data"]
        assert (middle["prev_id"], middle["next_id"]) == (ids[0], ids[2])
        top = (await client.get(f"{base}/{pinned_id}")).json()["data"]
        assert (top["prev_id"], top["next_id"]) == (ids[2], None)
        last = (await client.get(f"{base}/{ids[0]}")).json()["data"]
        # 가장 오래된 글 — 더 오래된 글이 없다
        assert (last["prev_id"], last["next_id"]) == (None, ids[1])
        assert (await client.get(f"{base}/{uuid.uuid4()}")).status_code == 404


class TestGuestPasswordAcrossPosts:
    async def test_limit_counts_across_posts(
        self, client, auth_headers, tenant, monkeypatch
    ):
        monkeypatch.setattr(board_guest_post, "MAX_WRONG_PASSWORDS", 2)
        await _board(client, auth_headers, "guestbook", **OPEN_GUEST)
        base = f"/api/public/site/{tenant['slug']}/boards/guestbook/posts"
        ids = []
        for _ in range(3):
            resp = await client.post(
                f"{base}/guest",
                json={
                    "name": "손님",
                    "password": "pass1234",
                    "title": "글",
                    "content": "내용",
                    "agree": True,
                },
            )
            ids.append(resp.json()["data"]["id"])
        for post_id in ids[:2]:
            wrong = await client.post(
                f"{base}/{post_id}/guest/verify", json={"password": "nope1234"}
            )
            assert wrong.status_code == 403
        # 다른 글로 바꿔도 같은 IP 는 막힌다
        blocked = await client.post(
            f"{base}/{ids[2]}/guest/verify", json={"password": "pass1234"}
        )
        assert blocked.status_code == 429


class TestRecaptcha:
    @pytest.fixture(autouse=True)
    def secret(self, monkeypatch):
        monkeypatch.setattr(settings, "recaptcha_secret_key", "test-secret")

    def _google(self, monkeypatch, payload: dict | None, error: bool = False):
        class FakeClient:
            def __init__(self, *args, **kwargs) -> None:
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args) -> None:
                return None

            async def post(self, *args, **kwargs):
                if error:
                    raise httpx.ConnectError("down")
                return httpx.Response(200, json=payload)

        monkeypatch.setattr(recaptcha.httpx, "AsyncClient", FakeClient)

    async def test_action_must_match(self, monkeypatch):
        self._google(
            monkeypatch, {"success": True, "score": 0.9, "action": "consult_write"}
        )
        with pytest.raises(HTTPException) as caught:
            await recaptcha.verify("token", action="board_guest_write")
        assert caught.value.status_code == 400
        # action 을 묻지 않는 곳(상담 접수)은 그대로 통과
        await recaptcha.verify("token")

    async def test_matching_action_passes(self, monkeypatch):
        self._google(
            monkeypatch, {"success": True, "score": 0.9, "action": "board_guest_write"}
        )
        await recaptcha.verify("token", action="board_guest_write")

    async def test_google_down_is_503(self, monkeypatch):
        self._google(monkeypatch, None, error=True)
        with pytest.raises(HTTPException) as caught:
            await recaptcha.verify("token", action="board_guest_write")
        assert caught.value.status_code == 503
