"""T-060 템플릿 시스템 통합 테스트.

전체 플로우(적용→적용→롤백→복귀), 공개 사이트 즉시 반영, 콘텐츠 보존,
플랜 제한을 엔드포인트 레벨에서 end-to-end로 검증한다.
"""

import json
import uuid

from httpx import AsyncClient
from sqlalchemy import text

from tests.conftest import _TestSession  # type: ignore


async def _insert_template(name: str, min_plan: str, primary: str) -> str:
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
                "VALUES (:id, 'GENERAL', :name, CAST(:css AS jsonb), "
                "'[]'::jsonb, true, :mp, now(), now())"
            ),
            {
                "id": tid,
                "name": name,
                "css": json.dumps({"primary": primary, "font_heading": "Pretendard"}),
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


async def _insert_section_with_setting(
    tenant_id: str, title: str
) -> tuple[str, str]:
    section_id = str(uuid.uuid4())
    setting_id = str(uuid.uuid4())
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
            {"id": section_id, "tid": tenant_id},
        )
        await session.execute(
            text(
                "INSERT INTO section_settings "
                "(id, tenant_id, section_id, field_key, field_value, value_type, "
                " created_at, updated_at) "
                "VALUES (:id, :tid, :sid, 'main_title', :val, 'text', now(), now())"
            ),
            {"id": setting_id, "tid": tenant_id, "sid": section_id, "val": title},
        )
        await session.commit()
    return section_id, setting_id


async def _cleanup_templates(*template_ids: str) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        for tid in template_ids:
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


class TestTemplateLifecycle:
    async def test_apply_a_then_b_then_rollback_returns_to_a(
        self, client: AsyncClient, auth_headers, test_tenant
    ):
        await _set_plan(test_tenant["id"], "STANDARD")
        a = await _insert_template("템플릿 A", "BASIC", "#aaaaaa")
        b = await _insert_template("템플릿 B", "BASIC", "#bbbbbb")
        try:
            # A 적용
            r = await client.post(
                "/api/v1/templates/apply",
                headers=auth_headers,
                json={"template_id": a},
            )
            assert r.status_code == 200
            assert r.json()["data"]["template_id"] == a

            # B 적용
            r = await client.post(
                "/api/v1/templates/apply",
                headers=auth_headers,
                json={"template_id": b},
            )
            assert r.json()["data"]["template_id"] == b

            # 롤백 → A 복귀
            r = await client.post(
                "/api/v1/templates/rollback", headers=auth_headers
            )
            assert r.status_code == 200
            assert r.json()["data"]["template_id"] == a

            # 목록의 current_template_id 도 A
            listed = await client.get("/api/v1/templates", headers=auth_headers)
            assert listed.json()["data"]["current_template_id"] == a
        finally:
            await _cleanup_templates(a, b)

    async def test_apply_reflects_on_public_site(
        self, client: AsyncClient, auth_headers, test_tenant
    ):
        await _set_plan(test_tenant["id"], "STANDARD")
        a = await _insert_template("퍼블릭 A", "BASIC", "#abcabc")
        try:
            await client.post(
                "/api/v1/templates/apply",
                headers=auth_headers,
                json={"template_id": a},
            )
            # 공개 사이트가 적용 템플릿을 즉시 반영 (apply 시 캐시 퍼지)
            pub = await client.get(f"/api/public/site/{test_tenant['slug']}")
            assert pub.status_code == 200
            css = pub.json()["data"]["template"]["css_variables"]
            assert css["primary"] == "#abcabc"
        finally:
            await _cleanup_templates(a)

    async def test_customize_merges_into_public_css(
        self, client: AsyncClient, auth_headers, test_tenant
    ):
        await _set_plan(test_tenant["id"], "STANDARD")
        a = await _insert_template("커스텀 A", "BASIC", "#111111")
        try:
            await client.post(
                "/api/v1/templates/apply",
                headers=auth_headers,
                json={"template_id": a},
            )
            await client.patch(
                "/api/v1/templates/customize",
                headers=auth_headers,
                json={"css_overrides": {"primary": "#ff8800"}},
            )
            pub = await client.get(f"/api/public/site/{test_tenant['slug']}")
            css = pub.json()["data"]["template"]["css_variables"]
            # 커스터마이징이 템플릿 기본값 위에 병합되어 반영
            assert css["primary"] == "#ff8800"
            assert css["font_heading"] == "Pretendard"
        finally:
            await _cleanup_templates(a)


class TestContentPreservation:
    async def test_section_text_unchanged_across_template_changes(
        self, client: AsyncClient, auth_headers, test_tenant
    ):
        await _set_plan(test_tenant["id"], "STANDARD")
        a = await _insert_template("보존 A", "BASIC", "#222222")
        b = await _insert_template("보존 B", "BASIC", "#333333")
        await _insert_section_with_setting(test_tenant["id"], "우리 가게 환영합니다")

        def snapshot(resp):
            data = resp.json()["data"]
            return [
                (
                    s["id"],
                    sorted(
                        (st["field_key"], st["field_value"]) for st in s["settings"]
                    ),
                )
                for s in data
            ]

        try:
            before = snapshot(
                await client.get("/api/v1/sections", headers=auth_headers)
            )
            assert before  # 섹션이 존재

            await client.post(
                "/api/v1/templates/apply",
                headers=auth_headers,
                json={"template_id": a},
            )
            await client.post(
                "/api/v1/templates/apply",
                headers=auth_headers,
                json={"template_id": b},
            )
            await client.post(
                "/api/v1/templates/rollback", headers=auth_headers
            )

            after = snapshot(
                await client.get("/api/v1/sections", headers=auth_headers)
            )
            # 텍스트 콘텐츠(섹션/설정)는 템플릿 변경 전후 완전히 동일
            assert after == before
        finally:
            await _cleanup_templates(a, b)


class TestPlanRestriction:
    async def test_basic_plan_blocked_from_premium_template(
        self, client: AsyncClient, auth_headers, test_tenant
    ):
        await _set_plan(test_tenant["id"], "BASIC")
        premium = await _insert_template("프리미엄 전용", "PREMIUM", "#444444")
        try:
            # 목록에서 잠금 표시
            listed = await client.get("/api/v1/templates", headers=auth_headers)
            item = next(
                t
                for t in listed.json()["data"]["templates"]
                if t["id"] == premium
            )
            assert item["locked"] is True

            # 적용 시도 차단(403)
            r = await client.post(
                "/api/v1/templates/apply",
                headers=auth_headers,
                json={"template_id": premium},
            )
            assert r.status_code == 403
        finally:
            await _cleanup_templates(premium)
