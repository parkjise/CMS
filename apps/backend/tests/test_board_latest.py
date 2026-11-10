"""메인 화면 최신 글 섹션 — 게시판 · 개수 저장 (T-185, 게시판 모듈 기획서 2.2)."""

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text

from app.core.security import create_access_token
from app.services import feature as feature_service
from app.services import site_cache
from tests.conftest import _TestSession  # type: ignore

BOARDS = "/api/v1/boards"
SECTIONS = "/api/v1/sections"


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


async def _board(client, headers, slug: str) -> dict:
    resp = await client.post(
        BOARDS, json={"name": f"{slug} 게시판", "slug": slug}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _section(tenant_id: str, section_type: str) -> str:
    section_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO sections (id, tenant_id, section_type, label, display_order,"
        " page_key, is_active, created_at, updated_at)"
        " VALUES (:id, :t, :type, '최신', 0, 'home', true, now(), now())",
        id=section_id,
        t=tenant_id,
        type=section_type,
    )
    return section_id


async def _save(client, headers, section_id: str, **values: str):
    return await client.patch(
        f"{SECTIONS}/{section_id}",
        json={
            "settings": [
                {"field_key": k, "field_value": v, "value_type": "STRING"}
                for k, v in values.items()
            ]
        },
        headers=headers,
    )


def _settings(resp) -> dict[str, dict]:
    return {s["field_key"]: s for s in resp.json()["data"]["settings"]}


@pytest.fixture
async def other_board(client) -> AsyncIterator[dict]:
    """다른 사업체의 게시판"""
    tenant_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
        " updated_at) VALUES (:id, '다른 곳', :slug, 'STANDARD', true, now(), now())",
        id=tenant_id,
        slug=f"other-{tenant_id[:8]}",
    )
    user_id = uuid.uuid4()
    await _sql(
        "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
        " created_at, updated_at) VALUES (:id, :t, :email, 'x', 'TENANT_ADMIN', true,"
        " now(), now())",
        id=str(user_id),
        t=tenant_id,
        email=f"a@{tenant_id[:8]}.com",
    )
    token = create_access_token(
        user_id=user_id, tenant_id=uuid.UUID(tenant_id), role="TENANT_ADMIN"
    )
    board = await _board(client, {"Authorization": f"Bearer {token}"}, "theirs")
    yield board
    await _sql("DELETE FROM boards WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM audit_logs WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM users WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM tenants WHERE id = :t", t=tenant_id)


class TestAddSection:
    async def test_addable_and_starts_without_board(self, client, auth_headers, tenant):
        limits = (await client.get(f"{SECTIONS}/limits", headers=auth_headers)).json()
        assert {"section_type": "BOARD_LATEST", "label": "최신 글"} in limits["data"][
            "addable_types"
        ]
        resp = await client.post(
            SECTIONS, json={"section_type": "BOARD_LATEST"}, headers=auth_headers
        )
        assert resp.status_code == 201, resp.text
        settings = _settings(resp)
        assert settings["section_title"]["field_value"] == "최신 글"
        # 게시판은 고객이 고른다 — 고르기 전에는 홈페이지에 보이지 않는다
        assert "latest_board" not in settings


class TestSaveSettings:
    async def test_saves_board_and_count(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, "news")
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(
            client,
            auth_headers,
            section_id,
            latest_board=f" {board['id']} ",
            post_count="6",
        )
        assert resp.status_code == 200, resp.text
        settings = _settings(resp)
        assert settings["latest_board"]["field_value"] == board["id"]
        assert settings["post_count"]["field_value"] == "6"
        assert settings["post_count"]["value_type"] == "INTEGER"

    async def test_empty_board_allowed(self, client, auth_headers, tenant):
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(
            client, auth_headers, section_id, latest_board="", post_count=""
        )
        assert resp.status_code == 200
        assert _settings(resp)["latest_board"]["field_value"] == ""

    @pytest.mark.parametrize("count", ["2", "9", "다섯"])
    async def test_count_range(self, client, auth_headers, tenant, count):
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(client, auth_headers, section_id, post_count=count)
        assert resp.status_code == 400
        assert "3~8" in resp.json()["error"]["message"]

    @pytest.mark.parametrize("value", ["not-a-uuid", str(uuid.uuid4())])
    async def test_unknown_board(self, client, auth_headers, tenant, value):
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(client, auth_headers, section_id, latest_board=value)
        assert resp.status_code == 400
        assert "게시판" in resp.json()["error"]["message"]

    async def test_other_tenant_board(self, client, auth_headers, tenant, other_board):
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(
            client, auth_headers, section_id, latest_board=other_board["id"]
        )
        assert resp.status_code == 400

    async def test_deleted_board(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, "gone")
        await _sql("UPDATE boards SET deleted_at = now() WHERE id = :b", b=board["id"])
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(client, auth_headers, section_id, latest_board=board["id"])
        assert resp.status_code == 400

    async def test_member_only_board(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, "members")
        await _sql(
            "UPDATE boards SET settings = jsonb_set(coalesce(settings, '{}'::jsonb),"
            ' \'{permissions}\', \'{"read": "MEMBER", "write": "ADMIN"}\')'
            " WHERE id = :b",
            b=board["id"],
        )
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(client, auth_headers, section_id, latest_board=board["id"])
        assert resp.status_code == 400
        assert "회원만" in resp.json()["error"]["message"]

    async def test_code_template_notice_section(self, client, auth_headers, tenant):
        """코드형 최신 공지도 같은 칸으로 다른 게시판을 고른다"""
        board = await _board(client, auth_headers, "events")
        section_id = await _section(tenant["id"], "NOTICE_LATEST")
        resp = await _save(client, auth_headers, section_id, latest_board=board["id"])
        assert resp.status_code == 200
        resp = await _save(client, auth_headers, section_id, post_count="1")
        assert resp.status_code == 400

    async def test_other_sections_untouched(self, client, auth_headers, tenant):
        section_id = await _section(tenant["id"], "INTRO")
        resp = await _save(client, auth_headers, section_id, post_count="1")
        assert resp.status_code == 200
