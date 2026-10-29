"""SEO 대표 키워드 저장 (T-040-A, 기획서 4 AD-05 · 5.7 · 2 요금제 표)."""

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.services import ai as ai_service
from app.services import seo as seo_service
from tests.conftest import _TestSession  # type: ignore

_URL = "/api/v1/seo-settings"


async def _set_plan(tenant_id: str, plan: str) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("UPDATE tenants SET plan_type = :p WHERE id = :t"),
            {"p": plan, "t": tenant_id},
        )
        await session.commit()


@pytest.fixture
async def standard_tenant(test_tenant: dict) -> dict:
    await _set_plan(test_tenant["id"], "STANDARD")
    return test_tenant


class TestNormalize:
    def test_trims_dedupes_and_drops_blank(self):
        raw = [
            "  강남  통증의학과 ",
            "",
            "허리 비수술",
            "강남 통증의학과",
            "ABC",
            "abc",
        ]
        assert seo_service.normalize_keywords(raw) == [
            "강남 통증의학과",
            "허리 비수술",
            "ABC",
        ]

    def test_too_many(self):
        with pytest.raises(ValueError, match="최대 5개"):
            seo_service.normalize_keywords([f"k{i}" for i in range(6)])

    def test_too_long(self):
        with pytest.raises(ValueError, match="30자"):
            seo_service.normalize_keywords(["가" * 31])


class TestKeywordsApi:
    async def test_standard_saves_and_reads(
        self, client: AsyncClient, auth_headers: dict, standard_tenant: dict
    ):
        resp = await client.put(
            _URL,
            json={"keywords": [" 강남 통증의학과", "허리 비수술", "허리 비수술"]},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["keywords"] == ["강남 통증의학과", "허리 비수술"]

        # 다른 칸만 저장해도 키워드는 그대로 (None = 바꾸지 않음)
        await client.put(_URL, json={"meta_title": "새 제목"}, headers=auth_headers)
        got = await client.get(_URL, headers=auth_headers)
        assert got.json()["data"]["keywords"] == ["강남 통증의학과", "허리 비수술"]

        # [] = 모두 지움
        cleared = await client.put(_URL, json={"keywords": []}, headers=auth_headers)
        assert cleared.json()["data"]["keywords"] == []

    async def test_first_save_creates_row_with_keywords(
        self, client: AsyncClient, auth_headers: dict, standard_tenant: dict
    ):
        resp = await client.put(_URL, json={"keywords": ["펜션"]}, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["data"]["keywords"] == ["펜션"]

    async def test_basic_blocked_with_plan_code(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _set_plan(test_tenant["id"], "BASIC")
        resp = await client.put(_URL, json={"keywords": ["강남"]}, headers=auth_headers)
        assert resp.status_code == 422
        body = resp.json()
        assert body["error"]["code"] == "PLAN_LIMIT_EXCEEDED"
        assert "STANDARD" in body["error"]["message"]
        # 키워드 없이 다른 칸 저장은 된다
        ok = await client.put(
            _URL, json={"meta_title": "제목", "keywords": []}, headers=auth_headers
        )
        assert ok.status_code == 200

    async def test_downgraded_keeps_saved_keywords(
        self, client: AsyncClient, auth_headers: dict, standard_tenant: dict
    ):
        await client.put(_URL, json={"keywords": ["강남"]}, headers=auth_headers)
        await _set_plan(standard_tenant["id"], "BASIC")
        # 같은 값을 다시 보내는 건 허용, 바꾸는 건 막힘
        same = await client.put(
            _URL, json={"meta_title": "t", "keywords": ["강남"]}, headers=auth_headers
        )
        assert same.status_code == 200
        changed = await client.put(
            _URL, json={"keywords": ["강남", "역삼"]}, headers=auth_headers
        )
        assert changed.status_code == 422
        pub = await client.get(f"/api/public/site/{standard_tenant['slug']}")
        assert pub.json()["data"]["seo_settings"]["keywords"] == ["강남"]

    async def test_validation_400(
        self, client: AsyncClient, auth_headers: dict, standard_tenant: dict
    ):
        resp = await client.put(
            _URL, json={"keywords": [f"k{i}" for i in range(6)]}, headers=auth_headers
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    async def test_limits(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _set_plan(test_tenant["id"], "BASIC")
        basic = (await client.get(f"{_URL}/limits", headers=auth_headers)).json()
        assert basic["data"] == {
            "keywords_allowed": False,
            "keywords_max": 5,
            "keyword_max_length": 30,
        }
        await _set_plan(test_tenant["id"], "PREMIUM")
        premium = (await client.get(f"{_URL}/limits", headers=auth_headers)).json()
        assert premium["data"]["keywords_allowed"] is True

    async def test_limits_unauthenticated(self, client: AsyncClient):
        assert (await client.get(f"{_URL}/limits")).status_code == 401

    async def test_public_site_exposes_keywords(
        self, client: AsyncClient, auth_headers: dict, standard_tenant: dict
    ):
        await client.put(
            _URL, json={"keywords": ["강남", "비수술"]}, headers=auth_headers
        )
        pub = await client.get(f"/api/public/site/{standard_tenant['slug']}")
        assert pub.json()["data"]["seo_settings"]["keywords"] == ["강남", "비수술"]


class TestAiCopyUsesKeywords:
    async def test_saved_keywords_fill_empty_request(
        self,
        client: AsyncClient,
        auth_headers: dict,
        standard_tenant: dict,
        monkeypatch,
    ):
        await client.put(
            _URL, json={"keywords": ["강남", "비수술"]}, headers=auth_headers
        )
        seen: list[list[str]] = []

        async def fake(request, *, template_type, business_name):
            seen.append(list(request.tenant_context.keywords))
            return (["문구1", "문구2", "문구3"], 10)

        monkeypatch.setattr(ai_service, "generate_suggestions", fake)
        body = {
            "section_type": "HERO_BANNER",
            "field": "main_title",
            "current_value": "어서 오세요",
            "tenant_context": {
                "template_type": "",
                "business_name": "",
                "keywords": [],
            },
            "tone": "professional",
            "count": 3,
        }
        resp = await client.post(
            "/api/v1/ai/suggest-copy", json=body, headers=auth_headers
        )
        assert resp.status_code == 200, resp.text
        assert seen == [["강남", "비수술"]]

        # 요청에 키워드가 있으면 그것을 쓴다
        body["tenant_context"]["keywords"] = ["역삼"]
        body["current_value"] = "다른 문구"
        await client.post("/api/v1/ai/suggest-copy", json=body, headers=auth_headers)
        assert seen[-1] == ["역삼"]
