"""T-055 템플릿 서비스 + API 테스트.

- 목록(잠금/업종 필터), 적용(+플랜 잠금, 콘텐츠 보존), 롤백, 커스터마이징, 공개 미리보기
"""

import json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from tests.conftest import _TestSession  # type: ignore


async def _insert_template(
    template_type: str, name: str, min_plan: str, css: dict
) -> str:
    tid = str(uuid.uuid4())
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text(
                "INSERT INTO templates "
                "(id, template_type, name, css_variables, section_layouts, "
                " is_active, min_plan, created_at, updated_at) "
                "VALUES (:id, :tt, :name, CAST(:css AS jsonb), "
                "CAST(:layouts AS jsonb), true, :mp, now(), now())"
            ),
            {
                "id": tid,
                "tt": template_type,
                "name": name,
                "css": json.dumps(css),
                "layouts": json.dumps(["HERO_BANNER", "INTRO"]),
                "mp": min_plan,
            },
        )
        await session.commit()
    return tid


async def _set_plan(tenant_id: str, plan: str) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("UPDATE tenants SET plan_type = :p WHERE id = :tid"),
            {"p": plan, "tid": tenant_id},
        )
        await session.commit()


@pytest.fixture
async def templates_fixture():
    ids = {
        "basic": await _insert_template(
            "GENERAL", "베이직 템플릿", "BASIC", {"primary": "#111111"}
        ),
        "standard": await _insert_template(
            "HOSPITAL", "스탠다드 템플릿", "STANDARD", {"primary": "#222222"}
        ),
        "premium": await _insert_template(
            "GENERAL", "프리미엄 템플릿", "PREMIUM", {"primary": "#333333"}
        ),
    }
    yield ids

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        for tid in ids.values():
            await session.execute(
                text("DELETE FROM template_change_history WHERE template_id = :t"),
                {"t": tid},
            )
            await session.execute(
                text("DELETE FROM tenant_template_overrides WHERE template_id = :t"),
                {"t": tid},
            )
            await session.execute(
                text("DELETE FROM templates WHERE id = :t"), {"t": tid}
            )
        await session.commit()


# ───────────────────────── 목록 ─────────────────────────


class TestListTemplates:
    _url = "/api/v1/templates"

    async def test_requires_auth(self, client: AsyncClient):
        assert (await client.get(self._url)).status_code == 401

    async def test_lock_flags_by_plan(
        self, client: AsyncClient, auth_headers, templates_fixture, test_tenant
    ):
        await _set_plan(test_tenant["id"], "BASIC")
        resp = await client.get(self._url, headers=auth_headers)
        assert resp.status_code == 200
        by_id = {t["id"]: t for t in resp.json()["data"]["templates"]}
        # BASIC 플랜: BASIC 템플릿 잠금 해제, STANDARD/PREMIUM 잠금
        assert by_id[templates_fixture["basic"]]["locked"] is False
        assert by_id[templates_fixture["standard"]]["locked"] is True
        assert by_id[templates_fixture["premium"]]["locked"] is True

    async def test_industry_filter(
        self, client: AsyncClient, auth_headers, templates_fixture
    ):
        resp = await client.get(
            self._url, headers=auth_headers, params={"industry": "HOSPITAL"}
        )
        assert resp.status_code == 200
        types = {t["template_type"] for t in resp.json()["data"]["templates"]}
        # HOSPITAL + GENERAL 만 노출
        assert types <= {"HOSPITAL", "GENERAL"}


# ───────────────────────── 적용 ─────────────────────────


class TestApplyTemplate:
    _url = "/api/v1/templates/apply"

    async def test_apply_success_sets_current(
        self, client: AsyncClient, auth_headers, templates_fixture, test_tenant
    ):
        await _set_plan(test_tenant["id"], "STANDARD")
        resp = await client.post(
            self._url,
            headers=auth_headers,
            json={"template_id": templates_fixture["standard"]},
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["template_id"] == templates_fixture["standard"]

        # 목록의 current_template_id 반영 확인
        listed = await client.get("/api/v1/templates", headers=auth_headers)
        assert (
            listed.json()["data"]["current_template_id"]
            == templates_fixture["standard"]
        )

    async def test_apply_locked_template_forbidden(
        self, client: AsyncClient, auth_headers, templates_fixture, test_tenant
    ):
        await _set_plan(test_tenant["id"], "BASIC")
        resp = await client.post(
            self._url,
            headers=auth_headers,
            json={"template_id": templates_fixture["premium"]},
        )
        assert resp.status_code == 403

    async def test_apply_unknown_template_404(
        self, client: AsyncClient, auth_headers, test_tenant
    ):
        await _set_plan(test_tenant["id"], "PREMIUM")
        resp = await client.post(
            self._url, headers=auth_headers, json={"template_id": str(uuid.uuid4())}
        )
        assert resp.status_code == 404

    async def test_apply_preserves_content(
        self, client: AsyncClient, auth_headers, templates_fixture, test_tenant
    ):
        # 섹션 1개 생성
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text(
                    "INSERT INTO sections "
                    "(id, tenant_id, section_type, label, display_order, "
                    " is_active, created_at, updated_at) "
                    "VALUES (:id, :tid, 'HERO_BANNER', '메인', 0, true, now(), now())"
                ),
                {"id": str(uuid.uuid4()), "tid": test_tenant["id"]},
            )
            await session.commit()

        await _set_plan(test_tenant["id"], "STANDARD")
        before = await client.get("/api/v1/sections", headers=auth_headers)
        before_count = len(before.json()["data"])

        await client.post(
            self._url,
            headers=auth_headers,
            json={"template_id": templates_fixture["standard"]},
        )

        after = await client.get("/api/v1/sections", headers=auth_headers)
        # 템플릿 적용 후에도 섹션(콘텐츠)은 그대로
        assert len(after.json()["data"]) == before_count >= 1


# ───────────────────────── 롤백 ─────────────────────────


class TestRollbackTemplate:
    async def test_rollback_without_history_400(
        self, client: AsyncClient, auth_headers
    ):
        resp = await client.post(
            "/api/v1/templates/rollback", headers=auth_headers
        )
        assert resp.status_code == 400

    async def test_rollback_restores_previous(
        self, client: AsyncClient, auth_headers, templates_fixture, test_tenant
    ):
        await _set_plan(test_tenant["id"], "PREMIUM")
        # A 적용 → B 적용 → 롤백하면 A로 복귀
        await client.post(
            "/api/v1/templates/apply",
            headers=auth_headers,
            json={"template_id": templates_fixture["basic"]},
        )
        await client.post(
            "/api/v1/templates/apply",
            headers=auth_headers,
            json={"template_id": templates_fixture["premium"]},
        )
        resp = await client.post(
            "/api/v1/templates/rollback", headers=auth_headers
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["template_id"] == templates_fixture["basic"]


# ───────────────────────── 커스터마이징 ─────────────────────────


class TestCustomizeTemplate:
    _url = "/api/v1/templates/customize"

    async def test_customize_without_template_400(
        self, client: AsyncClient, auth_headers
    ):
        resp = await client.patch(
            self._url, headers=auth_headers, json={"css_overrides": {"primary": "#fff"}}
        )
        assert resp.status_code == 400

    async def test_customize_merges_css(
        self, client: AsyncClient, auth_headers, templates_fixture, test_tenant
    ):
        await _set_plan(test_tenant["id"], "PREMIUM")
        await client.post(
            "/api/v1/templates/apply",
            headers=auth_headers,
            json={"template_id": templates_fixture["basic"]},
        )
        r1 = await client.patch(
            self._url,
            headers=auth_headers,
            json={"css_overrides": {"primary": "#abcdef"}},
        )
        assert r1.status_code == 200
        r2 = await client.patch(
            self._url,
            headers=auth_headers,
            json={"css_overrides": {"font_body": "Pretendard"}},
        )
        assert r2.status_code == 200
        # 병합되어 두 키 모두 유지
        css = r2.json()["data"]["css_overrides"]
        assert css["primary"] == "#abcdef"
        assert css["font_body"] == "Pretendard"


# ───────────────────────── 공개 미리보기 ─────────────────────────


class TestPreview:
    async def test_preview_returns_chosen_template(
        self, client: AsyncClient, templates_fixture, test_tenant
    ):
        resp = await client.get(
            f"/api/public/preview/{test_tenant['slug']}",
            params={"tpl": templates_fixture["standard"]},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["template"]["css_variables"]["primary"] == "#222222"
        assert "sections" in data

    async def test_preview_unknown_slug_404(
        self, client: AsyncClient, templates_fixture
    ):
        resp = await client.get(
            "/api/public/preview/does-not-exist",
            params={"tpl": templates_fixture["basic"]},
        )
        assert resp.status_code == 404
