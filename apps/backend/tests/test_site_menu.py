"""상단 메뉴 설정 (T-036-B, 기획서 AD-02-A 공통 설정)."""

import json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.data.template_samples import load_menu
from app.services import site_settings as site_settings_service
from tests.conftest import _TestSession  # type: ignore

_URL = "/api/v1/site-settings/menu"
_CODE = "TPL_TEST_MENU"
_PAGES = [
    {"key": "about", "title": "회사소개"},
    {"key": "business", "title": "사업영역"},
    {"key": "notice", "title": "공지사항"},
]


async def _sql(sql: str, params: dict | None = None) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(text(sql), params or {})
        await session.commit()


async def _add_section(tenant_id: str, stype: str, label: str, order: int, **kw) -> str:
    sid = str(uuid.uuid4())
    await _sql(
        "INSERT INTO sections (id, tenant_id, section_type, label, display_order,"
        " is_active, page_key, created_at, updated_at)"
        " VALUES (:id, :t, :ty, :l, :o, :a, :p, now(), now())",
        {
            "id": sid,
            "t": tenant_id,
            "ty": stype,
            "l": label,
            "o": order,
            "a": kw.get("active", True),
            "p": kw.get("page", "home"),
        },
    )
    return sid


@pytest.fixture
async def theme_sections(test_tenant: dict):
    tid = test_tenant["id"]
    ids = [
        await _add_section(tid, "HERO_BANNER", "메인", 1),
        await _add_section(tid, "INTRO", "소개", 2),
        await _add_section(tid, "GALLERY", "꺼진 갤러리", 3, active=False),
        await _add_section(tid, "INTRO", "다른 페이지", 4, page="about"),
        await _add_section(tid, "HERO_SLIDER", "슬라이더", 5),
    ]
    yield ids
    await _sql("DELETE FROM sections WHERE tenant_id = :t", {"t": tid})


@pytest.fixture
async def code_template(test_tenant: dict, monkeypatch):
    template_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO templates (id, template_type, name, css_variables,"
        " section_layouts, is_active, min_plan, renderer, code, created_at, updated_at)"
        " VALUES (:id, 'HOSPITAL', '메뉴 테스트', CAST(:css AS jsonb),"
        " CAST(:layouts AS jsonb), true, 'BASIC', 'code', :code, now(), now())",
        {
            "id": template_id,
            "css": json.dumps({}),
            "layouts": json.dumps(["HERO_SLIDER"]),
            "code": f"{_CODE}_{template_id[:8]}",
        },
    )
    await _sql(
        "INSERT INTO tenant_template_overrides (id, tenant_id, template_id,"
        " css_overrides, applied_at, created_at, updated_at)"
        " VALUES (:id, :t, :tpl, '{}'::jsonb, now(), now(), now())",
        {"id": str(uuid.uuid4()), "t": test_tenant["id"], "tpl": template_id},
    )
    monkeypatch.setattr(
        site_settings_service,
        "load_menu",
        lambda code: _PAGES if code.startswith(_CODE) else [],
    )
    yield template_id
    await _sql(
        "DELETE FROM tenant_template_overrides WHERE template_id = :t",
        {"t": template_id},
    )
    await _sql("DELETE FROM templates WHERE id = :t", {"t": template_id})


def test_hospital_a_menu_file():
    menu = load_menu("TPL_HOSPITAL_A")
    assert [m["key"] for m in menu] == ["about", "business", "notice", "consult"]
    assert load_menu("TPL_NOT_THERE") == []


class TestThemeMenu:
    async def test_candidates_are_active_home_theme_sections(
        self, client: AsyncClient, auth_headers: dict, theme_sections: list
    ):
        resp = await client.get(_URL, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["mode"] == "theme" and data["reorderable"] is False
        # 꺼진 섹션 · 다른 페이지 · 테마형이 못 그리는 섹션은 빠진다
        assert [i["default_label"] for i in data["items"]] == ["메인", "소개"]
        assert all(i["visible"] and i["label"] is None for i in data["items"])

    async def test_rename_hide_and_public(
        self,
        client: AsyncClient,
        auth_headers: dict,
        theme_sections: list,
        test_tenant: dict,
    ):
        hero, intro = theme_sections[0], theme_sections[1]
        resp = await client.put(
            _URL,
            json={
                "items": [
                    {"key": intro, "label": "  병원 소개 ", "visible": True},
                    {"key": hero, "label": "", "visible": False},
                ]
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        items = resp.json()["data"]["items"]
        # 테마형은 섹션 순서를 따른다 — 보낸 순서와 상관없이
        assert [i["key"] for i in items] == [hero, intro]
        assert items[0]["visible"] is False and items[0]["label"] is None
        assert items[1]["label"] == "병원 소개"

        pub = await client.get(f"/api/public/site/{test_tenant['slug']}")
        saved = pub.json()["data"]["site_settings"]["menu_items"]
        assert {"key": intro, "label": "병원 소개", "visible": True} in saved

    async def test_new_section_appears_with_defaults(
        self,
        client: AsyncClient,
        auth_headers: dict,
        theme_sections: list,
        test_tenant: dict,
    ):
        await client.put(
            _URL,
            json={
                "items": [{"key": theme_sections[0], "label": "홈", "visible": True}]
            },
            headers=auth_headers,
        )
        await _add_section(test_tenant["id"], "MAP", "오시는 길", 9)
        items = (await client.get(_URL, headers=auth_headers)).json()["data"]["items"]
        assert [i["default_label"] for i in items] == ["메인", "소개", "오시는 길"]
        assert items[2]["visible"] is True

    async def test_validation(
        self, client: AsyncClient, auth_headers: dict, theme_sections: list
    ):
        hero = theme_sections[0]
        unknown = await client.put(
            _URL,
            json={"items": [{"key": "nope", "visible": True}]},
            headers=auth_headers,
        )
        assert unknown.status_code == 400
        dup = await client.put(
            _URL,
            json={"items": [{"key": hero}, {"key": hero}]},
            headers=auth_headers,
        )
        assert dup.status_code == 400
        long = await client.put(
            _URL,
            json={"items": [{"key": hero, "label": "가" * 21}]},
            headers=auth_headers,
        )
        assert long.status_code == 400
        assert "20자" in long.json()["error"]["message"]

    async def test_unauthenticated(self, client: AsyncClient):
        assert (await client.get(_URL)).status_code == 401


class TestCodeMenu:
    async def test_code_template_pages_reorder_and_keep_others(
        self,
        client: AsyncClient,
        auth_headers: dict,
        theme_sections: list,
        code_template: str,
    ):
        data = (await client.get(_URL, headers=auth_headers)).json()["data"]
        assert data["mode"] == "code" and data["reorderable"] is True
        assert [i["key"] for i in data["items"]] == ["about", "business", "notice"]

        resp = await client.put(
            _URL,
            json={
                "items": [
                    {"key": "business", "label": "진료과목", "visible": True},
                    {"key": "about", "visible": True},
                    {"key": "notice", "visible": False},
                ]
            },
            headers=auth_headers,
        )
        items = resp.json()["data"]["items"]
        assert [i["key"] for i in items] == ["business", "about", "notice"]
        assert items[0]["label"] == "진료과목" and items[2]["visible"] is False
        # 테마형 섹션 key 는 코드형에서 받지 않는다
        bad = await client.put(
            _URL, json={"items": [{"key": theme_sections[0]}]}, headers=auth_headers
        )
        assert bad.status_code == 400

    async def test_switching_template_keeps_saved_values(
        self,
        client: AsyncClient,
        auth_headers: dict,
        theme_sections: list,
        code_template: str,
    ):
        await client.put(
            _URL,
            json={"items": [{"key": "business", "label": "진료과목", "visible": True}]},
            headers=auth_headers,
        )
        # 테마형으로 돌아가 테마 메뉴를 저장해도 코드형 값은 남는다
        await _sql(
            "DELETE FROM tenant_template_overrides WHERE template_id = :t",
            {"t": code_template},
        )
        await client.put(
            _URL,
            json={
                "items": [{"key": theme_sections[0], "label": "홈", "visible": True}]
            },
            headers=auth_headers,
        )
        saved = (
            await client.get("/api/v1/site-settings", headers=auth_headers)
        ).json()["data"]
        assert saved is not None
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            raw = (
                await session.execute(
                    text("SELECT menu_items FROM site_settings WHERE tenant_id = :t"),
                    {"t": saved["tenant_id"]},
                )
            ).scalar_one()
        keys = {i["key"] for i in raw}
        assert "business" in keys and theme_sections[0] in keys
