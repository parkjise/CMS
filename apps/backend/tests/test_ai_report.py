"""AI 월간 분석 리포트 (기획서 13.2 기능 3 · 13.4, T-073-A)."""

import json
import uuid
from datetime import UTC, date, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.config import settings
from app.models.section import Section, SectionSetting
from app.models.seo import SeoSetting
from app.services import ai as ai_service
from app.services import ai_report
from tests.conftest import _TestSession  # type: ignore

_URL = "/api/v1/ai/reports"


# ── 규칙 점검 (순수 함수) ────────────────────────────────────────────────


def _section(stype: str, values: dict, *, sample: bool = False) -> Section:
    s = Section(
        id=uuid.uuid4(),
        section_type=stype,
        label=stype,
        is_active=True,
        page_key="home",
    )
    s.settings = [
        SectionSetting(
            field_key=k, field_value=v, value_type="STRING", is_sample=sample
        )
        for k, v in values.items()
    ]
    return s


def _metrics(**over) -> dict:
    m = {
        "period": "2026-09-01",
        "visitors": 120,
        "prev_visitors": 100,
        "page_views": 300,
        "mobile_ratio": 0.6,
        "inquiries": 5,
        "prev_inquiries": 3,
    }
    m.update(over)
    return m


def _codes(items: list[dict]) -> set[str]:
    return {i["code"] for i in items}


class TestRunChecks:
    def test_healthy_site(self):
        sections = [
            _section(
                "HERO_BANNER",
                {
                    "main_title": "강남역 3분 통증 전문 의원",
                    "cta_text": "예약",
                    "cta_url": "/contact",
                    "bg_image_url": "https://x/a.webp",
                },
            ),
            _section("CONTACT", {}),
        ]
        seo = SeoSetting(meta_description="강남 통증의학과")
        strengths, improvements = ai_report.run_checks(sections, seo, _metrics())
        assert {
            "hero_title_ok",
            "cta_ok",
            "contact_ok",
            "seo_ok",
            "visitors_up",
            "inquiries_up",
        } <= _codes(strengths)
        assert improvements == []

    def test_problems_found_and_linked_to_section(self):
        hero = _section("HERO_BANNER", {"main_title": "환영"}, sample=True)
        intro = _section("INTRO", {"intro_text": "가" * 450})
        strengths, improvements = ai_report.run_checks(
            [hero, intro], None, _metrics(visitors=0, prev_visitors=10, inquiries=1)
        )
        codes = _codes(improvements)
        assert {
            "hero_title_short",
            "cta_missing",
            "hero_image_missing",
            "contact_missing",
            "intro_long",
            "sample_left",
            "seo_description_missing",
            "no_visitors",
            "inquiries_down",
        } <= codes
        short = next(i for i in improvements if i["code"] == "hero_title_short")
        assert short["section_id"] == str(hero.id)
        assert next(i for i in improvements if i["code"] == "intro_long")[
            "section_id"
        ] == str(intro.id)

    def test_other_pages_and_hidden_sections_ignored(self):
        about = _section("CONTACT", {})
        about.page_key = "about"
        hidden = _section("CONTACT", {})
        hidden.is_active = False
        _, improvements = ai_report.run_checks([about, hidden], None, _metrics())
        assert "contact_missing" in _codes(improvements)


class TestApplyPolish:
    def test_unknown_codes_ignored(self):
        strengths = [{"code": "seo_ok", "title": "t", "detail": "원래"}]
        improvements = [{"code": "cta_missing", "title": "t", "detail": "원래"}]
        content = "설명:\n" + json.dumps(
            {
                "summary": "좋아지고 있어요.",
                "details": {"cta_missing": "버튼을 넣어 보세요", "made_up": "x"},
            },
            ensure_ascii=False,
        )
        summary, s2, i2 = ai_report.apply_polish(content, strengths, improvements)
        assert summary == "좋아지고 있어요."
        assert s2[0]["detail"] == "원래"
        assert i2[0]["detail"] == "버튼을 넣어 보세요"
        assert len(i2) == 1

    def test_missing_summary_raises(self):
        with pytest.raises(ValueError):
            ai_report.apply_polish('{"details": {}}', [], [])


# ── API ───────────────────────────────────────────────────────────────────


async def _sql(sql: str, params: dict | None = None):
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        result = await session.execute(text(sql), params or {})
        await session.commit()
        return result


async def _enable(tenant_id: str, plan: str = "STANDARD") -> None:
    await _sql(
        "UPDATE tenants SET plan_type = :p WHERE id = :t", {"p": plan, "t": tenant_id}
    )
    await _sql(
        "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled,"
        " enabled_at, created_at, updated_at) SELECT gen_random_uuid(), :t, id,"
        " true, now(), now(), now() FROM features WHERE key = 'AI_MONTHLY_REPORT'"
        " ON CONFLICT ON CONSTRAINT uq_tenant_features_pair DO NOTHING",
        {"t": tenant_id},
    )


@pytest.fixture
async def report_tenant(test_tenant: dict, monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    await _enable(test_tenant["id"])
    yield test_tenant
    for table in ("ai_reports", "ai_usage_log", "tenant_features", "site_analytics"):
        await _sql(
            f"DELETE FROM {table} WHERE tenant_id = :t", {"t": test_tenant["id"]}
        )


class TestReportApi:
    async def test_create_and_list_standard_once(
        self, client: AsyncClient, auth_headers: dict, report_tenant, test_section
    ):
        resp = await client.post(_URL, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        report = resp.json()["data"]
        assert report["kind"] == "MANUAL"
        assert report["source"] == "rule"
        assert report["summary"]
        assert any(i["code"] == "contact_missing" for i in report["improvements"])
        # 테스트 섹션(HERO_BANNER) 과 연결
        assert any(
            i.get("section_id") == test_section["id"] for i in report["improvements"]
        )

        listed = (await client.get(_URL, headers=auth_headers)).json()["data"]
        assert listed["quota"] == {"used": 1, "limit": 1, "remaining": 0}
        assert listed["reports"][0]["id"] == report["id"]
        assert listed["reports"][0]["improvement_count"] == len(report["improvements"])

        detail = await client.get(f"{_URL}/{report['id']}", headers=auth_headers)
        assert detail.json()["data"]["id"] == report["id"]

        again = await client.post(_URL, headers=auth_headers)
        assert again.status_code == 422
        assert again.json()["error"]["code"] == "PLAN_LIMIT_EXCEEDED"

    async def test_premium_four_per_month(
        self, client: AsyncClient, auth_headers: dict, report_tenant
    ):
        await _enable(report_tenant["id"], "PREMIUM")
        for _ in range(4):
            assert (await client.post(_URL, headers=auth_headers)).status_code == 200
        assert (await client.post(_URL, headers=auth_headers)).status_code == 422

    async def test_basic_forbidden(
        self, client: AsyncClient, auth_headers: dict, report_tenant
    ):
        await _sql(
            "UPDATE tenants SET plan_type = 'BASIC' WHERE id = :t",
            {"t": report_tenant["id"]},
        )
        resp = await client.post(_URL, headers=auth_headers)
        assert resp.status_code == 403
        assert "STANDARD" in resp.json()["error"]["message"]

    async def test_feature_off_forbidden(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _sql(
            "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t",
            {"t": test_tenant["id"]},
        )
        assert (await client.get(_URL, headers=auth_headers)).status_code == 403

    async def test_requires_auth(self, client: AsyncClient):
        assert (await client.get(_URL)).status_code == 401

    async def test_other_tenant_report_not_visible(
        self, client: AsyncClient, auth_headers: dict, report_tenant
    ):
        other = str(uuid.uuid4())
        report_id = str(uuid.uuid4())
        await _sql(
            "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
            " updated_at) VALUES (:id, '다른 곳', :slug, 'STANDARD', true, now(),"
            " now())",
            {"id": other, "slug": f"o-{other[:8]}"},
        )
        try:
            await _sql(
                "INSERT INTO ai_reports (id, tenant_id, period, kind, source, summary,"
                " metrics, strengths, improvements) VALUES (:id, :t, '2026-09-01',"
                " 'AUTO', 'rule', '남의 리포트', '{}', '[]', '[]')",
                {"id": report_id, "t": other},
            )
            resp = await client.get(f"{_URL}/{report_id}", headers=auth_headers)
            assert resp.status_code == 404
            listed = (await client.get(_URL, headers=auth_headers)).json()["data"]
            assert all(r["id"] != report_id for r in listed["reports"])
        finally:
            await _sql("DELETE FROM ai_reports WHERE tenant_id = :t", {"t": other})
            await _sql("DELETE FROM tenants WHERE id = :t", {"t": other})

    async def test_ai_polish_used_when_key(
        self, client: AsyncClient, auth_headers: dict, report_tenant, monkeypatch
    ):
        monkeypatch.setattr(settings, "openai_api_key", "sk-test")

        async def fake(messages):
            return (
                json.dumps(
                    {
                        "summary": "AI 총평입니다.",
                        "details": {"contact_missing": "문의 섹션을 꼭 넣어 주세요"},
                    },
                    ensure_ascii=False,
                ),
                90,
            )

        monkeypatch.setattr(ai_service, "_call_model", fake)
        report = (await client.post(_URL, headers=auth_headers)).json()["data"]
        assert report["source"] == "ai"
        assert report["summary"] == "AI 총평입니다."
        contact = next(
            i for i in report["improvements"] if i["code"] == "contact_missing"
        )
        assert contact["detail"] == "문의 섹션을 꼭 넣어 주세요"

    async def test_ai_failure_falls_back_to_rule(
        self, client: AsyncClient, auth_headers: dict, report_tenant, monkeypatch
    ):
        monkeypatch.setattr(settings, "openai_api_key", "sk-test")

        async def broken(messages):
            raise RuntimeError("down")

        monkeypatch.setattr(ai_service, "_call_model", broken)
        resp = await client.post(_URL, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["data"]["source"] == "rule"


# ── 지표 · 자동 생성 작업 ────────────────────────────────────────────────


class TestMetricsAndJob:
    async def test_metrics_month_and_previous(self, report_tenant):
        t = report_tenant["id"]
        for day, visitors in (
            ("2026-09-03", 30),
            ("2026-09-20", 20),
            ("2026-08-10", 15),
        ):
            await _sql(
                "INSERT INTO site_analytics (id, tenant_id, date, page_views,"
                " unique_visitors, mobile_views, referrers, created_at, updated_at)"
                " VALUES (gen_random_uuid(), :t, :d, :pv, :uv, :m, '{}', now(), now())",
                {
                    "t": t,
                    "d": date.fromisoformat(day),
                    "pv": visitors * 2,
                    "uv": visitors,
                    "m": visitors,
                },
            )
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            m = await ai_report.collect_metrics(session, uuid.UUID(t), date(2026, 9, 1))
        assert m["visitors"] == 50
        assert m["prev_visitors"] == 15
        assert m["page_views"] == 100
        assert m["mobile_ratio"] == 0.5

    async def test_monthly_job_creates_once_and_emails(
        self, report_tenant, monkeypatch
    ):
        from app.services import email as email_service
        from app.workers import ai_report as worker

        t = report_tenant["id"]
        await _sql(
            "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
            " created_at, updated_at) VALUES (gen_random_uuid(), :t, :e, 'x',"
            " 'TENANT_ADMIN', true, now(), now())",
            {"t": t, "e": f"owner-{t[:6]}@shop.com"},
        )
        sent: list[str] = []

        async def fake_mail(to, **kwargs):
            sent.append(to)
            return {"sent": True}

        monkeypatch.setattr(email_service, "send_monthly_report_email", fake_mail)

        first = await worker._generate_monthly_reports(date(2026, 10, 1))
        second = await worker._generate_monthly_reports(date(2026, 10, 1))
        row = await _sql(
            "SELECT count(*), min(period) FROM ai_reports WHERE tenant_id = :t"
            " AND kind = 'AUTO'",
            {"t": t},
        )
        count, period = row.one()
        assert count == 1  # 두 번 돌아도 한 번
        assert period == date(2026, 9, 1)  # 지난달
        assert first["created"] >= 1
        assert second["created"] == 0
        assert f"owner-{t[:6]}@shop.com" in sent
        await _sql(
            "DELETE FROM users WHERE tenant_id = :t AND email LIKE 'owner-%'", {"t": t}
        )

    async def test_job_skips_tenant_without_feature(self, test_tenant, monkeypatch):
        from app.workers import ai_report as worker

        monkeypatch.setattr(settings, "openai_api_key", "")
        await _sql(
            "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t",
            {"t": test_tenant["id"]},
        )
        await worker._generate_monthly_reports(datetime(2026, 10, 1, tzinfo=UTC).date())
        row = await _sql(
            "SELECT count(*) FROM ai_reports WHERE tenant_id = :t",
            {"t": test_tenant["id"]},
        )
        assert row.scalar_one() == 0
