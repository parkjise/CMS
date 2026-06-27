"""T-068 AI 문구 추천 API 테스트.

- 순수 로직 테스트(parse/limit/prompt)는 DB 없이 실행된다.
- 엔드포인트 테스트는 테스트 DB + LLM 모킹(monkeypatch _call_model)이 필요하다.
"""

import pytest
from httpx import AsyncClient

from app.schemas.ai import CopySuggestRequest
from app.services import ai as ai_service
from app.services.ai_prompts import (
    PROMPT_VERSION,
    build_copy_messages,
    field_max_length,
)

# ───────────────────────── 순수 로직 (DB 불필요) ─────────────────────────


class TestParseSuggestions:
    def test_plain_json_array(self):
        out = ai_service.parse_suggestions('["가", "나", "다"]', count=3)
        assert out == ["가", "나", "다"]

    def test_code_fenced_json(self):
        content = '```json\n["가", "나", "다"]\n```'
        assert ai_service.parse_suggestions(content, count=3) == ["가", "나", "다"]

    def test_dict_with_suggestions_key(self):
        content = '{"suggestions": ["가", "나"]}'
        assert ai_service.parse_suggestions(content, count=3) == ["가", "나"]

    def test_truncates_to_count(self):
        out = ai_service.parse_suggestions('["1","2","3","4","5"]', count=3)
        assert out == ["1", "2", "3"]

    def test_drops_empty_items(self):
        out = ai_service.parse_suggestions('["가", "", "  ", "나"]', count=5)
        assert out == ["가", "나"]

    def test_invalid_json_raises(self):
        with pytest.raises(ValueError):
            ai_service.parse_suggestions("not json at all", count=3)

    def test_non_list_raises(self):
        with pytest.raises(ValueError):
            ai_service.parse_suggestions('"문구"', count=3)

    def test_empty_list_raises(self):
        with pytest.raises(ValueError):
            ai_service.parse_suggestions("[]", count=3)


class TestMonthlyLimit:
    def test_known_plans(self):
        assert ai_service.monthly_limit("FREE") == 5
        assert ai_service.monthly_limit("BASIC") == 20
        assert ai_service.monthly_limit("STANDARD") == 100
        assert ai_service.monthly_limit("PREMIUM") is None

    def test_case_insensitive(self):
        assert ai_service.monthly_limit("basic") == 20

    def test_unknown_plan_defaults(self):
        assert ai_service.monthly_limit("MYSTERY") == 20


class TestPromptBuilder:
    def test_field_max_length(self):
        assert field_max_length("main_title") == 40
        assert field_max_length("sub_title") == 100
        assert field_max_length("unknown_field") == 40

    def test_messages_include_context(self):
        messages = build_copy_messages(
            template_type="HOSPITAL",
            business_name="OO의원",
            keywords=["강남", "통증의학과"],
            tone="professional",
            current_value="기존 문구",
            count=3,
            max_length=40,
        )
        assert len(messages) == 2
        system = messages[0].content
        assert "OO의원" in system
        assert "강남" in system
        assert "professional" in system
        # 업종 가이드(의료기관)가 주입되었는지
        assert "의료" in system
        assert "기존 문구" in messages[1].content


# ───────────────────────── generate_suggestions (LLM 모킹) ─────────────────────────


class TestGenerateSuggestions:
    async def test_success(self, monkeypatch):
        async def fake_call(_messages):
            return '["가", "나", "다"]', 123

        monkeypatch.setattr(ai_service, "_call_model", fake_call)
        req = CopySuggestRequest(section_type="HERO_BANNER", count=3)
        suggestions, tokens = await ai_service.generate_suggestions(
            req, template_type="HOSPITAL", business_name="OO의원"
        )
        assert suggestions == ["가", "나", "다"]
        assert tokens == 123

    async def test_retries_once_then_succeeds(self, monkeypatch):
        calls = {"n": 0}

        async def flaky_call(_messages):
            calls["n"] += 1
            if calls["n"] == 1:
                return "깨진 응답", 10
            return '["복구된 문구"]', 20

        monkeypatch.setattr(ai_service, "_call_model", flaky_call)
        req = CopySuggestRequest(section_type="HERO_BANNER", count=1)
        suggestions, _ = await ai_service.generate_suggestions(
            req, template_type="GENERAL", business_name="가게"
        )
        assert suggestions == ["복구된 문구"]
        assert calls["n"] == 2

    async def test_persistent_failure_raises_502(self, monkeypatch):
        from fastapi import HTTPException

        async def bad_call(_messages):
            return "절대 JSON 아님", 5

        monkeypatch.setattr(ai_service, "_call_model", bad_call)
        req = CopySuggestRequest(section_type="HERO_BANNER", count=3)
        with pytest.raises(HTTPException) as exc:
            await ai_service.generate_suggestions(
                req, template_type="GENERAL", business_name="가게"
            )
        assert exc.value.status_code == 502


# ───────────────────────── 엔드포인트 (DB + LLM 모킹) ─────────────────────────


class TestSuggestCopyEndpoint:
    _url = "/api/v1/ai/suggest-copy"

    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.post(self._url, json={"section_type": "HERO_BANNER"})
        assert resp.status_code == 401

    async def test_success_returns_suggestions(
        self, client: AsyncClient, auth_headers: dict, monkeypatch
    ):
        async def fake_call(_messages):
            payload = '["전문적인 통증 치료", "강남 통증의학과", "비수술 통증 케어"]'
            return payload, 200

        monkeypatch.setattr(ai_service, "_call_model", fake_call)

        resp = await client.post(
            self._url,
            headers=auth_headers,
            json={
                "section_type": "HERO_BANNER",
                "field": "main_title",
                "current_value": "OO의원",
                "tenant_context": {
                    "template_type": "HOSPITAL",
                    "business_name": "OO의원",
                    "keywords": ["강남", "통증의학과"],
                },
                "tone": "professional",
                "count": 3,
            },
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["suggestions"]) == 3
        assert data["tokens_used"] == 200
        assert data["prompt_version"] == PROMPT_VERSION
        assert data["usage"]["used"] == 1

    async def test_plan_limit_exceeded(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict, monkeypatch
    ):
        # FREE 플랜 한도(5)만큼 사용 로그를 미리 채운다
        import uuid as _uuid

        from sqlalchemy import text

        from tests.conftest import _TestSession  # type: ignore

        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            for _ in range(5):
                await session.execute(
                    text(
                        "INSERT INTO ai_usage_log "
                        "(id, tenant_id, action_type, tokens_used, created_at) "
                        "VALUES (:id, :tid, 'COPY_SUGGEST', 0, now())"
                    ),
                    {"id": str(_uuid.uuid4()), "tid": test_tenant["id"]},
                )
            await session.commit()

        async def fake_call(_messages):
            return '["x"]', 1

        monkeypatch.setattr(ai_service, "_call_model", fake_call)

        resp = await client.post(
            self._url,
            headers=auth_headers,
            json={"section_type": "HERO_BANNER", "count": 1},
        )
        assert resp.status_code == 422


# ═════════════════════ T-069 대화형 편집 (chat-edit) ═════════════════════


class TestExtractActions:
    def test_fenced_single_action(self):
        text = (
            "추천드려요!\n```json\n"
            '{"action": "update_text", "field": "main_title", '
            '"new_value": "전문 통증의학과"}\n```'
        )
        actions = ai_service.extract_actions(text)
        assert len(actions) == 1
        assert actions[0]["action"] == "update_text"

    def test_fenced_action_array(self):
        text = (
            "```json\n"
            '[{"action": "update_text", "new_value": "A"}, '
            '{"action": "explain"}]\n```'
        )
        actions = ai_service.extract_actions(text)
        assert len(actions) == 2

    def test_bare_object_without_fence(self):
        text = '{"action": "change_template", "template_id": "t-1"}'
        actions = ai_service.extract_actions(text)
        assert actions[0]["action"] == "change_template"

    def test_ignores_unknown_action(self):
        text = '```json\n{"action": "delete_everything"}\n```'
        assert ai_service.extract_actions(text) == []

    def test_ignores_invalid_json(self):
        assert ai_service.extract_actions("설명만 있고 JSON 없음") == []

    def test_plain_explanation_no_actions(self):
        assert ai_service.extract_actions("안녕하세요, 무엇을 도와드릴까요?") == []


class TestChatLimit:
    def test_plan_limits(self):
        assert ai_service.chat_monthly_limit("FREE") == 0
        assert ai_service.chat_monthly_limit("BASIC") == 0
        assert ai_service.chat_monthly_limit("STANDARD") == 50
        assert ai_service.chat_monthly_limit("PREMIUM") is None

    def test_unknown_defaults_zero(self):
        assert ai_service.chat_monthly_limit("MYSTERY") == 0


class TestBuildChatMessages:
    def test_includes_context_and_history(self):
        from app.schemas.ai import ChatEditRequest, ChatMessage

        ctx = {"business_name": "OO의원", "sections": []}
        req = ChatEditRequest(
            message="메인 배너를 전문적으로 바꿔줘",
            conversation_history=[
                ChatMessage(role="user", content="안녕"),
                ChatMessage(role="assistant", content="안녕하세요"),
            ],
        )
        messages = ai_service.build_chat_messages(ctx, req)
        # system + 2 history + 1 current = 4
        assert len(messages) == 4
        assert "OO의원" in messages[0].content
        assert messages[-1].content == "메인 배너를 전문적으로 바꿔줘"


class TestStreamChatEvents:
    async def test_streams_deltas_then_actions_done(self, monkeypatch):
        action_block = (
            '```json\n{"action": "update_text", "field": "main_title", '
            '"new_value": "전문 통증의학과 OO의원"}\n```'
        )
        deltas = ["메인 ", "배너를 ", "바꿨어요!\n", action_block]

        async def fake_stream(_messages):
            for d in deltas:
                yield d

        monkeypatch.setattr(ai_service, "_stream_model", fake_stream)

        events = [ev async for ev in ai_service.stream_chat_events([])]

        delta_events = [e for e in events if '"type": "delta"' in e]
        assert len(delta_events) == len(deltas)

        actions_event = next(e for e in events if '"type": "actions"' in e)
        assert "update_text" in actions_event
        assert events[-1].startswith('data: {"type": "done"}')

    async def test_on_complete_receives_full_text(self, monkeypatch):
        async def fake_stream(_messages):
            yield "전체 "
            yield "텍스트"

        monkeypatch.setattr(ai_service, "_stream_model", fake_stream)

        captured = {}

        async def on_complete(text):
            captured["text"] = text

        _ = [ev async for ev in ai_service.stream_chat_events([], on_complete)]
        assert captured["text"] == "전체 텍스트"


class TestChatEditEndpoint:
    _url = "/api/v1/ai/chat-edit"

    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.post(self._url, json={"message": "안녕"})
        assert resp.status_code == 401

    async def test_forbidden_on_free_plan(
        self, client: AsyncClient, auth_headers: dict
    ):
        # test_tenant 기본 플랜은 FREE → 대화형 편집 미지원(403)
        resp = await client.post(
            self._url, headers=auth_headers, json={"message": "메인 배너 바꿔줘"}
        )
        assert resp.status_code == 403

    async def test_stream_on_standard_plan(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict, monkeypatch
    ):
        from sqlalchemy import text

        from tests.conftest import _TestSession  # type: ignore

        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text("UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :tid"),
                {"tid": test_tenant["id"]},
            )
            await session.commit()

        async def fake_stream(_messages):
            yield "메인 배너를 "
            yield "전문적으로 바꿨어요!\n"
            yield (
                '```json\n{"action": "update_text", '
                '"new_value": "전문 통증의학과"}\n```'
            )

        monkeypatch.setattr(ai_service, "_stream_model", fake_stream)

        resp = await client.post(
            self._url,
            headers=auth_headers,
            json={"message": "메인 배너를 전문적으로 바꿔줘"},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        body = resp.text
        assert '"type": "delta"' in body
        assert '"type": "actions"' in body
        assert "update_text" in body
        assert '"type": "done"' in body


# ═════════════════════ T-072 AI 사용량 현황 (usage) ═════════════════════


class TestBuildFeatureUsage:
    def test_limited_plan_not_exceeded(self):
        usage = ai_service._build_feature_usage(used=3, limit=20)
        assert usage.used == 3
        assert usage.limit == 20
        assert usage.remaining == 17
        assert usage.exceeded is False
        assert usage.supported is True

    def test_limited_plan_exceeded(self):
        usage = ai_service._build_feature_usage(used=20, limit=20)
        assert usage.remaining == 0
        assert usage.exceeded is True
        assert usage.supported is True

    def test_remaining_never_negative(self):
        usage = ai_service._build_feature_usage(used=25, limit=20)
        assert usage.remaining == 0
        assert usage.exceeded is True

    def test_unlimited_plan(self):
        usage = ai_service._build_feature_usage(used=999, limit=None)
        assert usage.limit is None
        assert usage.remaining is None
        assert usage.exceeded is False
        assert usage.supported is True

    def test_unsupported_feature(self):
        # limit == 0 → 미지원 (대화형 편집 FREE/BASIC)
        usage = ai_service._build_feature_usage(used=0, limit=0)
        assert usage.supported is False
        assert usage.exceeded is True
        assert usage.remaining == 0


class TestAiUsageEndpoint:
    _url = "/api/v1/ai/usage"

    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.get(self._url)
        assert resp.status_code == 401

    async def test_free_plan_usage(self, client: AsyncClient, auth_headers: dict):
        # test_tenant 기본 플랜은 FREE → 문구 추천 5, 대화형 편집 미지원(0)
        resp = await client.get(self._url, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["plan_type"] == "FREE"
        assert data["copy_suggest"]["limit"] == 5
        assert data["copy_suggest"]["used"] == 0
        assert data["copy_suggest"]["remaining"] == 5
        assert data["copy_suggest"]["supported"] is True
        assert data["chat_edit"]["supported"] is False
        assert data["chat_edit"]["limit"] == 0

    async def test_reflects_logged_usage(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        import uuid as _uuid

        from sqlalchemy import text

        from tests.conftest import _TestSession  # type: ignore

        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            for _ in range(3):
                await session.execute(
                    text(
                        "INSERT INTO ai_usage_log "
                        "(id, tenant_id, action_type, tokens_used, created_at) "
                        "VALUES (:id, :tid, 'COPY_SUGGEST', 0, now())"
                    ),
                    {"id": str(_uuid.uuid4()), "tid": test_tenant["id"]},
                )
            await session.commit()

        resp = await client.get(self._url, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["copy_suggest"]["used"] == 3
        assert data["copy_suggest"]["remaining"] == 2

    async def test_standard_plan_supports_chat(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        from sqlalchemy import text

        from tests.conftest import _TestSession  # type: ignore

        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text("UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :tid"),
                {"tid": test_tenant["id"]},
            )
            await session.commit()

        resp = await client.get(self._url, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["plan_type"] == "STANDARD"
        assert data["chat_edit"]["limit"] == 50
        assert data["chat_edit"]["supported"] is True
        assert data["copy_suggest"]["limit"] == 100
