"""관리자 개인 화면 설정 — 게시판 글 표 열 순서 · 크기 서버 저장 (T-181)."""

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text

from app.core.security import create_access_token
from app.db.session import set_rls_context
from app.services import feature as feature_service
from tests.conftest import _TestSession  # type: ignore
from tests.test_rls_enforcement import _app_session  # type: ignore

BOARDS = "/api/v1/boards"
PREFS = "/api/v1/me/preferences/post-table"
LAYOUT = {"order": ["f2", "f1"], "sizes": {"f1": "wide", "f2": "narrow"}}


async def _sql(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        rows = result.fetchall() if result.returns_rows else None
        await s.commit()
    return rows


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
        BOARDS, json={"name": "후기", "slug": "reviews"}, headers=auth_headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _user_headers(tenant_id: str, role: str = "TENANT_ADMIN") -> dict:
    """같은 사업체의 다른 계정."""
    user_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
        " created_at, updated_at) VALUES (:id, :t, :e, 'x', :r, true, now(), now())",
        id=user_id,
        t=tenant_id,
        e=f"{user_id[:8]}@example.com",
        r=role,
    )
    token = create_access_token(
        user_id=uuid.UUID(user_id), tenant_id=uuid.UUID(tenant_id), role=role
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def other_tenant_headers() -> AsyncIterator[dict]:
    tenant_id = str(uuid.uuid4())
    slug = f"other-{tenant_id[:8]}"
    await _sql(
        "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
        " updated_at) VALUES (:id, :s, :s, 'PREMIUM', true, now(), now())",
        id=tenant_id,
        s=slug,
    )
    yield await _user_headers(tenant_id)
    await _sql("DELETE FROM users WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM tenants WHERE id = :t", t=tenant_id)


class TestPostTableLayout:
    async def test_empty_then_save_and_read(self, client, auth_headers, board):
        url = f"{PREFS}/{board['id']}"
        empty = await client.get(url, headers=auth_headers)
        assert empty.status_code == 200
        assert empty.json()["data"] is None
        saved = await client.put(url, json=LAYOUT, headers=auth_headers)
        assert saved.status_code == 200, saved.text
        assert saved.json()["data"]["order"] == ["f2", "f1"]
        got = (await client.get(url, headers=auth_headers)).json()["data"]
        assert {k: got[k] for k in ("order", "sizes")} == LAYOUT
        assert got["updated_at"]
        # 다시 저장하면 덮어쓴다
        await client.put(url, json={"order": ["f1"], "sizes": {}}, headers=auth_headers)
        got = (await client.get(url, headers=auth_headers)).json()["data"]
        assert (got["order"], got["sizes"]) == (["f1"], {})

    async def test_reset_then_save_again(self, client, auth_headers, board):
        url = f"{PREFS}/{board['id']}"
        await client.put(url, json=LAYOUT, headers=auth_headers)
        reset = await client.delete(url, headers=auth_headers)
        assert reset.json()["data"] == {"reset": True}
        assert (await client.get(url, headers=auth_headers)).json()["data"] is None
        again = await client.delete(url, headers=auth_headers)
        assert again.json()["data"] == {"reset": False}
        # 소프트 삭제한 행을 되살린다 — 행은 하나
        await client.put(url, json=LAYOUT, headers=auth_headers)
        got = (await client.get(url, headers=auth_headers)).json()["data"]
        assert got["order"] == ["f2", "f1"]
        rows = await _sql(
            "SELECT count(*) FROM admin_user_preferences WHERE key = :k",
            k=f"post_table:{board['id']}",
        )
        assert rows and rows[0][0] == 1

    async def test_each_account_and_board_separate(
        self, client, auth_headers, tenant, board
    ):
        url = f"{PREFS}/{board['id']}"
        await client.put(url, json=LAYOUT, headers=auth_headers)
        colleague = await _user_headers(tenant["id"])
        assert (await client.get(url, headers=colleague)).json()["data"] is None
        second = (
            await client.post(
                BOARDS, json={"name": "공지2", "slug": "news"}, headers=auth_headers
            )
        ).json()["data"]
        other_url = f"{PREFS}/{second['id']}"
        assert (await client.get(other_url, headers=auth_headers)).json()[
            "data"
        ] is None

    @pytest.mark.parametrize(
        "payload",
        [
            {"order": ["a", "a"], "sizes": {}},
            {"order": [f"f{i}" for i in range(21)], "sizes": {}},
            {"order": [], "sizes": {"a": "huge"}},
            {"order": [], "sizes": {f"f{i}": "wide" for i in range(21)}},
            {"order": [""], "sizes": {}},
            {"order": ["a" * 201], "sizes": {}},
            {"order": [], "sizes": {}, "label": "글 값"},
            {"order": "a", "sizes": {}},
        ],
    )
    async def test_invalid_payload(self, client, auth_headers, board, payload):
        resp = await client.put(
            f"{PREFS}/{board['id']}", json=payload, headers=auth_headers
        )
        assert resp.status_code in (400, 422), resp.text

    async def test_unknown_or_other_tenant_board_404(
        self, client, auth_headers, other_tenant_headers, board
    ):
        url = f"{PREFS}/{board['id']}"
        unknown = f"{PREFS}/{uuid.uuid4()}"
        assert (await client.get(unknown, headers=auth_headers)).status_code == 404
        assert (
            await client.put(unknown, json=LAYOUT, headers=auth_headers)
        ).status_code == 404
        for method in ("get", "delete"):
            resp = await getattr(client, method)(url, headers=other_tenant_headers)
            assert resp.status_code == 404
        resp = await client.put(url, json=LAYOUT, headers=other_tenant_headers)
        assert resp.status_code == 404

    async def test_requires_login(self, client, board):
        assert (await client.get(f"{PREFS}/{board['id']}")).status_code == 401

    async def test_viewer_can_save_own_view(self, client, tenant, board):
        viewer = await _user_headers(tenant["id"], role="TENANT_VIEWER")
        url = f"{PREFS}/{board['id']}"
        resp = await client.put(url, json=LAYOUT, headers=viewer)
        assert resp.status_code == 200, resp.text
        assert (await client.delete(url, headers=viewer)).status_code == 200
        # 다른 쓰기는 여전히 막힌다
        resp = await client.post(
            BOARDS, json={"name": "x", "slug": "xx"}, headers=viewer
        )
        assert resp.status_code == 403

    async def test_rls_isolation(self, client, auth_headers, tenant, board):
        await client.put(f"{PREFS}/{board['id']}", json=LAYOUT, headers=auth_headers)
        count = text("SELECT count(*) FROM admin_user_preferences WHERE key = :k")
        key = {"k": f"post_table:{board['id']}"}
        async with _app_session() as db:
            await set_rls_context(db, uuid.UUID(tenant["id"]))
            own = (await db.execute(count, key)).scalar_one()
        async with _app_session() as db:
            await set_rls_context(db, uuid.uuid4())
            others = (await db.execute(count, key)).scalar_one()
        assert (own, others) == (1, 0)
