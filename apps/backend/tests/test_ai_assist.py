"""T-231-B AI 보조 서버 — `POST /api/v1/ai/assist/{kind}` (seo · geo).

- 결과 검증 · 자르기 · 사이트 정보 요약은 DB 없이.
- 엔드포인트는 테스트 DB + 모델 모킹(monkeypatch ai._call_model).
"""

import json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from app.models.site import SiteSetting
from app.services import ai as ai_service
from app.services import ai_assist
from tests.conftest import _TestSession  # type: ignore

_SEO = "/api/v1/ai/assist/seo"
_GEO = "/api/v1/ai/assist/geo"

SEO_ANSWER = json.dumps(
    {
        "meta_title": "바른치과의원 | 강남역 임플란트",
        "meta_description": "강남역 앞 치과입니다.",
        "keywords": ["임플란트", "강남 치과"],
    },
    ensure_ascii=False,
)


# ───────────────────────── 결과 검증 · 자르기 (DB 불필요) ─────────────────────────


class TestParseAssistResult:
    def test_seo_cuts_to_save_rules(self):
        content = json.dumps(
            {
                "meta_title": "가" * 80,
                "meta_description": "나" * 200,
                "keywords": ["임플란트", "임플란트", " 강남  치과 ", "", "x" * 31]
                + [f"k{i}" for i in range(10)],
            },
            ensure_ascii=False,
        )
        result = ai_assist.parse_assist_result("seo", content, allow_keywords=True)
        assert len(result.meta_title) == 60
        assert len(result.meta_description) == 160
        # 중복 · 빈 값 · 30자 넘는 낱말은 빼고 5개로
        assert result.keywords == ["임플란트", "강남 치과", "k0", "k1", "k2"]

    def test_seo_without_keyword_plan_has_no_keywords(self):
        result = ai_assist.parse_assist_result("seo", SEO_ANSWER, allow_keywords=False)
        assert result.keywords == []

    def test_geo_cuts_topics(self):
        content = json.dumps(
            {"description": "소개" * 300, "topics": [f"주제{i}" for i in range(15)]},
            ensure_ascii=False,
        )
        result = ai_assist.parse_assist_result("geo", content, allow_keywords=True)
        assert len(result.description) == 500
        assert len(result.topics) == 10

    def test_code_fence_is_fine(self):
        result = ai_assist.parse_assist_result(
            "seo", f"```json\n{SEO_ANSWER}\n```", allow_keywords=True
        )
        assert result.meta_title.startswith("바른치과의원")

    @pytest.mark.parametrize(
        "content",
        [
            "그냥 글",
            '["배열"]',
            '{"meta_title": "제목만"}',
            '{"meta_title": "", "meta_description": "설명"}',
        ],
    )
    def test_wrong_shape_raises(self, content: str):
        with pytest.raises(ValueError):
            ai_assist.parse_assist_result("seo", content, allow_keywords=True)

    def test_geo_needs_description(self):
        with pytest.raises(ValueError):
            ai_assist.parse_assist_result(
                "geo", '{"topics": ["a"]}', allow_keywords=True
            )


class TestSiteFacts:
    def test_area_keeps_city_and_district_only(self):
        assert (
            ai_assist._area("서울특별시 강남구 테헤란로 123 4층") == "서울특별시 강남구"
        )
        assert ai_assist._area(None) is None

    def test_hours_from_weekly_then_free_text(self):
        site = SiteSetting(
            weekly_hours={
                "mon": {"status": "open", "open": "09:00", "close": "18:00"},
                "sun": {"status": "closed"},
            }
        )
        assert ai_assist._hours_summary(site) == "월 09:00~18:00, 일 휴무"
        old = SiteSetting(hours_weekday="09:00~18:00", hours_saturday="09:00~13:00")
        assert ai_assist._hours_summary(old) == "평일 09:00~18:00 / 토요일 09:00~13:00"


# ───────────────────────── 엔드포인트 (DB + 모델 모킹) ─────────────────────────


async def _sql(sql: str, params: dict | None = None) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(text(sql), params or {})
        await session.commit()


async def _enable(tenant_id: str, key: str = "AI_SITE_ASSIST") -> None:
    await _sql(
        "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled,"
        " enabled_at, created_at, updated_at) SELECT gen_random_uuid(), :t, id,"
        " true, now(), now(), now() FROM features WHERE key = :k"
        " ON CONFLICT ON CONSTRAINT uq_tenant_features_pair DO NOTHING",
        {"t": tenant_id, "k": key},
    )


@pytest.fixture
async def assist_tenant(test_tenant: dict):
    await _enable(test_tenant["id"])
    await _sql(
        "INSERT INTO site_settings (id, tenant_id, site_name, address, phone,"
        " created_at, updated_at) VALUES (gen_random_uuid(), :t, '바른치과의원',"
        " '서울특별시 강남구 테헤란로 123 4층', '02-123-4567', now(), now())",
        {"t": test_tenant["id"]},
    )
    yield test_tenant
    for table in ("ai_usage_log", "tenant_features", "site_settings", "seo_settings"):
        await _sql(
            f"DELETE FROM {table} WHERE tenant_id = :t", {"t": test_tenant["id"]}
        )


async def _fill_usage(tenant_id: str, count: int, action: str = "COPY_SUGGEST") -> None:
    for _ in range(count):
        await _sql(
            "INSERT INTO ai_usage_log (id, tenant_id, action_type, tokens_used,"
            " created_at) VALUES (:id, :t, :a, 0, now())",
            {"id": str(uuid.uuid4()), "t": tenant_id, "a": action},
        )


class TestAssistEndpoint:
    async def test_requires_auth(self, client: AsyncClient):
        assert (await client.post(_SEO, json={"tone": "trust"})).status_code == 401

    async def test_switch_off_is_403(
        self, client: AsyncClient, auth_headers: dict, monkeypatch
    ):
        # 기본은 꺼짐 — 슈퍼 어드민이 사업체마다 켠다
        called = False

        async def fake_call(_messages):
            nonlocal called
            called = True
            return SEO_ANSWER, 10

        monkeypatch.setattr(ai_service, "_call_model", fake_call)
        resp = await client.post(_SEO, headers=auth_headers, json={"tone": "trust"})
        assert resp.status_code == 403
        assert called is False

    async def test_unknown_kind_is_404(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/ai/assist/translate", headers=auth_headers, json={"tone": "trust"}
        )
        assert resp.status_code == 404

    async def test_viewer_is_403(
        self, client: AsyncClient, test_user: dict, assist_tenant: dict
    ):
        await _sql(
            "UPDATE users SET role = 'TENANT_VIEWER' WHERE id = :i",
            {"i": test_user["id"]},
        )
        token = create_access_token(
            user_id=uuid.UUID(test_user["id"]),
            tenant_id=uuid.UUID(assist_tenant["id"]),
            role="TENANT_VIEWER",
        )
        resp = await client.post(
            _SEO, headers={"Authorization": f"Bearer {token}"}, json={"tone": "trust"}
        )
        assert resp.status_code == 403

    async def test_seo_reads_site_info_logs_and_counts_shared_limit(
        self, client: AsyncClient, auth_headers: dict, assist_tenant: dict, monkeypatch
    ):
        seen: list[str] = []

        async def fake_call(messages):
            seen.append("\n".join(str(m.content) for m in messages))
            return SEO_ANSWER, 120

        monkeypatch.setattr(ai_service, "_call_model", fake_call)
        await _fill_usage(assist_tenant["id"], 2)

        resp = await client.post(_SEO, headers=auth_headers, json={"tone": "friendly"})
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["result"]["meta_title"] == "바른치과의원 | 강남역 임플란트"
        # FREE 요금제는 키워드를 못 쓴다
        assert data["result"]["keywords"] == []
        # 문구 추천 2회 + 이번 1회 — 같은 한도(FREE 5)
        assert data["usage"] == {"used": 3, "limit": 5, "remaining": 2}

        prompt = seen[0]
        assert "바른치과의원" in prompt
        assert "서울특별시 강남구" in prompt
        assert "테헤란로" not in prompt  # 시 · 구까지만
        assert "02-123-4567" not in prompt  # 연락처는 보내지 않는다
        assert "친근하게" in prompt

        # 같은 입력이면 다시 부르지 않고 사용량도 그대로
        again = await client.post(_SEO, headers=auth_headers, json={"tone": "friendly"})
        assert again.status_code == 200
        assert again.json()["data"]["usage"]["used"] == 3
        assert len(seen) == 1

        usage = await client.get("/api/v1/ai/usage", headers=auth_headers)
        assert usage.json()["data"]["copy_suggest"]["used"] == 3

    async def test_geo_retries_once_then_succeeds(
        self, client: AsyncClient, auth_headers: dict, assist_tenant: dict, monkeypatch
    ):
        answers = iter(
            [
                "모양이 틀린 답",
                '{"description": "강남역 치과입니다.", "topics": ["임플란트"]}',
            ]
        )

        async def fake_call(_messages):
            return next(answers), 50

        monkeypatch.setattr(ai_service, "_call_model", fake_call)
        resp = await client.post(_GEO, headers=auth_headers, json={"tone": "trust"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["result"] == {
            "description": "강남역 치과입니다.",
            "topics": ["임플란트"],
        }

    async def test_wrong_answer_twice_is_502_and_not_counted(
        self, client: AsyncClient, auth_headers: dict, assist_tenant: dict, monkeypatch
    ):
        async def fake_call(_messages):
            return "모양이 틀린 답", 50

        monkeypatch.setattr(ai_service, "_call_model", fake_call)
        resp = await client.post(_GEO, headers=auth_headers, json={"tone": "expert"})
        assert resp.status_code == 502
        assert "AI 가 알맞은 답을 주지 못했어요" in resp.text
        usage = await client.get("/api/v1/ai/usage", headers=auth_headers)
        assert usage.json()["data"]["copy_suggest"]["used"] == 0

    async def test_no_api_key_is_502(
        self, client: AsyncClient, auth_headers: dict, assist_tenant: dict, monkeypatch
    ):
        async def down_call(_messages):
            raise RuntimeError("invalid api key")

        monkeypatch.setattr(ai_service, "_call_model", down_call)
        resp = await client.post(_SEO, headers=auth_headers, json={"tone": "trust"})
        assert resp.status_code == 502

    async def test_shared_limit_exceeded_is_422(
        self, client: AsyncClient, auth_headers: dict, assist_tenant: dict, monkeypatch
    ):
        async def fake_call(_messages):
            return SEO_ANSWER, 10

        monkeypatch.setattr(ai_service, "_call_model", fake_call)
        await _fill_usage(assist_tenant["id"], 3)
        await _fill_usage(assist_tenant["id"], 2, "assist_geo")
        resp = await client.post(_SEO, headers=auth_headers, json={"tone": "trust"})
        assert resp.status_code == 422

        # AI 보조 사용도 문구 추천 한도에 든다
        copy = await client.post(
            "/api/v1/ai/suggest-copy",
            headers=auth_headers,
            json={"section_type": "HERO_BANNER", "count": 1},
        )
        assert copy.status_code == 422

    async def test_bad_tone_is_rejected(
        self, client: AsyncClient, auth_headers: dict, assist_tenant: dict
    ):
        resp = await client.post(_SEO, headers=auth_headers, json={"tone": "angry"})
        assert resp.status_code in (400, 422)
