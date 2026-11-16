"""게시판을 2단계 메뉴(페이지 묶음 아래)에 넣기 (T-216, 1113 #3)."""

import json
import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text

from app.services import board_menu, site_cache
from app.services import feature as feature_service
from app.services import site_settings as site_settings_service
from tests.conftest import _TestSession

BOARDS = "/api/v1/boards"
_CODE = "TPL_TEST_PARENT"
_PAGES = [
    {"key": "about", "title": "회사소개"},
    {"key": "business", "title": "사업영역"},
]


async def _sql(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        row = result.first() if result.returns_rows else None
        await s.commit()
    return row


@pytest.fixture(autouse=True)
def no_purge(monkeypatch) -> None:
    async def fake(_db, _tenant_id):
        return True

    monkeypatch.setattr(site_cache, "purge_site", fake)


@pytest.fixture
async def tenant(test_tenant, test_user) -> AsyncIterator[dict]:
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t", t=test_tenant["id"]
    )
    await feature_service.invalidate_cache(test_tenant["id"])
    yield test_tenant
    await _sql("DELETE FROM audit_logs WHERE tenant_id = :t", t=test_tenant["id"])
    await feature_service.invalidate_cache(test_tenant["id"])


@pytest.fixture
async def code_template(tenant, monkeypatch) -> AsyncIterator[str]:
    template_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO templates (id, template_type, name, css_variables,"
        " section_layouts, is_active, min_plan, renderer, code, created_at,"
        " updated_at) VALUES (:id, 'HOSPITAL', '묶음 테스트', '{}'::jsonb,"
        " CAST(:layouts AS jsonb), true, 'BASIC', 'code', :code, now(), now())",
        id=template_id,
        layouts=json.dumps([]),
        code=f"{_CODE}_{template_id[:8]}",
    )
    await _sql(
        "INSERT INTO tenant_template_overrides (id, tenant_id, template_id,"
        " css_overrides, applied_at, created_at, updated_at)"
        " VALUES (gen_random_uuid(), :t, :tpl, '{}'::jsonb, now(), now(), now())",
        t=tenant["id"],
        tpl=template_id,
    )

    def pages(code: str) -> list[dict]:
        return _PAGES if code.startswith(_CODE) else []

    monkeypatch.setattr(board_menu, "load_menu", pages)
    monkeypatch.setattr(site_settings_service, "load_menu", pages)
    yield template_id
    await _sql(
        "DELETE FROM tenant_template_overrides WHERE template_id = :t", t=template_id
    )
    await _sql("DELETE FROM templates WHERE id = :t", t=template_id)


async def _board(client, headers) -> dict:
    resp = await client.post(
        BOARDS, json={"name": "보도자료", "slug": "press"}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _set_parent(client, headers, board_id: str, key: str):
    return await client.patch(
        f"{BOARDS}/{board_id}", json={"menu_parent": key}, headers=headers
    )


class TestMenuParent:
    async def test_options_from_code_template(
        self, client, auth_headers, code_template
    ):
        resp = await client.get(f"{BOARDS}/menu-parents", headers=auth_headers)
        assert resp.json()["data"] == _PAGES

    async def test_theme_has_no_options(self, client, auth_headers, tenant):
        resp = await client.get(f"{BOARDS}/menu-parents", headers=auth_headers)
        assert resp.json()["data"] == []

    async def test_save_moves_board_out_of_top_menu(
        self, client, auth_headers, tenant, code_template
    ):
        board = await _board(client, auth_headers)
        menu_key = f"board:{board['id']}"
        menu = await client.get("/api/v1/site-settings/menu", headers=auth_headers)
        assert menu_key in [i["key"] for i in menu.json()["data"]["items"]]

        resp = await _set_parent(client, auth_headers, board["id"], "about")
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["menu_parent"] == "about"
        # 상단 메뉴 후보에서 빠진다 — 회사소개 하위 탭에 나온다
        menu = await client.get("/api/v1/site-settings/menu", headers=auth_headers)
        assert menu_key not in [i["key"] for i in menu.json()["data"]["items"]]
        # 공개 사이트 응답에 묶음 키
        site = (await client.get(f"/api/public/site/{tenant['slug']}")).json()["data"]
        public = next(b for b in site["boards"] if b["id"] == board["id"])
        assert public["menu_parent"] == "about"

        # "" 이면 다시 상단 메뉴
        resp = await _set_parent(client, auth_headers, board["id"], "")
        assert resp.json()["data"]["menu_parent"] == ""
        menu = await client.get("/api/v1/site-settings/menu", headers=auth_headers)
        assert menu_key in [i["key"] for i in menu.json()["data"]["items"]]

    async def test_unknown_parent_400(self, client, auth_headers, code_template):
        board = await _board(client, auth_headers)
        resp = await _set_parent(client, auth_headers, board["id"], "careers")
        assert resp.status_code == 400
        assert "지금 템플릿에 없는 메뉴" in resp.json()["error"]["message"]

    async def test_theme_template_400(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers)
        resp = await _set_parent(client, auth_headers, board["id"], "about")
        assert resp.status_code == 400
        assert "상단 메뉴만" in resp.json()["error"]["message"]

    @pytest.mark.parametrize("key", ["About", "../x", "a" * 41, "-about"])
    async def test_bad_format_400(self, client, auth_headers, code_template, key):
        board = await _board(client, auth_headers)
        resp = await _set_parent(client, auth_headers, board["id"], key)
        assert resp.status_code == 400

    async def test_default_is_top_menu(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers)
        assert board["menu_parent"] == ""
