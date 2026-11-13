"""T-208 슈퍼 어드민 템플릿 관리 (상위 기획서 14.1 · 10.2 #12)."""

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from tests.conftest import _TestSession

URL = "/api/super/v1/templates"
CSS = {"primary": "#2563eb", "background": "#ffffff"}


async def _sql(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        row = result.first() if result.returns_rows else None
        await s.commit()
    return row


@pytest.fixture
async def super_headers() -> AsyncIterator[dict]:
    user_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
        " created_at, updated_at)"
        " VALUES (:id, NULL, :e, 'x', 'SUPER_ADMIN', true, now(), now())",
        id=user_id,
        e=f"sa-{user_id[:6]}@cms.io",
    )
    token = create_access_token(
        user_id=uuid.UUID(user_id),
        tenant_id=None,
        role="SUPER_ADMIN",
        is_super_admin=True,
    )
    yield {"Authorization": f"Bearer {token}"}
    await _sql("DELETE FROM audit_logs WHERE actor_id = :id", id=user_id)
    await _sql("DELETE FROM users WHERE id = :id", id=user_id)


@pytest.fixture
async def made() -> AsyncIterator[list[str]]:
    """테스트에서 만든 템플릿 이름 — 끝나면 지운다."""
    names: list[str] = []
    yield names
    for name in names:
        await _sql(
            "DELETE FROM tenant_template_overrides WHERE template_id IN"
            " (SELECT id FROM templates WHERE name = :n)",
            n=name,
        )
        await _sql("DELETE FROM templates WHERE name = :n", n=name)


async def _create(client, headers, made, **body) -> dict:
    name = body.pop("name", f"테스트 {uuid.uuid4().hex[:6]}")
    made.append(name)
    resp = await client.post(
        URL, headers=headers, json={"name": name, "css_variables": CSS, **body}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


class TestList:
    async def test_lists_hidden_with_usage(
        self, client: AsyncClient, super_headers, made, test_tenant
    ):
        created = await _create(client, super_headers, made)
        await _sql(
            "INSERT INTO tenant_template_overrides (id, tenant_id, template_id,"
            " css_overrides, applied_at, created_at, updated_at)"
            " VALUES (gen_random_uuid(), :t, :tpl, '{}', now(), now(), now())",
            t=test_tenant["id"],
            tpl=created["id"],
        )
        items = (await client.get(URL, headers=super_headers)).json()["data"]
        mine = next(t for t in items if t["id"] == created["id"])
        assert mine["is_active"] is False  # 새로 만든 것은 숨김
        assert mine["usage_count"] == 1
        await _sql(
            "DELETE FROM tenant_template_overrides WHERE tenant_id = :t",
            t=test_tenant["id"],
        )

    async def test_tenant_admin_403(self, client, auth_headers):
        assert (await client.get(URL, headers=auth_headers)).status_code == 403

    async def test_unauthenticated_401(self, client):
        assert (await client.get(URL)).status_code == 401


class TestCreate:
    async def test_theme_template_with_css_from_base(self, client, super_headers, made):
        base = await _create(
            client, super_headers, made, css_variables={"accent": "#f00"}
        )
        created = await _create(
            client,
            super_headers,
            made,
            base_template_id=base["id"],
            template_type="PENSION",
            min_plan="STANDARD",
        )
        assert created["renderer"] == "theme"
        assert created["template_type"] == "PENSION"
        assert created["min_plan"] == "STANDARD"
        # 가져온 색 + 직접 넣은 색
        assert created["css_variables"] == {"accent": "#f00", **CSS}
        row = await _sql(
            "SELECT count(*) FROM audit_logs WHERE action = 'TEMPLATE_CREATED'"
            " AND target_id = :id",
            id=created["id"],
        )
        assert row[0] == 1

    async def test_hidden_template_not_in_tenant_catalog(
        self, client, super_headers, made, auth_headers
    ):
        created = await _create(client, super_headers, made)
        catalog = (await client.get("/api/v1/templates", headers=auth_headers)).json()
        assert created["id"] not in {t["id"] for t in catalog["data"]["templates"]}

    @pytest.mark.parametrize(
        "css",
        [
            {"primary": "red; } body { display:none"},
            {"primary": "url(javascript:alert(1))"},
            {"Bad Key": "#fff"},
            {"primary": "x" * 101},
        ],
    )
    async def test_unsafe_css_400(self, client, super_headers, css):
        resp = await client.post(
            URL, headers=super_headers, json={"name": "위험", "css_variables": css}
        )
        assert resp.status_code == 400

    async def test_bad_thumbnail_400(self, client, super_headers):
        resp = await client.post(
            URL,
            headers=super_headers,
            json={
                "name": "썸네일",
                "css_variables": CSS,
                "thumbnail_url": "javascript:x",
            },
        )
        assert resp.status_code == 400

    async def test_needs_css_400(self, client, super_headers):
        resp = await client.post(URL, headers=super_headers, json={"name": "빈 색"})
        assert resp.status_code == 400

    async def test_duplicate_name_409(self, client, super_headers, made):
        created = await _create(client, super_headers, made)
        resp = await client.post(
            URL,
            headers=super_headers,
            json={"name": created["name"], "css_variables": CSS},
        )
        assert resp.status_code == 409

    async def test_base_must_be_theme_400(self, client, super_headers, made):
        code_name = f"코드형 {uuid.uuid4().hex[:6]}"
        made.append(code_name)
        await _sql(
            "INSERT INTO templates (id, template_type, renderer, name, css_variables,"
            " section_layouts, is_active, created_at, updated_at) VALUES"
            " (gen_random_uuid(), 'GENERAL', 'code', :n, '{}', '[]', true,"
            " now(), now())",
            n=code_name,
        )
        row = await _sql("SELECT id FROM templates WHERE name = :n", n=code_name)
        resp = await client.post(
            URL,
            headers=super_headers,
            json={"name": "가져오기", "base_template_id": str(row[0])},
        )
        assert resp.status_code == 400

    async def test_tenant_admin_403(self, client, auth_headers):
        resp = await client.post(
            URL, headers=auth_headers, json={"name": "x", "css_variables": CSS}
        )
        assert resp.status_code == 403


class TestUpdate:
    async def test_publish_edit_and_audit(self, client, super_headers, made):
        created = await _create(client, super_headers, made)
        new_name = f"{created['name']} 수정"
        made.append(new_name)
        resp = await client.patch(
            f"{URL}/{created['id']}",
            headers=super_headers,
            json={
                "is_active": True,
                "name": new_name,
                "min_plan": "PREMIUM",
                "description": "설명",
                "thumbnail_url": "/templates/x.svg",
                "css_variables": {"primary": "#000000"},
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert (data["is_active"], data["name"], data["min_plan"]) == (
            True,
            new_name,
            "PREMIUM",
        )
        assert data["css_variables"] == {"primary": "#000000"}
        row = await _sql(
            "SELECT before_value, after_value FROM audit_logs"
            " WHERE action = 'TEMPLATE_UPDATED' AND target_id = :id",
            id=created["id"],
        )
        assert row[0]["is_active"] is False and row[1]["is_active"] is True
        assert row[1]["css_changed"] is True

    async def test_null_required_field_kept(self, client, super_headers, made):
        created = await _create(client, super_headers, made, min_plan="STANDARD")
        resp = await client.patch(
            f"{URL}/{created['id']}",
            headers=super_headers,
            json={"min_plan": None, "description": None},
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["min_plan"] == "STANDARD"

    async def test_hide_keeps_tenant_site(
        self, client, super_headers, made, test_tenant
    ):
        """숨겨도 이미 쓰는 사업체 홈페이지는 그 템플릿 그대로."""
        created = await _create(client, super_headers, made, is_active=True)
        await _sql(
            "INSERT INTO tenant_template_overrides (id, tenant_id, template_id,"
            " css_overrides, applied_at, created_at, updated_at)"
            " VALUES (gen_random_uuid(), :t, :tpl, '{}', now(), now(), now())",
            t=test_tenant["id"],
            tpl=created["id"],
        )
        try:
            resp = await client.patch(
                f"{URL}/{created['id']}",
                headers=super_headers,
                json={"is_active": False},
            )
            assert resp.json()["data"]["usage_count"] == 1
            site = (await client.get(f"/api/public/site/{test_tenant['slug']}")).json()
            assert site["data"]["template"]["name"] == created["name"]
        finally:
            await _sql(
                "DELETE FROM tenant_template_overrides WHERE tenant_id = :t",
                t=test_tenant["id"],
            )

    async def test_code_template_css_400(self, client, super_headers, made):
        code_name = f"코드형 {uuid.uuid4().hex[:6]}"
        made.append(code_name)
        await _sql(
            "INSERT INTO templates (id, template_type, renderer, name, css_variables,"
            " section_layouts, is_active, created_at, updated_at) VALUES"
            " (gen_random_uuid(), 'GENERAL', 'code', :n, '{}', '[]', true,"
            " now(), now())",
            n=code_name,
        )
        row = await _sql("SELECT id FROM templates WHERE name = :n", n=code_name)
        resp = await client.patch(
            f"{URL}/{row[0]}",
            headers=super_headers,
            json={"css_variables": {"primary": "#000"}},
        )
        assert resp.status_code == 400
        # 이름 · 공개 여부는 코드형도 바꿀 수 있다
        resp = await client.patch(
            f"{URL}/{row[0]}", headers=super_headers, json={"is_active": False}
        )
        assert resp.status_code == 200

    async def test_rename_to_existing_409(self, client, super_headers, made):
        a = await _create(client, super_headers, made)
        b = await _create(client, super_headers, made)
        resp = await client.patch(
            f"{URL}/{b['id']}", headers=super_headers, json={"name": a["name"]}
        )
        assert resp.status_code == 409

    async def test_not_found_404(self, client, super_headers):
        resp = await client.patch(
            f"{URL}/{uuid.uuid4()}", headers=super_headers, json={"is_active": True}
        )
        assert resp.status_code == 404

    async def test_tenant_admin_403(self, client, super_headers, made, auth_headers):
        created = await _create(client, super_headers, made)
        resp = await client.patch(
            f"{URL}/{created['id']}", headers=auth_headers, json={"is_active": True}
        )
        assert resp.status_code == 403
