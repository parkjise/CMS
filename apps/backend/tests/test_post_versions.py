"""게시글 버전 이력 (T-191, 게시판 모듈 기획서 BM-06)."""

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text

from app.core.security import create_access_token
from app.services import feature as feature_service
from app.services import post_version as version_service
from app.services import site_cache
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
    await feature_service.invalidate_cache(test_tenant["id"])


@pytest.fixture
async def post(client, auth_headers, tenant) -> dict:
    board = await client.post(
        BOARDS, json={"name": "소식", "slug": "news"}, headers=auth_headers
    )
    assert board.status_code == 201, board.text
    board_id = board.json()["data"]["id"]
    created = await client.post(
        f"{BOARDS}/{board_id}/posts",
        json={
            "title": "첫 제목",
            "body": [{"type": "p", "text": "첫 본문"}],
            "status": "PUBLISHED",
        },
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    data = created.json()["data"]
    return {**data, "url": f"{BOARDS}/{board_id}/posts/{data['id']}"}


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


async def _edit(client, headers, post: dict, **fields) -> None:
    resp = await client.patch(post["url"], json=fields, headers=headers)
    assert resp.status_code == 200, resp.text


async def _versions(client, headers, post: dict) -> list[dict]:
    resp = await client.get(f"{post['url']}/versions", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


class TestPostVersions:
    async def test_edit_keeps_previous_content(
        self, client, auth_headers, test_user, post
    ):
        assert await _versions(client, auth_headers, post) == []

        await _edit(client, auth_headers, post, title="둘째 제목", is_pinned=True)
        await _edit(
            client, auth_headers, post, body=[{"type": "p", "text": "셋째 본문"}]
        )

        versions = await _versions(client, auth_headers, post)
        # 최근 것부터 — 고치기 직전 내용
        assert [v["title"] for v in versions] == ["둘째 제목", "첫 제목"]
        assert all(v["editor"] == test_user["email"] for v in versions)
        assert versions[1]["saved_at"] <= versions[1]["replaced_at"]

        detail = await client.get(
            f"{post['url']}/versions/{versions[1]['id']}", headers=auth_headers
        )
        assert detail.status_code == 200, detail.text
        first = detail.json()["data"]
        assert first["body"] == [{"type": "p", "text": "첫 본문"}]
        assert first["is_pinned"] is False
        assert first["status"] == "PUBLISHED"

    async def test_unchanged_save_adds_nothing(self, client, auth_headers, post):
        await _edit(client, auth_headers, post, title="첫 제목")
        assert await _versions(client, auth_headers, post) == []

    async def test_keeps_latest_only(self, client, auth_headers, post, monkeypatch):
        monkeypatch.setattr(version_service, "VERSION_KEEP", 3)
        for n in range(5):
            await _edit(client, auth_headers, post, title=f"제목 {n}")

        versions = await _versions(client, auth_headers, post)
        assert [v["title"] for v in versions] == ["제목 3", "제목 2", "제목 1"]
        stored = await _sql(
            "SELECT count(*) FROM board_post_versions WHERE post_id = :p",
            p=post["id"],
        )
        assert stored[0][0] == 3

    async def test_deleted_editor_shown_as_unknown(
        self, client, auth_headers, test_user, post
    ):
        await _edit(client, auth_headers, post, title="둘째 제목")
        await _sql(
            "UPDATE board_post_versions SET edited_by = NULL WHERE post_id = :p",
            p=post["id"],
        )
        versions = await _versions(client, auth_headers, post)
        assert versions[0]["editor"] == "삭제된 계정"

    async def test_other_tenant_cannot_read(
        self, client, auth_headers, post, other_tenant
    ):
        await _edit(client, auth_headers, post, title="둘째 제목")
        version_id = (await _versions(client, auth_headers, post))[0]["id"]
        headers = other_tenant["headers"]

        assert (
            await client.get(f"{post['url']}/versions", headers=headers)
        ).status_code == 404
        assert (
            await client.get(f"{post['url']}/versions/{version_id}", headers=headers)
        ).status_code == 404

    async def test_unknown_version_404_and_login_required(
        self, client, auth_headers, post
    ):
        missing = await client.get(
            f"{post['url']}/versions/{uuid.uuid4()}", headers=auth_headers
        )
        assert missing.status_code == 404
        assert (await client.get(f"{post['url']}/versions")).status_code == 401
