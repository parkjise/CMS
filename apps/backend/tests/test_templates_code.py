"""T-117 코드형 템플릿 · 콘텐츠 모드 테스트 (기획서 11.7 ~ 11.10).

- 적용 content_mode=keep: 콘텐츠 유지 / replace_with_sample: 샘플로 교체 + 롤백 복원
- 샘플로 만든 설정은 is_sample=True, 고객이 저장하면 False
- 공개 사이트 응답: template.code·renderer·styling, section.page_key
- 업종 기본 템플릿 폴백은 테마형만 (코드형은 직접 적용한 테넌트만)
- 다른 테넌트 격리 (RLS)
"""

import json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from tests.conftest import _TestSession  # type: ignore

SAMPLE_CONTENT = {
    "site": {"brand_name": "BAZZAR"},
    "pages": {
        "home": [
            {
                "section_type": "HERO_SLIDER",
                "label": "메인 비주얼",
                "settings": {
                    "slides": [{"title": "샘플 슬라이드", "image_url": "/a.jpg"}]
                },
            },
            {
                "section_type": "INTRO",
                "label": "브랜드 소개",
                "settings": {"title": "샘플 제목", "description": "샘플 설명"},
            },
        ],
        "about": [
            {
                "section_type": "SUB_HERO",
                "label": "소개 상단",
                "settings": {"title": "회사소개"},
            }
        ],
    },
}


async def _super_session():
    session = _TestSession()
    await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    return session


async def _insert_template(
    *,
    code: str | None,
    renderer: str,
    template_type: str = "HOSPITAL",
    sample: dict | None = None,
) -> str:
    tid = str(uuid.uuid4())
    session = await _super_session()
    async with session:
        await session.execute(
            text(
                "INSERT INTO templates "
                "(id, template_type, name, css_variables, section_layouts, is_active,"
                " min_plan, code, renderer, styling, version, sample_content,"
                " created_at, updated_at) "
                "VALUES (:id, :tt, :name, CAST(:css AS jsonb), '[]'::jsonb, true,"
                " 'FREE', :code, :renderer, :styling, '1.0.0',"
                " CAST(:sample AS jsonb), now(), now())"
            ),
            {
                "id": tid,
                "tt": template_type,
                "name": f"{renderer} 템플릿",
                "css": json.dumps({"primary": "#0ea5a0"}),
                "code": code,
                "renderer": renderer,
                "styling": "scss" if renderer == "code" else "tailwind",
                "sample": json.dumps(sample or {}),
            },
        )
        await session.commit()
    return tid


async def _cleanup(tenant_id: str, template_ids: list[str]) -> None:
    session = await _super_session()
    async with session:
        for sql in (
            "DELETE FROM template_change_history WHERE tenant_id = :tid",
            "DELETE FROM tenant_template_overrides WHERE tenant_id = :tid",
        ):
            await session.execute(text(sql), {"tid": tenant_id})
        for template_id in template_ids:
            await session.execute(
                text("DELETE FROM templates WHERE id = :id"), {"id": template_id}
            )
        await session.commit()


@pytest.fixture
async def code_templates(test_tenant: dict):
    code_id = await _insert_template(
        code=f"TPL_TEST_{uuid.uuid4().hex[:6].upper()}",
        renderer="code",
        sample=SAMPLE_CONTENT,
    )
    empty_id = await _insert_template(code=None, renderer="theme")
    yield {"code": code_id, "empty": empty_id}
    await _cleanup(test_tenant["id"], [code_id, empty_id])


async def _sections(client: AsyncClient, headers: dict) -> list[dict]:
    resp = await client.get("/api/v1/sections", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    return data if isinstance(data, list) else data["sections"]


async def _apply(client: AsyncClient, headers: dict, template_id: str, mode=None):
    body: dict = {"template_id": template_id}
    if mode:
        body["content_mode"] = mode
    return await client.post("/api/v1/templates/apply", json=body, headers=headers)


class TestApplyContentMode:
    async def test_keep_is_default_and_preserves_sections(
        self, client: AsyncClient, auth_headers, test_section, code_templates
    ):
        resp = await _apply(client, auth_headers, code_templates["code"])
        assert resp.status_code == 200
        sections = await _sections(client, auth_headers)
        assert [s["id"] for s in sections] == [test_section["id"]]

    async def test_replace_with_sample_copies_sample_sections(
        self, client: AsyncClient, auth_headers, test_section, code_templates
    ):
        resp = await _apply(
            client, auth_headers, code_templates["code"], "replace_with_sample"
        )
        assert resp.status_code == 200

        sections = await _sections(client, auth_headers)
        ids = [s["id"] for s in sections]
        assert test_section["id"] not in ids  # 기존 섹션은 숨김(소프트 삭제)
        by_type = {s["section_type"]: s for s in sections}
        assert set(by_type) == {"HERO_SLIDER", "INTRO", "SUB_HERO"}
        assert by_type["SUB_HERO"]["page_key"] == "about"
        assert by_type["INTRO"]["page_key"] == "home"

        intro = {st["field_key"]: st for st in by_type["INTRO"]["settings"]}
        assert intro["title"]["field_value"] == "샘플 제목"
        assert intro["title"]["is_sample"] is True
        slides = {st["field_key"]: st for st in by_type["HERO_SLIDER"]["settings"]}
        assert slides["slides"]["value_type"] == "JSON"
        assert (
            json.loads(slides["slides"]["field_value"])[0]["title"] == "샘플 슬라이드"
        )

    async def test_rollback_restores_previous_content(
        self, client: AsyncClient, auth_headers, test_section, code_templates
    ):
        await _apply(client, auth_headers, code_templates["empty"])
        await _apply(
            client, auth_headers, code_templates["code"], "replace_with_sample"
        )

        resp = await client.post("/api/v1/templates/rollback", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["data"]["template_id"] == code_templates["empty"]

        sections = await _sections(client, auth_headers)
        assert [s["id"] for s in sections] == [test_section["id"]]

    async def test_first_apply_replace_can_still_restore_content(
        self, client: AsyncClient, auth_headers, test_section, code_templates
    ):
        await _apply(
            client, auth_headers, code_templates["code"], "replace_with_sample"
        )
        resp = await client.post("/api/v1/templates/rollback", headers=auth_headers)
        assert resp.status_code == 200
        sections = await _sections(client, auth_headers)
        assert [s["id"] for s in sections] == [test_section["id"]]

    async def test_replace_without_sample_is_400(
        self, client: AsyncClient, auth_headers, code_templates
    ):
        resp = await _apply(
            client, auth_headers, code_templates["empty"], "replace_with_sample"
        )
        assert resp.status_code == 400

    async def test_invalid_content_mode_is_rejected(
        self, client: AsyncClient, auth_headers, code_templates
    ):
        resp = await _apply(client, auth_headers, code_templates["code"], "overwrite")
        assert resp.status_code in (400, 422)

    async def test_requires_auth(self, client: AsyncClient, code_templates):
        resp = await client.post(
            "/api/v1/templates/apply",
            json={"template_id": code_templates["code"], "content_mode": "keep"},
        )
        assert resp.status_code == 401


class TestSampleFlag:
    async def test_saving_setting_clears_is_sample(
        self, client: AsyncClient, auth_headers, code_templates
    ):
        await _apply(
            client, auth_headers, code_templates["code"], "replace_with_sample"
        )
        intro = next(
            s
            for s in await _sections(client, auth_headers)
            if s["section_type"] == "INTRO"
        )
        resp = await client.patch(
            f"/api/v1/sections/{intro['id']}",
            json={"settings": [{"field_key": "title", "field_value": "우리 제목"}]},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        settings = {s["field_key"]: s for s in resp.json()["data"]["settings"]}
        assert settings["title"]["is_sample"] is False
        assert settings["title"]["field_value"] == "우리 제목"
        # 저장하지 않은 값은 샘플 그대로
        assert settings["description"]["is_sample"] is True


class TestPublicSite:
    async def test_public_site_exposes_code_template_and_page_key(
        self, client: AsyncClient, auth_headers, test_tenant, code_templates
    ):
        await _apply(
            client, auth_headers, code_templates["code"], "replace_with_sample"
        )
        resp = await client.get(f"/api/public/site/{test_tenant['slug']}")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["template"]["renderer"] == "code"
        assert data["template"]["styling"] == "scss"
        assert data["template"]["code"].startswith("TPL_TEST_")
        assert {s["page_key"] for s in data["sections"]} == {"home", "about"}

    async def test_industry_fallback_never_picks_code_template(
        self, client: AsyncClient, test_tenant, code_templates
    ):
        session = await _super_session()
        async with session:
            await session.execute(
                text("UPDATE tenants SET template_type = 'HOSPITAL' WHERE id = :id"),
                {"id": test_tenant["id"]},
            )
            await session.commit()
        resp = await client.get(f"/api/public/site/{test_tenant['slug']}")
        assert resp.status_code == 200
        template = resp.json()["data"]["template"]
        assert template is None or template["renderer"] == "theme"


class TestTenantIsolation:
    async def test_other_tenant_cannot_see_sample_sections(
        self, client: AsyncClient, auth_headers, code_templates
    ):
        await _apply(
            client, auth_headers, code_templates["code"], "replace_with_sample"
        )
        mine = await _sections(client, auth_headers)
        assert len(mine) == 3

        from app.core.security import create_access_token

        other_tenant = uuid.uuid4()
        other_user = uuid.uuid4()
        slug = f"other-{other_tenant.hex[:8]}"
        session = await _super_session()
        async with session:
            await session.execute(
                text(
                    "INSERT INTO tenants (id, name, slug, plan_type, is_active,"
                    " created_at, updated_at) VALUES (:id, '다른 테넌트', :slug,"
                    " 'FREE', true, now(), now())"
                ),
                {"id": str(other_tenant), "slug": slug},
            )
            await session.execute(
                text(
                    "INSERT INTO users (id, tenant_id, email, password_hash, role,"
                    " is_active, created_at, updated_at) VALUES (:id, :tid, :email,"
                    " 'x', 'TENANT_ADMIN', true, now(), now())"
                ),
                {
                    "id": str(other_user),
                    "tid": str(other_tenant),
                    "email": f"a@{slug}.com",
                },
            )
            await session.commit()
        try:
            token = create_access_token(
                user_id=other_user, tenant_id=other_tenant, role="TENANT_ADMIN"
            )
            other = await _sections(client, {"Authorization": f"Bearer {token}"})
            assert other == []
            resp = await client.get(
                f"/api/v1/sections/{mine[0]['id']}",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code in (403, 404)
        finally:
            session = await _super_session()
            async with session:
                await session.execute(
                    text("DELETE FROM users WHERE tenant_id = :id"),
                    {"id": str(other_tenant)},
                )
                await session.execute(
                    text("DELETE FROM tenants WHERE id = :id"),
                    {"id": str(other_tenant)},
                )
                await session.commit()
