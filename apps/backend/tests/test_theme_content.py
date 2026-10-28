"""테마형 템플릿으로 바꿔도 홈이 비지 않게 (T-055-A).

코드형 템플릿(하스피털 A)용 내용은 칸 이름이 달라 테마형 섹션이 읽지 못한다.
테마형 적용(내용 유지) 시 빠진 종류만 시작 문구로 채우고, 되돌리면 추가분만 정리한다.
"""

import json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from tests.conftest import _TestSession  # type: ignore

_APPLY = "/api/v1/templates/apply"
_ROLLBACK = "/api/v1/templates/rollback"


async def _sql(sql: str, params: dict | None = None) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(text(sql), params or {})
        await session.commit()


async def _section(tenant_id: str, stype: str, settings: dict, page="home") -> str:
    sid = str(uuid.uuid4())
    await _sql(
        "INSERT INTO sections (id, tenant_id, section_type, label, display_order,"
        " is_active, page_key, created_at, updated_at) VALUES (:id, :t, :st, :st, 0,"
        " true, :p, now(), now())",
        {"id": sid, "t": tenant_id, "st": stype, "p": page},
    )
    for key, value in settings.items():
        await _sql(
            "INSERT INTO section_settings (id, tenant_id, section_id, field_key,"
            " field_value, value_type, created_at, updated_at) VALUES (:id, :t, :s,"
            " :k, :v, 'STRING', now(), now())",
            {"id": str(uuid.uuid4()), "t": tenant_id, "s": sid, "k": key, "v": value},
        )
    return sid


@pytest.fixture
async def theme_template(test_tenant: dict):
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t",
        {"t": test_tenant["id"]},
    )
    tid = str(uuid.uuid4())
    await _sql(
        "INSERT INTO templates (id, template_type, name, css_variables,"
        " section_layouts, is_active, min_plan, created_at, updated_at) VALUES"
        " (:id, 'GENERAL', '일반 테스트', '{}'::jsonb, CAST(:l AS jsonb), true,"
        " 'BASIC', now(), now())",
        {
            "id": tid,
            "l": json.dumps(["HERO_BANNER", "INTRO", "SERVICES", "TEAM", "CONTACT"]),
        },
    )
    yield tid
    await _sql("DELETE FROM template_change_history WHERE template_id = :t", {"t": tid})
    await _sql(
        "DELETE FROM tenant_template_overrides WHERE template_id = :t", {"t": tid}
    )
    await _sql("DELETE FROM templates WHERE id = :t", {"t": tid})


async def _home(client: AsyncClient, headers: dict) -> list[dict]:
    data = (await client.get("/api/v1/sections", headers=headers)).json()["data"]
    return [s for s in data if (s.get("page_key") or "home") == "home"]


class TestThemeApplyFillsHome:
    async def test_code_content_gets_theme_starter_sections(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_tenant: dict,
        theme_template: str,
    ):
        """하스피털 A 식 내용 → 테마형 적용 시 배너·소개·서비스·문의 (팀 제외)"""
        t = test_tenant["id"]
        await _section(t, "HERO_SLIDER", {"slides": "[]"})
        code_intro = await _section(
            t, "INTRO", {"title": "브랜드", "description": "글"}
        )
        await _section(t, "INTRO", {"title": "회사소개"}, page="about")

        resp = await client.post(
            _APPLY, headers=auth_headers, json={"template_id": theme_template}
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["added_section_count"] == 4

        home = await _home(client, auth_headers)
        added = [
            s
            for s in home
            if s["section_type"] != "HERO_SLIDER" and s["id"] != code_intro
        ]
        assert sorted(s["section_type"] for s in added) == [
            "CONTACT",
            "HERO_BANNER",
            "INTRO",
            "SERVICES",
        ]
        # 시작 문구 · 샘플 표시
        hero = next(s for s in added if s["section_type"] == "HERO_BANNER")
        main_title = next(x for x in hero["settings"] if x["field_key"] == "main_title")
        assert main_title["field_value"] and main_title["is_sample"] is True
        # 기존 코드형 내용은 그대로
        assert any(s["id"] == code_intro for s in home)

    async def test_theme_content_already_ok_adds_nothing(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_tenant: dict,
        theme_template: str,
    ):
        t = test_tenant["id"]
        await _section(t, "HERO_BANNER", {"main_title": "우리 가게"})
        await _section(t, "INTRO", {"intro_text": "소개"})
        await _section(t, "SERVICES", {"section_title": "서비스"})
        await _section(t, "CONTACT", {})  # 문의 폼은 값이 없어도 그려진다

        resp = await client.post(
            _APPLY, headers=auth_headers, json={"template_id": theme_template}
        )
        assert resp.json()["data"]["added_section_count"] == 0
        assert len(await _home(client, auth_headers)) == 4

    async def test_empty_section_is_filled_not_duplicated(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_tenant: dict,
        theme_template: str,
    ):
        t = test_tenant["id"]
        empty_hero = await _section(t, "HERO_BANNER", {})
        await client.post(
            _APPLY, headers=auth_headers, json={"template_id": theme_template}
        )
        heroes = [
            s
            for s in await _home(client, auth_headers)
            if s["section_type"] == "HERO_BANNER"
        ]
        assert [h["id"] for h in heroes] == [empty_hero]
        keys = {x["field_key"] for x in heroes[0]["settings"]}
        assert "main_title" in keys

    async def test_rollback_removes_added_sections_only(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_tenant: dict,
        theme_template: str,
    ):
        t = test_tenant["id"]
        slider = await _section(t, "HERO_SLIDER", {"slides": "[]"})
        resp = await client.post(
            _APPLY, headers=auth_headers, json={"template_id": theme_template}
        )
        assert resp.json()["data"]["added_section_count"] == 4

        rb = await client.post(_ROLLBACK, headers=auth_headers)
        assert rb.status_code == 200, rb.text
        assert [s["id"] for s in await _home(client, auth_headers)] == [slider]
