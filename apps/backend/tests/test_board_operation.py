"""운영 설정 — 비밀글 · 새 글 알림 (T-151-A, 게시판 모듈 기획서 BM-11)."""

import json
import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text

from app.core.security import create_member_access_token
from app.services import board_notify, site_cache
from app.services import feature as feature_service
from tests.conftest import _TestSession  # type: ignore

BOARDS = "/api/v1/boards"


async def _sql(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        rows = result.fetchall() if result.returns_rows else None
        await s.commit()
    return rows


@pytest.fixture(autouse=True)
def purged(monkeypatch) -> None:
    async def fake_purge(_db, _tenant_id):
        return True

    monkeypatch.setattr(site_cache, "purge_site", fake_purge)


class FakeRedis:
    def __init__(self) -> None:
        self.published: list[tuple[str, dict]] = []

    async def publish(self, channel: str, payload: str) -> None:
        self.published.append((channel, json.loads(payload)))


@pytest.fixture
def redis(monkeypatch) -> FakeRedis:
    fake = FakeRedis()

    async def get_fake():
        return fake

    monkeypatch.setattr(board_notify, "get_redis", get_fake)
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


async def _member(tenant_id: str) -> dict:
    member_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO site_members (id, tenant_id, email, name, phone)"
        " VALUES (:id, :t, :e, '회원', '010-1111-2222')",
        id=member_id,
        t=tenant_id,
        e=f"{member_id[:8]}@example.com",
    )
    token = create_member_access_token(uuid.UUID(member_id), uuid.UUID(tenant_id))
    return {"id": member_id, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture
async def board(client, auth_headers, tenant) -> dict:
    resp = await client.post(
        BOARDS,
        json={"name": "고객 문의", "slug": "qna", "board_type": "CARD"},
        headers=auth_headers,
    )
    data = resp.json()["data"]
    resp = await client.patch(
        f"{BOARDS}/{data['id']}",
        json={
            "permissions": {"read": "PUBLIC", "write": "MEMBER"},
            "operation": {"allow_secret": True, "notify_new_post": True},
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    data["public"] = f"/api/public/site/{tenant['slug']}/boards/qna/posts"
    data["admin_posts"] = f"{BOARDS}/{data['id']}/posts"
    return data


async def _write(client, board: dict, member: dict, **payload):
    body = {"title": "비밀 질문", "content": "전화번호는 010-0000-0000", **payload}
    return await client.post(board["public"], json=body, headers=member["headers"])


class TestSettings:
    async def test_defaults_and_save(self, client, auth_headers, tenant):
        created = await client.post(
            BOARDS, json={"name": "새", "slug": "new-one"}, headers=auth_headers
        )
        data = created.json()["data"]
        assert data["operation"] == {
            "allow_secret": False,
            "notify_new_post": False,
            "allow_guest": False,
            "report_hide_count": 5,
        }
        resp = await client.patch(
            f"{BOARDS}/{data['id']}",
            json={"operation": {"allow_secret": True, "notify_new_post": False}},
            headers=auth_headers,
        )
        assert resp.json()["data"]["operation"]["allow_secret"] is True
        site = await client.get(f"/api/public/site/{tenant['slug']}")
        found = next(b for b in site.json()["data"]["boards"] if b["slug"] == "new-one")
        assert found["allow_secret"] is True

    async def test_invalid_400(self, client, auth_headers, board):
        resp = await client.patch(
            f"{BOARDS}/{board['id']}",
            json={"operation": {"allow_secret": "yes please"}},
            headers=auth_headers,
        )
        assert resp.status_code == 400


class TestSecret:
    @pytest.fixture
    async def writer(self, tenant) -> dict:
        return await _member(tenant["id"])

    @pytest.fixture
    async def secret(self, client, board, writer, redis) -> dict:
        resp = await _write(client, board, writer, is_secret=True)
        assert resp.status_code == 201, resp.text
        return resp.json()["data"]

    async def test_list_shows_title_only(self, client, board, secret):
        listed = (await client.get(board["public"])).json()["data"]["items"][0]
        assert listed["title"] == "비밀 질문"
        assert listed["is_secret"] is True
        assert listed["summary"] is None
        assert listed["thumbnail"] is None
        assert listed["card_fields"] is None
        assert "010-0000-0000" not in json.dumps(listed)

    async def test_visitor_and_other_member_locked(self, client, tenant, board, secret):
        url = f"{board['public']}/{secret['id']}"
        anonymous = await client.get(url)
        assert anonymous.status_code == 200
        data = anonymous.json()["data"]
        assert data["locked"] is True
        assert data["body"] == []
        assert "010-0000-0000" not in anonymous.text
        other = await _member(tenant["id"])
        resp = await client.get(url, headers=other["headers"])
        assert resp.json()["data"]["locked"] is True
        assert "010-0000-0000" not in resp.text

    async def test_writer_reads_without_cache(self, client, board, writer, secret):
        resp = await client.get(
            f"{board['public']}/{secret['id']}", headers=writer["headers"]
        )
        data = resp.json()["data"]
        assert data["locked"] is False
        assert "010-0000-0000" in json.dumps(data["body"], ensure_ascii=False)
        assert resp.headers["cache-control"] == "private, no-store"

    async def test_admin_reads_in_admin(self, client, auth_headers, board, secret):
        resp = await client.get(
            f"{board['admin_posts']}/{secret['id']}", headers=auth_headers
        )
        assert resp.json()["data"]["is_secret"] is True
        assert "010-0000-0000" in json.dumps(
            resp.json()["data"]["body"], ensure_ascii=False
        )

    async def test_sitemap_excludes(self, client, tenant, board, secret):
        resp = await client.get(f"/api/public/site/{tenant['slug']}/sitemap-posts")
        assert secret["id"] not in resp.text

    async def test_not_allowed_409(self, client, auth_headers, board, writer, redis):
        await client.patch(
            f"{BOARDS}/{board['id']}",
            json={"operation": {"allow_secret": False, "notify_new_post": False}},
            headers=auth_headers,
        )
        resp = await _write(client, board, writer, is_secret=True)
        assert resp.status_code == 409

    async def test_turning_off_keeps_existing_secret(
        self, client, auth_headers, board, writer, secret
    ):
        await client.patch(
            f"{BOARDS}/{board['id']}",
            json={"operation": {"allow_secret": False, "notify_new_post": False}},
            headers=auth_headers,
        )
        url = f"{board['public']}/{secret['id']}"
        assert (await client.get(url)).json()["data"]["locked"] is True
        # 이미 비밀글이면 고쳐도 비밀글로 둘 수 있고, 공개로 바꿀 수 있다
        keep = await client.patch(
            url, json={"title": "새 제목", "is_secret": True}, headers=writer["headers"]
        )
        assert keep.status_code == 200
        opened = await client.patch(
            url, json={"is_secret": False}, headers=writer["headers"]
        )
        assert opened.json()["data"]["is_secret"] is False
        again = await client.patch(
            url, json={"is_secret": True}, headers=writer["headers"]
        )
        assert again.status_code == 409

    async def test_admin_can_toggle(self, client, auth_headers, board):
        created = await client.post(
            board["admin_posts"],
            json={"title": "관리자 비밀", "status": "PUBLISHED", "is_secret": True},
            headers=auth_headers,
        )
        post_id = created.json()["data"]["id"]
        assert (await client.get(f"{board['public']}/{post_id}")).json()["data"][
            "locked"
        ] is True
        listed = await client.get(board["admin_posts"], headers=auth_headers)
        assert listed.json()["data"]["items"][0]["is_secret"] is True


class TestNotify:
    async def test_new_member_post_notifies(self, client, tenant, board, redis):
        writer = await _member(tenant["id"])
        resp = await _write(client, board, writer)
        assert len(redis.published) == 1
        channel, payload = redis.published[0]
        assert channel == f"inquiry:new:{tenant['id']}"
        assert payload == {
            "type": "new_post",
            "board_id": board["id"],
            "board_name": "고객 문의",
            "post_id": resp.json()["data"]["id"],
            "title": "비밀 질문",
        }

    async def test_off_or_edit_does_not_notify(
        self, client, auth_headers, tenant, board, redis
    ):
        writer = await _member(tenant["id"])
        created = await _write(client, board, writer)
        url = f"{board['public']}/{created.json()['data']['id']}"
        await client.patch(url, json={"title": "고침"}, headers=writer["headers"])
        assert len(redis.published) == 1
        await client.patch(
            f"{BOARDS}/{board['id']}",
            json={"operation": {"allow_secret": True, "notify_new_post": False}},
            headers=auth_headers,
        )
        await _write(client, board, writer)
        assert len(redis.published) == 1

    async def test_redis_failure_still_saves(self, client, tenant, board, monkeypatch):
        async def broken():
            raise ConnectionError("down")

        monkeypatch.setattr(board_notify, "get_redis", broken)
        writer = await _member(tenant["id"])
        assert (await _write(client, board, writer)).status_code == 201
