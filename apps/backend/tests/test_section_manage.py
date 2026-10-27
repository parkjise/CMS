"""섹션 추가 · 삭제 + 요금제 섹션 수 한도.

기획서 AD-02 · 3.2 · 오픈 이슈 #6, T-037-A.
"""

import json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from tests.conftest import _TestSession  # type: ignore

_URL = "/api/v1/sections"


async def _sql(sql: str, params: dict | None = None) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(text(sql), params or {})
        await session.commit()


async def _set_plan(tenant_id: str, plan: str) -> None:
    await _sql(
        "UPDATE tenants SET plan_type = :p WHERE id = :t", {"p": plan, "t": tenant_id}
    )


async def _add_sections(tenant_id: str, count: int, start: int = 0) -> None:
    for i in range(count):
        await _sql(
            "INSERT INTO sections (id, tenant_id, section_type, label, display_order,"
            " is_active, page_key, created_at, updated_at) VALUES (:id, :t, 'INTRO',"
            " :label, :o, true, 'home', now(), now())",
            {
                "id": str(uuid.uuid4()),
                "t": tenant_id,
                "label": f"소개 {i}",
                "o": start + i,
            },
        )


@pytest.fixture
async def code_template(test_tenant: dict):
    """테넌트에 코드형 템플릿 적용 상태"""
    template_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO templates (id, template_type, name, css_variables,"
        " section_layouts, is_active, min_plan, renderer, created_at, updated_at)"
        " VALUES (:id, 'HOSPITAL', '코드형', CAST(:css AS jsonb),"
        " CAST(:layouts AS jsonb), true, 'BASIC', 'code', now(), now())",
        {
            "id": template_id,
            "css": json.dumps({}),
            "layouts": json.dumps(["HERO_SLIDER"]),
        },
    )
    await _sql(
        "INSERT INTO tenant_template_overrides (id, tenant_id, template_id,"
        " css_overrides, applied_at, created_at, updated_at)"
        " VALUES (:id, :t, :tpl, '{}'::jsonb, now(), now(), now())",
        {"id": str(uuid.uuid4()), "t": test_tenant["id"], "tpl": template_id},
    )
    yield template_id
    await _sql(
        "DELETE FROM tenant_template_overrides WHERE template_id = :t",
        {"t": template_id},
    )
    await _sql("DELETE FROM templates WHERE id = :t", {"t": template_id})


@pytest.fixture
async def other_tenant_headers():
    """다른 사업체 관리자 토큰 (STANDARD)"""
    tenant_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
        " updated_at) VALUES (:id, '다른 곳', :slug, 'STANDARD', true, now(), now())",
        {"id": tenant_id, "slug": f"other-{tenant_id[:8]}"},
    )
    user_id = uuid.uuid4()
    await _sql(
        "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
        " created_at, updated_at) VALUES (:id, :t, :email, 'x', 'TENANT_ADMIN', true,"
        " now(), now())",
        {"id": str(user_id), "t": tenant_id, "email": f"a@{tenant_id[:8]}.com"},
    )
    token = create_access_token(
        user_id=user_id, tenant_id=uuid.UUID(tenant_id), role="TENANT_ADMIN"
    )
    yield {"Authorization": f"Bearer {token}"}
    await _sql("DELETE FROM users WHERE tenant_id = :id", {"id": tenant_id})
    await _sql("DELETE FROM tenants WHERE id = :id", {"id": tenant_id})


async def _list(client: AsyncClient, headers: dict) -> list[dict]:
    resp = await client.get(_URL, headers=headers)
    return resp.json()["data"]


class TestLimits:
    async def test_requires_auth(self, client: AsyncClient):
        assert (await client.get(f"{_URL}/limits")).status_code == 401

    @pytest.mark.parametrize("plan", ["FREE", "BASIC"])
    async def test_fixed_plans(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict, plan: str
    ):
        await _set_plan(test_tenant["id"], plan)
        data = (await client.get(f"{_URL}/limits", headers=auth_headers)).json()["data"]
        assert data["can_add"] is False
        assert data["can_delete"] is False
        assert "STANDARD" in data["reason"]
        assert data["addable_types"] == []

    async def test_standard_limit_10(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _set_plan(test_tenant["id"], "STANDARD")
        await _add_sections(test_tenant["id"], 3)
        data = (await client.get(f"{_URL}/limits", headers=auth_headers)).json()["data"]
        assert data == {
            **data,
            "plan_type": "STANDARD",
            "count": 3,
            "limit": 10,
            "can_add": True,
            "can_delete": True,
            "reason": None,
        }
        types = {t["section_type"] for t in data["addable_types"]}
        assert types == {
            "HERO_BANNER",
            "INTRO",
            "SERVICES",
            "GALLERY",
            "CONTACT",
            "MAP",
        }

    async def test_premium_unlimited(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _set_plan(test_tenant["id"], "PREMIUM")
        await _add_sections(test_tenant["id"], 12)
        data = (await client.get(f"{_URL}/limits", headers=auth_headers)).json()["data"]
        assert data["limit"] is None
        assert data["can_add"] is True

    async def test_code_template_cannot_add_or_delete(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_tenant: dict,
        code_template: str,
    ):
        await _set_plan(test_tenant["id"], "PREMIUM")
        data = (await client.get(f"{_URL}/limits", headers=auth_headers)).json()["data"]
        assert data["can_add"] is False
        assert data["can_delete"] is False
        assert "숨겨" in data["reason"]


class TestCreate:
    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.post(_URL, json={"section_type": "INTRO"})
        assert resp.status_code == 401

    async def test_adds_at_end_with_starter_content(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _set_plan(test_tenant["id"], "STANDARD")
        await _add_sections(test_tenant["id"], 2)
        resp = await client.post(
            _URL, headers=auth_headers, json={"section_type": "HERO_BANNER"}
        )
        assert resp.status_code == 201
        section = resp.json()["data"]
        assert section["label"] == "메인 배너"
        assert section["display_order"] == 2
        assert section["page_key"] == "home"
        settings = {s["field_key"]: s for s in section["settings"]}
        assert settings["main_title"]["is_sample"] is True
        assert settings["main_title"]["field_value"]

        ids = [s["id"] for s in await _list(client, auth_headers)]
        assert ids[-1] == section["id"]

    async def test_custom_label(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _set_plan(test_tenant["id"], "STANDARD")
        resp = await client.post(
            _URL,
            headers=auth_headers,
            json={"section_type": "GALLERY", "label": "  두 번째 갤러리 "},
        )
        assert resp.json()["data"]["label"] == "두 번째 갤러리"

    async def test_unknown_type_400(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _set_plan(test_tenant["id"], "STANDARD")
        resp = await client.post(
            _URL, headers=auth_headers, json={"section_type": "HERO_SLIDER"}
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    async def test_basic_plan_limit_422(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _set_plan(test_tenant["id"], "BASIC")
        resp = await client.post(
            _URL, headers=auth_headers, json={"section_type": "INTRO"}
        )
        assert resp.status_code == 422
        assert resp.json()["error"]["code"] == "PLAN_LIMIT_EXCEEDED"
        assert await _list(client, auth_headers) == []

    async def test_standard_11th_section_422(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _set_plan(test_tenant["id"], "STANDARD")
        await _add_sections(test_tenant["id"], 9)
        ok = await client.post(_URL, headers=auth_headers, json={"section_type": "MAP"})
        assert ok.status_code == 201
        over = await client.post(
            _URL, headers=auth_headers, json={"section_type": "MAP"}
        )
        assert over.status_code == 422
        assert over.json()["error"]["code"] == "PLAN_LIMIT_EXCEEDED"
        assert "10개" in over.json()["error"]["message"]

    async def test_code_template_422(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_tenant: dict,
        code_template: str,
    ):
        await _set_plan(test_tenant["id"], "PREMIUM")
        resp = await client.post(
            _URL, headers=auth_headers, json={"section_type": "INTRO"}
        )
        assert resp.status_code == 422

    async def test_other_page_sections_not_counted(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _set_plan(test_tenant["id"], "STANDARD")
        await _add_sections(test_tenant["id"], 9)
        await _sql(
            "INSERT INTO sections (id, tenant_id, section_type, label, display_order,"
            " is_active, page_key, created_at, updated_at) VALUES (:id, :t, 'INTRO',"
            " '소개', 0, true, 'about', now(), now())",
            {"id": str(uuid.uuid4()), "t": test_tenant["id"]},
        )
        resp = await client.post(
            _URL, headers=auth_headers, json={"section_type": "INTRO"}
        )
        assert resp.status_code == 201


class TestDelete:
    async def test_requires_auth(self, client: AsyncClient, test_section: dict):
        resp = await client.delete(f"{_URL}/{test_section['id']}")
        assert resp.status_code == 401

    async def test_soft_delete_and_reorder(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _set_plan(test_tenant["id"], "STANDARD")
        await _add_sections(test_tenant["id"], 3)
        before = await _list(client, auth_headers)

        resp = await client.delete(f"{_URL}/{before[0]['id']}", headers=auth_headers)
        assert resp.status_code == 200

        after = await _list(client, auth_headers)
        assert [s["id"] for s in after] == [s["id"] for s in before[1:]]
        assert [s["display_order"] for s in after] == [0, 1]
        # 실제로 지우지 않는다 (소프트 삭제)
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            row = await session.execute(
                text("SELECT deleted_at FROM sections WHERE id = :id"),
                {"id": before[0]["id"]},
            )
            assert row.scalar_one() is not None
        detail = await client.get(f"{_URL}/{before[0]['id']}", headers=auth_headers)
        assert detail.status_code == 404

    async def test_delete_frees_a_slot(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _set_plan(test_tenant["id"], "STANDARD")
        await _add_sections(test_tenant["id"], 10)
        sections = await _list(client, auth_headers)
        blocked = await client.post(
            _URL, headers=auth_headers, json={"section_type": "MAP"}
        )
        assert blocked.status_code == 422
        await client.delete(f"{_URL}/{sections[0]['id']}", headers=auth_headers)
        ok = await client.post(_URL, headers=auth_headers, json={"section_type": "MAP"})
        assert ok.status_code == 201

    async def test_basic_plan_422(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_section: dict,
        test_tenant: dict,
    ):
        await _set_plan(test_tenant["id"], "BASIC")
        resp = await client.delete(f"{_URL}/{test_section['id']}", headers=auth_headers)
        assert resp.status_code == 422
        assert resp.json()["error"]["code"] == "PLAN_LIMIT_EXCEEDED"

    async def test_not_found_404(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _set_plan(test_tenant["id"], "STANDARD")
        resp = await client.delete(f"{_URL}/{uuid.uuid4()}", headers=auth_headers)
        assert resp.status_code == 404

    async def test_other_tenant_cannot_delete(
        self,
        client: AsyncClient,
        auth_headers: dict,
        other_tenant_headers: dict,
        test_section: dict,
    ):
        """RLS 격리 — 다른 사업체 섹션은 없는 것처럼 404, 원래 섹션은 그대로"""
        resp = await client.delete(
            f"{_URL}/{test_section['id']}", headers=other_tenant_headers
        )
        assert resp.status_code == 404
        still = await client.get(f"{_URL}/{test_section['id']}", headers=auth_headers)
        assert still.status_code == 200
