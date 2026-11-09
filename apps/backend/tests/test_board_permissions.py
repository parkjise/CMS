"""게시판 읽기 권한 — 회원만 읽기 (T-150-A, 게시판 모듈 기획서 BM-10 · 11.1)."""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.core.security import create_access_token, create_member_access_token
from app.services import feature as feature_service
from app.services import site_cache
from tests.conftest import _TestSession  # type: ignore

BOARDS = "/api/v1/boards"
MEMBER_ONLY = {"permissions": {"read": "MEMBER", "write": "ADMIN"}}


async def _sql(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        rows = result.fetchall() if result.returns_rows else None
        await s.commit()
    return rows


async def _set_member_feature(tenant_id: str, enabled: bool) -> None:
    await _sql(
        "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled,"
        " created_at, updated_at) SELECT gen_random_uuid(), :t, id, :on, now(), now()"
        " FROM features WHERE key = 'SITE_MEMBER'"
        " ON CONFLICT ON CONSTRAINT uq_tenant_features_pair"
        " DO UPDATE SET is_enabled = :on",
        t=tenant_id,
        on=enabled,
    )
    await feature_service.invalidate_cache(tenant_id)


@pytest.fixture(autouse=True)
def purged(monkeypatch) -> None:
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
async def member(tenant) -> dict:
    return await _member(tenant["id"])


@pytest.fixture
async def board(client, auth_headers, tenant) -> dict:
    resp = await client.post(
        BOARDS, json={"name": "회원 소식", "slug": "members"}, headers=auth_headers
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    post = await client.post(
        f"{BOARDS}/{data['id']}/posts",
        json={"title": "회원 글", "status": "PUBLISHED"},
        headers=auth_headers,
    )
    data["post_id"] = post.json()["data"]["id"]
    base = f"/api/public/site/{tenant['slug']}/boards/members/posts"
    data["list_url"] = base
    data["detail_url"] = f"{base}/{data['post_id']}"
    return data


async def _make_member_only(client, auth_headers, board: dict):
    return await client.patch(
        f"{BOARDS}/{board['id']}", json=MEMBER_ONLY, headers=auth_headers
    )


class TestSettings:
    async def test_default_public(self, client, auth_headers, board):
        assert board["permissions"] == {"read": "PUBLIC", "write": "ADMIN"}
        resp = await client.get(board["list_url"])
        assert resp.status_code == 200
        assert "no-store" not in resp.headers.get("cache-control", "")

    async def test_save_and_audit(self, client, auth_headers, tenant, board):
        resp = await _make_member_only(client, auth_headers, board)
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["permissions"]["read"] == "MEMBER"
        rows = await _sql(
            "SELECT before_value, after_value FROM audit_logs WHERE tenant_id = :t"
            " AND action = 'BOARD_UPDATED'",
            t=tenant["id"],
        )
        assert rows is not None
        before, after = rows[-1]
        assert before["permissions"]["read"] == "PUBLIC"
        assert after["permissions"]["read"] == "MEMBER"

    async def test_other_settings_keep_permissions(self, client, auth_headers, board):
        await _make_member_only(client, auth_headers, board)
        resp = await client.patch(
            f"{BOARDS}/{board['id']}", json={"name": "새 이름"}, headers=auth_headers
        )
        assert resp.json()["data"]["permissions"]["read"] == "MEMBER"

    @pytest.mark.parametrize(
        "permissions",
        [
            {"read": "EVERYONE"},
            {"read": "MEMBER", "write": "EVERYONE"},
            {"read": "MEMBER", "extra": True},
        ],
    )
    async def test_invalid_400(self, client, auth_headers, board, permissions):
        resp = await client.patch(
            f"{BOARDS}/{board['id']}",
            json={"permissions": permissions},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_member_feature_off_409(self, client, auth_headers, tenant, board):
        await _set_member_feature(tenant["id"], False)
        resp = await _make_member_only(client, auth_headers, board)
        assert resp.status_code == 409
        assert "회원 기능" in resp.json()["error"]["message"]

    async def test_system_board_409(self, client, auth_headers, tenant):
        board_id = str(uuid.uuid4())
        await _sql(
            "INSERT INTO boards (id, tenant_id, name, slug, system_key, board_type,"
            " status, settings) VALUES (:i, :t, '공지', 'notice', 'notice', 'LIST',"
            " 'ACTIVE', '{}')",
            i=board_id,
            t=tenant["id"],
        )
        resp = await client.patch(
            f"{BOARDS}/{board_id}", json=MEMBER_ONLY, headers=auth_headers
        )
        assert resp.status_code == 409
        # 기본값으로 되돌리는 요청은 막지 않는다
        default = {"permissions": {"read": "PUBLIC", "write": "ADMIN"}}
        resp = await client.patch(
            f"{BOARDS}/{board_id}", json=default, headers=auth_headers
        )
        assert resp.status_code == 200

    async def test_viewer_cannot_change(self, client, tenant, test_user, board):
        await _sql(
            "UPDATE users SET role = 'TENANT_VIEWER' WHERE id = :i", i=test_user["id"]
        )
        token = create_access_token(
            user_id=uuid.UUID(test_user["id"]),
            tenant_id=uuid.UUID(tenant["id"]),
            role="TENANT_VIEWER",
        )
        resp = await client.patch(
            f"{BOARDS}/{board['id']}",
            json=MEMBER_ONLY,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


class TestMemberOnlyRead:
    @pytest.fixture(autouse=True)
    async def member_only(self, client, auth_headers, board):
        resp = await _make_member_only(client, auth_headers, board)
        assert resp.status_code == 200

    async def test_member_reads_list_and_detail(self, client, board, member):
        listed = await client.get(board["list_url"], headers=member["headers"])
        assert listed.status_code == 200
        assert listed.json()["data"]["total"] == 1
        assert listed.headers["cache-control"] == "private, no-store"
        detail = await client.get(board["detail_url"], headers=member["headers"])
        assert detail.status_code == 200
        assert detail.json()["data"]["title"] == "회원 글"
        assert detail.headers["cache-control"] == "private, no-store"

    async def test_table_columns_remain_behind_member_read_check(
        self, client, auth_headers, board, member
    ):
        saved = await client.patch(
            f"{BOARDS}/{board['id']}",
            json={"design": {"list_layout": "columns"}},
            headers=auth_headers,
        )
        assert saved.status_code == 200, saved.text
        field = await client.post(
            f"{BOARDS}/{board['id']}/fields",
            json={"label": "회원 전용 칸", "field_type": "TEXT", "show_in_list": True},
            headers=auth_headers,
        )
        assert field.status_code == 201, field.text
        denied = await client.get(board["list_url"])
        assert denied.status_code == 401
        assert "회원 전용 칸" not in denied.text
        allowed = await client.get(board["list_url"], headers=member["headers"])
        assert allowed.status_code == 200, allowed.text
        assert allowed.headers["cache-control"] == "private, no-store"
        assert allowed.json()["data"]["list_columns"][0]["label"] == "회원 전용 칸"

    async def test_no_token_401(self, client, board):
        for url in (board["list_url"], board["detail_url"]):
            resp = await client.get(url)
            assert resp.status_code == 401
            assert resp.json()["error"]["code"] == "UNAUTHORIZED"
            assert "회원 글" not in resp.text

    async def test_bad_token_401(self, client, board):
        headers = {"Authorization": "Bearer not-a-token"}
        assert (await client.get(board["list_url"], headers=headers)).status_code == 401

    async def test_admin_token_403(self, client, auth_headers, board):
        resp = await client.get(board["list_url"], headers=auth_headers)
        assert resp.status_code == 403

    async def test_other_tenant_member_403(self, client, board):
        other_tenant = str(uuid.uuid4())
        token = create_member_access_token(uuid.uuid4(), uuid.UUID(other_tenant))
        resp = await client.get(
            board["list_url"], headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 403

    async def test_deleted_or_inactive_member_401(self, client, board, member):
        await _sql(
            "UPDATE site_members SET is_active = false WHERE id = :i", i=member["id"]
        )
        resp = await client.get(board["list_url"], headers=member["headers"])
        assert resp.status_code == 401

    async def test_token_before_password_change_401(self, client, board, member):
        later = datetime.now(UTC) + timedelta(minutes=1)
        await _sql(
            "UPDATE site_members SET password_changed_at = :at WHERE id = :i",
            at=later,
            i=member["id"],
        )
        resp = await client.get(board["list_url"], headers=member["headers"])
        assert resp.status_code == 401

    async def test_member_feature_off_403(self, client, tenant, board, member):
        await _set_member_feature(tenant["id"], False)
        resp = await client.get(board["list_url"], headers=member["headers"])
        assert resp.status_code == 403

    async def test_public_site_marks_board(self, client, tenant, board):
        resp = await client.get(f"/api/public/site/{tenant['slug']}")
        boards = resp.json()["data"]["boards"]
        found = next(b for b in boards if b["slug"] == "members")
        assert found["read_access"] == "MEMBER"
        assert "회원 글" not in resp.text

    async def test_sitemap_excludes_posts(self, client, tenant, board):
        resp = await client.get(f"/api/public/site/{tenant['slug']}/sitemap-posts")
        assert resp.status_code == 200
        assert board["post_id"] not in resp.text

    async def test_back_to_public(self, client, auth_headers, board):
        await client.patch(
            f"{BOARDS}/{board['id']}",
            json={"permissions": {"read": "PUBLIC", "write": "ADMIN"}},
            headers=auth_headers,
        )
        resp = await client.get(board["list_url"])
        assert resp.status_code == 200
        assert resp.json()["data"]["total"] == 1

    async def test_admin_api_unaffected(self, client, auth_headers, board):
        resp = await client.get(f"{BOARDS}/{board['id']}/posts", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["data"]["total"] == 1
