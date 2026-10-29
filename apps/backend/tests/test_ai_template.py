"""AI 템플릿 추천 (기획서 13.4, T-070-A)."""

import json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.config import settings
from app.services import ai as ai_service
from tests.conftest import _TestSession  # type: ignore

_URL = "/api/v1/ai/recommend-templates"


async def _sql(sql: str, params: dict | None = None):
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        result = await session.execute(text(sql), params or {})
        await session.commit()
        return result


@pytest.fixture
async def setup_tenant(test_tenant: dict):
    """STANDARD · 병원 업종 · 기능 켜짐 + 후보 템플릿"""
    t = test_tenant["id"]
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD', template_type = 'HOSPITAL'"
        " WHERE id = :t",
        {"t": t},
    )
    await _sql(
        "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled,"
        " enabled_at, created_at, updated_at) SELECT gen_random_uuid(), :t, id,"
        " true, now(), now(), now() FROM features WHERE key = 'AI_TEMPLATE_RECOMMEND'",
        {"t": t},
    )
    ids: dict[str, str] = {}
    run = uuid.uuid4().hex[:6]  # 다른 테스트가 남긴 템플릿과 이름이 겹치지 않게
    for key, ttype, name, min_plan in [
        ("hospital", "HOSPITAL", "가 병원 따뜻", "BASIC"),
        ("hospital2", "HOSPITAL", "나 병원 모던", "BASIC"),
        ("general", "GENERAL", "다 범용", "BASIC"),
        ("pension", "PENSION", "라 펜션", "BASIC"),
        ("premium", "HOSPITAL", "마 병원 고급", "PREMIUM"),
    ]:
        tid = str(uuid.uuid4())
        ids[key] = tid
        await _sql(
            "INSERT INTO templates (id, template_type, name, description,"
            " css_variables, section_layouts, is_active, min_plan, created_at,"
            " updated_at) VALUES (:id, :tt, :n, :d, '{}'::jsonb, '[]'::jsonb, true,"
            " :mp, now(), now())",
            {
                "id": tid,
                "tt": ttype,
                "n": f"{name} {run}",
                "d": f"{name} 설명",
                "mp": min_plan,
            },
        )
    yield {"tenant_id": t, "templates": ids, "run": run}
    await _sql("DELETE FROM tenant_features WHERE tenant_id = :t", {"t": t})
    await _sql("DELETE FROM ai_usage_log WHERE tenant_id = :t", {"t": t})
    for tid in ids.values():
        await _sql("DELETE FROM templates WHERE id = :t", {"t": tid})


def _mine(recs: list[dict], ids: dict) -> list[str]:
    reverse = {v: k for k, v in ids.items()}
    return [reverse.get(r["template_id"], "other") for r in recs]


class TestRuleBased:
    def test_rule_order_same_industry_then_general(self):
        """같은 업종 → 범용 → 나머지, 같은 순위는 이름순 (순수 함수)"""
        from app.models.template import Template
        from app.services.ai_template import rule_based

        def tpl(name: str, ttype: str) -> Template:
            return Template(id=uuid.uuid4(), name=name, template_type=ttype)

        recs = rule_based(
            "HOSPITAL",
            [
                tpl("펜션", "PENSION"),
                tpl("범용", "GENERAL"),
                tpl("나 병원", "HOSPITAL"),
                tpl("가 병원", "HOSPITAL"),
            ],
        )
        assert [r.name for r in recs] == ["가 병원", "나 병원", "범용"]
        assert "병원" in recs[0].reason and recs[2].reason

    async def test_no_api_key_uses_rule_without_locked(
        self, client: AsyncClient, auth_headers: dict, setup_tenant, monkeypatch
    ):
        monkeypatch.setattr(settings, "openai_api_key", "")
        resp = await client.post(_URL, headers=auth_headers, json={})
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["source"] == "rule"
        names = _mine(data["recommendations"], setup_tenant["templates"])
        assert "premium" not in names  # 요금제로 못 쓰는 템플릿은 추천하지 않는다
        assert len(data["recommendations"]) == 3
        assert all(r["reason"] for r in data["recommendations"])


class TestAi:
    async def test_ai_recommendations_filtered_and_logged(
        self, client: AsyncClient, auth_headers: dict, setup_tenant, monkeypatch
    ):
        monkeypatch.setattr(settings, "openai_api_key", "sk-test")
        captured: dict = {}

        async def fake_model(messages):
            human = messages[-1].content
            captured["human"] = human
            lines = [ln for ln in human.splitlines() if ln[:2].rstrip(".").isdigit()]
            run = setup_tenant["run"]
            by_name = {
                ln.split(". ", 1)[1].split(" |")[0].removesuffix(f" {run}"): int(
                    ln.split(".")[0]
                )
                for ln in lines
            }
            return (
                "추천입니다\n"
                + json.dumps(
                    [
                        {"index": by_name["다 범용"], "reason": "깔끔한 범용"},
                        {"index": 999, "reason": "없는 후보"},
                        {"index": by_name["다 범용"], "reason": "중복"},
                        {
                            "index": by_name["가 병원 따뜻"],
                            "reason": "따뜻한 병원 느낌",
                        },
                    ],
                    ensure_ascii=False,
                ),
                120,
            )

        monkeypatch.setattr(ai_service, "_call_model", fake_model)
        resp = await client.post(_URL, headers=auth_headers, json={"refresh": True})
        data = resp.json()["data"]
        assert data["source"] == "ai"
        assert _mine(data["recommendations"], setup_tenant["templates"]) == [
            "general",
            "hospital",
        ]
        assert data["recommendations"][1]["reason"] == "따뜻한 병원 느낌"
        # 잠긴 템플릿은 후보로도 보내지 않는다
        assert f"마 병원 고급 {setup_tenant['run']}" not in captured["human"]
        row = await _sql(
            "SELECT count(*) FROM ai_usage_log WHERE tenant_id = :t"
            " AND action_type = 'TEMPLATE_RECOMMEND'",
            {"t": setup_tenant["tenant_id"]},
        )
        assert row.scalar_one() == 1

    async def test_model_failure_falls_back_to_rule(
        self, client: AsyncClient, auth_headers: dict, setup_tenant, monkeypatch
    ):
        monkeypatch.setattr(settings, "openai_api_key", "sk-test")

        async def broken(messages):
            raise RuntimeError("OpenAI down")

        monkeypatch.setattr(ai_service, "_call_model", broken)
        resp = await client.post(_URL, headers=auth_headers, json={"refresh": True})
        assert resp.status_code == 200
        assert resp.json()["data"]["source"] == "rule"

    async def test_garbage_response_falls_back_to_rule(
        self, client: AsyncClient, auth_headers: dict, setup_tenant, monkeypatch
    ):
        monkeypatch.setattr(settings, "openai_api_key", "sk-test")

        async def garbage(messages):
            return "죄송합니다, 추천할 수 없습니다.", 10

        monkeypatch.setattr(ai_service, "_call_model", garbage)
        resp = await client.post(_URL, headers=auth_headers, json={"refresh": True})
        assert resp.json()["data"]["source"] == "rule"


class TestAccess:
    async def test_requires_auth(self, client: AsyncClient):
        assert (await client.post(_URL, json={})).status_code == 401

    async def test_basic_plan_forbidden(
        self, client: AsyncClient, auth_headers: dict, setup_tenant
    ):
        await _sql(
            "UPDATE tenants SET plan_type = 'BASIC' WHERE id = :t",
            {"t": setup_tenant["tenant_id"]},
        )
        resp = await client.post(_URL, headers=auth_headers, json={})
        assert resp.status_code == 403
        assert "STANDARD" in resp.json()["error"]["message"]

    async def test_feature_off_forbidden(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _sql(
            "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t",
            {"t": test_tenant["id"]},
        )
        resp = await client.post(_URL, headers=auth_headers, json={})
        assert resp.status_code == 403
