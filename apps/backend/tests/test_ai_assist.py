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
        result = ai_assist.parse_assist_result("seo", content)
        assert len(result.meta_title) == 60
        assert len(result.meta_description) == 160
        # 중복 · 빈 값 · 30자 넘는 낱말은 빼고 5개로
        assert result.keywords == ["임플란트", "강남 치과", "k0", "k1", "k2"]

    def test_seo_without_keyword_plan_has_no_keywords(self):
        result = ai_assist.parse_assist_result(
            "seo", SEO_ANSWER, ai_assist.AssistContext(allow_keywords=False)
        )
        assert result.keywords == []

    def test_geo_cuts_topics(self):
        content = json.dumps(
            {"description": "소개" * 300, "topics": [f"주제{i}" for i in range(15)]},
            ensure_ascii=False,
        )
        result = ai_assist.parse_assist_result("geo", content)
        assert len(result.description) == 500
        assert len(result.topics) == 10

    def test_code_fence_is_fine(self):
        result = ai_assist.parse_assist_result("seo", f"```json\n{SEO_ANSWER}\n```")
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
            ai_assist.parse_assist_result("seo", content)

    def test_geo_needs_description(self):
        with pytest.raises(ValueError):
            ai_assist.parse_assist_result("geo", '{"topics": ["a"]}')


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


# ═════════════════════ T-232-B 게시판 구성 추천 (board) ═════════════════════

_BOARD = "/api/v1/ai/assist/board"

BOARD_ANSWER = {
    "board_type": "REVIEW",
    "name": "치료 후기",
    "description": "진료를 받은 분들의 후기를 모읍니다.",
    "fields": [
        {"label": "받은 진료", "field_type": "SELECT", "choices": ["임플란트", "교정"]},
        {"label": "방문 시기", "field_type": "DATE", "choices": []},
    ],
    "categories": ["임플란트", "교정"],
    "permissions": {"read": "PUBLIC", "write": "MEMBER"},
    "operation": {"allow_secret": False, "notify_new_post": True, "allow_guest": True},
    "reason": "후기는 회원이 쓰고 새 글은 알림으로 확인해요.",
}


def _board(ctx: ai_assist.AssistContext | None = None, **overrides):
    content = json.dumps({**BOARD_ANSWER, **overrides}, ensure_ascii=False)
    return ai_assist.parse_assist_result("board", content, ctx)


class TestBoardResult:
    def test_dangerous_review_guest_is_turned_off_with_reason(self):
        result = _board()
        assert result.board_type == "REVIEW"
        assert result.operation.allow_guest is False
        assert result.operation.notify_new_post is True
        assert result.reason.endswith(ai_assist.NOTE_GUEST_REVIEW)

    def test_guest_needs_member_writing(self):
        result = _board(
            board_type="LIST", permissions={"read": "PUBLIC", "write": "ADMIN"}
        )
        assert result.operation.allow_guest is False
        assert ai_assist.NOTE_GUEST_MEMBER_ONLY in result.reason

    def test_blocked_type_becomes_list(self):
        ctx = ai_assist.AssistContext(blocked_types={"REVIEW": "병원 업종은 안 돼요."})
        result = _board(ctx)
        assert result.board_type == "LIST"
        assert "병원 업종은 안 돼요. 목록형으로 바꿨어요." in result.reason

    def test_unknown_type_becomes_list(self):
        assert _board(board_type="FORUM").board_type == "LIST"

    def test_member_access_blocked_falls_back(self):
        ctx = ai_assist.AssistContext(read_blocked="꺼짐", write_blocked="병원")
        result = _board(
            ctx,
            board_type="LIST",
            permissions={"read": "MEMBER", "write": "MEMBER"},
            operation={"allow_guest": False},
        )
        assert result.permissions.read == "PUBLIC"
        assert result.permissions.write == "ADMIN"
        assert ai_assist.NOTE_READ_BLOCKED in result.reason
        assert ai_assist.NOTE_WRITE_BLOCKED in result.reason

    def test_fields_and_categories_are_cut_to_save_rules(self):
        fields = [
            {"label": "별점", "field_type": "RATING"},  # 리뷰형이 늘 만든다
            {"label": "제목", "field_type": "TEXT"},  # 원래 있는 칸
            {"label": "고르기", "field_type": "SELECT", "choices": []},  # 선택지 없음
            {"label": "모르는 칸", "field_type": "MAP"},
            {"label": "있는 칸", "field_type": "TEXT"},
            {"label": "있는칸", "field_type": "TEXT"},  # 띄어쓰기만 다른 이름
        ] + [{"label": f"칸 {i}", "field_type": "TEXT"} for i in range(12)]
        categories = ["예약", "예 약", "있는 분류", "x" * 31] + [
            f"분류{i}" for i in range(15)
        ]
        ctx = ai_assist.AssistContext(
            taken_fields={ai_assist.same_name(n) for n in ("제목", "있는 칸")},
            taken_categories={ai_assist.same_name("있는분류")},
        )
        result = _board(ctx, fields=fields, categories=categories)
        assert [f.label for f in result.fields] == [f"칸 {i}" for i in range(8)]
        assert result.categories == ["예약"] + [f"분류{i}" for i in range(9)]

    def test_adding_to_existing_board_keeps_its_type(self):
        result = _board(ai_assist.AssistContext(fixed_type="FAQ"))
        assert result.board_type == "FAQ"

    def test_needs_name(self):
        with pytest.raises(ValueError):
            _board(name="  ")


@pytest.fixture
async def board_tenant(test_tenant: dict, monkeypatch):
    from app.services import site_cache

    async def no_purge(_db, _tenant_id):
        return True

    monkeypatch.setattr(site_cache, "purge_site", no_purge)
    await _enable(test_tenant["id"], "AI_BOARD_ASSIST")
    yield test_tenant
    for table in ("ai_usage_log", "tenant_features"):
        await _sql(
            f"DELETE FROM {table} WHERE tenant_id = :t", {"t": test_tenant["id"]}
        )


class TestBoardEndpoint:
    async def test_site_switch_alone_is_not_enough(
        self, client: AsyncClient, auth_headers: dict, assist_tenant: dict
    ):
        # AI_SITE_ASSIST 만 켠 사업체 — 게시판 보조는 AI_BOARD_ASSIST
        resp = await client.post(_BOARD, headers=auth_headers, json={"purpose": "후기"})
        assert resp.status_code == 403

    async def test_purpose_is_required(
        self, client: AsyncClient, auth_headers: dict, board_tenant: dict
    ):
        resp = await client.post(_BOARD, headers=auth_headers, json={"purpose": "  "})
        assert resp.status_code == 400
        assert resp.json()["error"]["field"] == "purpose"

    async def test_hospital_never_gets_review_type(
        self, client: AsyncClient, auth_headers: dict, board_tenant: dict, monkeypatch
    ):
        await _sql(
            "UPDATE tenants SET template_type = 'HOSPITAL' WHERE id = :t",
            {"t": board_tenant["id"]},
        )
        seen: list[str] = []

        async def fake_call(messages):
            seen.append("\n".join(str(m.content) for m in messages))
            return json.dumps(BOARD_ANSWER, ensure_ascii=False), 300

        monkeypatch.setattr(ai_service, "_call_model", fake_call)
        resp = await client.post(
            _BOARD, headers=auth_headers, json={"purpose": "치료 후기를 받는 게시판"}
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()["data"]["result"]
        assert result["board_type"] == "LIST"
        # 병원은 회원 글쓰기도 못 쓴다
        assert result["permissions"]["write"] == "ADMIN"
        assert result["operation"]["allow_guest"] is False
        assert [f["label"] for f in result["fields"]] == ["받은 진료", "방문 시기"]
        assert "치료 후기를 받는 게시판" in seen[0]
        assert "REVIEW 리뷰형" not in seen[0]  # 고를 수 있는 유형에서 뺐다
        assert resp.json()["data"]["usage"]["used"] == 1

    async def test_existing_board_gets_only_new_fields_and_categories(
        self, client: AsyncClient, auth_headers: dict, board_tenant: dict, monkeypatch
    ):
        # 게시판 추가는 STANDARD 부터
        await _sql(
            "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t",
            {"t": board_tenant["id"]},
        )
        made = await client.post(
            "/api/v1/boards",
            headers=auth_headers,
            json={"name": "자주 묻는 질문", "board_type": "FAQ"},
        )
        assert made.status_code == 201, made.text
        board_id = made.json()["data"]["id"]
        field = await client.post(
            f"/api/v1/boards/{board_id}/fields",
            headers=auth_headers,
            json={"label": "방문 시기", "field_type": "DATE"},
        )
        assert field.status_code == 201, field.text
        category = await client.post(
            f"/api/v1/boards/{board_id}/categories",
            headers=auth_headers,
            json={"name": "교정"},
        )
        assert category.status_code == 201, category.text

        seen: list[str] = []

        async def fake_call(messages):
            seen.append("\n".join(str(m.content) for m in messages))
            return json.dumps(BOARD_ANSWER, ensure_ascii=False), 300

        monkeypatch.setattr(ai_service, "_call_model", fake_call)
        resp = await client.post(
            _BOARD,
            headers=auth_headers,
            json={"purpose": "예약 질문", "board_id": board_id},
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()["data"]["result"]
        assert result["board_type"] == "FAQ"
        assert [f["label"] for f in result["fields"]] == ["받은 진료"]
        assert result["categories"] == ["임플란트"]
        assert "방문 시기" in seen[0]  # 있는 필드를 알려 준다

    async def test_unknown_board_is_404(
        self, client: AsyncClient, auth_headers: dict, board_tenant: dict, monkeypatch
    ):
        async def fake_call(_messages):
            return json.dumps(BOARD_ANSWER, ensure_ascii=False), 1

        monkeypatch.setattr(ai_service, "_call_model", fake_call)
        resp = await client.post(
            _BOARD,
            headers=auth_headers,
            json={"purpose": "후기", "board_id": str(uuid.uuid4())},
        )
        assert resp.status_code == 404


# ═════════════════════ T-233-B 공지 · FAQ 글 초안 (post) ═════════════════════

_POST = "/api/v1/ai/assist/post"

POST_ANSWER = {
    "titles": ["추석 연휴 휴진 안내", "추석 연휴 진료 일정", "[공지] 추석 휴진"],
    "body": [
        {"type": "p", "text": "추석 연휴 동안 휴진합니다.\n진료 일정에 참고해 주세요."},
        {"type": "ul", "items": ["휴진: 9월 14일 ~ 18일", "정상 진료: 9월 19일"]},
    ],
}


def _post(ctx: ai_assist.AssistContext | None = None, **overrides):
    content = json.dumps({**POST_ANSWER, **overrides}, ensure_ascii=False)
    return ai_assist.parse_assist_result("post", content, ctx)


class TestPostResult:
    def test_titles_and_paragraph_list_body(self):
        result = _post()
        assert result.titles == POST_ANSWER["titles"]
        assert result.model_dump()["body"] == POST_ANSWER["body"]

    def test_cuts_and_drops_unknown_blocks(self):
        result = _post(
            titles=["가" * 250, "같은 제목", "같은 제목", "넷째", "다섯째"],
            body=[
                {"type": "h2", "text": "제목 칸은 받지 않는다"},
                {"type": "p", "text": "  "},
                {"type": "ul", "items": ["", *[f"항목 {i}" for i in range(15)]]},
            ]
            + [{"type": "p", "text": f"문단 {i}"} for i in range(20)],
        )
        assert result.titles == ["가" * 200, "같은 제목", "넷째"]
        assert len(result.body) == 12
        assert result.body[0].items == [f"항목 {i}" for i in range(10)]

    def test_faq_has_one_question(self):
        result = _post(ai_assist.AssistContext(faq=True))
        assert result.titles == ["추석 연휴 휴진 안내"]

    def test_question_answer_keys_and_plain_text_body(self):
        content = json.dumps(
            {"question": "주차되나요?", "answer": "네, 됩니다.\n\n2시간 무료예요."},
            ensure_ascii=False,
        )
        result = ai_assist.parse_assist_result(
            "post", content, ai_assist.AssistContext(faq=True)
        )
        assert result.titles == ["주차되나요?"]
        assert [b.text for b in result.body] == ["네, 됩니다.", "2시간 무료예요."]

    @pytest.mark.parametrize("override", [{"titles": []}, {"body": []}])
    def test_needs_title_and_body(self, override: dict):
        with pytest.raises(ValueError):
            _post(**override)


async def _make_board(client: AsyncClient, headers: dict, tenant_id: str, **body):
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t", {"t": tenant_id}
    )
    resp = await client.post("/api/v1/boards", headers=headers, json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


class TestPostEndpoint:
    async def test_memo_and_board_are_required(
        self, client: AsyncClient, auth_headers: dict, board_tenant: dict
    ):
        no_memo = await client.post(
            _POST, headers=auth_headers, json={"board_id": str(uuid.uuid4())}
        )
        assert no_memo.status_code == 400
        assert no_memo.json()["error"]["field"] == "memo"
        no_board = await client.post(_POST, headers=auth_headers, json={"memo": "휴진"})
        assert no_board.status_code == 400
        assert no_board.json()["error"]["field"] == "board_id"
        unknown = await client.post(
            _POST,
            headers=auth_headers,
            json={"memo": "휴진", "board_id": str(uuid.uuid4())},
        )
        assert unknown.status_code == 404

    async def test_notice_draft_uses_memo_and_business_contact(
        self, client: AsyncClient, auth_headers: dict, board_tenant: dict, monkeypatch
    ):
        board_id = await _make_board(
            client, auth_headers, board_tenant["id"], name="병원 소식"
        )
        await _sql(
            "INSERT INTO site_settings (id, tenant_id, site_name, phone, address,"
            " created_at, updated_at) VALUES (gen_random_uuid(), :t, '바른치과의원',"
            " '02-123-4567', '서울특별시 강남구 테헤란로 1', now(), now())",
            {"t": board_tenant["id"]},
        )
        seen: list[str] = []

        async def fake_call(messages):
            seen.append("\n".join(str(m.content) for m in messages))
            return json.dumps(POST_ANSWER, ensure_ascii=False), 200

        monkeypatch.setattr(ai_service, "_call_model", fake_call)
        resp = await client.post(
            _POST,
            headers=auth_headers,
            json={"memo": "추석 연휴 9/14~9/18 휴진", "board_id": board_id},
        )
        await _sql(
            "DELETE FROM site_settings WHERE tenant_id = :t", {"t": board_tenant["id"]}
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["result"]["titles"] == POST_ANSWER["titles"]
        assert data["usage"]["used"] == 1
        prompt = seen[0]
        assert "추석 연휴 9/14~9/18 휴진" in prompt
        assert "바른치과의원" in prompt
        assert "02-123-4567" in prompt  # 사업체 연락처는 글에 쓸 수 있게
        assert "테헤란로" not in prompt  # 주소는 보내지 않는다
        assert "제목 후보 3개" in prompt

    async def test_faq_board_gets_question_and_answer(
        self, client: AsyncClient, auth_headers: dict, board_tenant: dict, monkeypatch
    ):
        board_id = await _make_board(
            client,
            auth_headers,
            board_tenant["id"],
            name="자주 묻는 질문",
            board_type="FAQ",
        )
        seen: list[str] = []

        async def fake_call(messages):
            seen.append("\n".join(str(m.content) for m in messages))
            return json.dumps(POST_ANSWER, ensure_ascii=False), 200

        monkeypatch.setattr(ai_service, "_call_model", fake_call)
        resp = await client.post(
            _POST,
            headers=auth_headers,
            json={"memo": "주차 되나요? 2시간 무료", "board_id": board_id},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["result"]["titles"] == ["추석 연휴 휴진 안내"]
        assert "titles 는 질문 하나" in seen[0]

    async def test_site_switch_alone_is_not_enough(
        self, client: AsyncClient, auth_headers: dict, assist_tenant: dict
    ):
        resp = await client.post(
            _POST,
            headers=auth_headers,
            json={"memo": "휴진", "board_id": str(uuid.uuid4())},
        )
        assert resp.status_code == 403


# ═════════════════════ T-234-B 약관 변경 요약 (policy_summary) ═════════════════════

_POLICY = "/api/v1/ai/assist/policy_summary"


class TestChangedLines:
    def test_only_changed_lines_with_marks(self):
        before = "제1조 목적\n\n제2조 정의\n보관 기간은 1년\n제3조 끝"
        after = "제1조 목적\n\n제2조 정의\n보관 기간은 3년\n\n제3조 끝\n제4조 새 조항"
        lines, added, removed = ai_assist.changed_lines(before, after)
        assert lines == ["- 보관 기간은 1년", "+ 보관 기간은 3년", "+ 제4조 새 조항"]
        assert (added, removed) == (2, 1)

    def test_long_changes_are_cut(self):
        after = "\n".join(f"새 줄 {i} " + "가" * 50 for i in range(500))
        lines, added, _removed = ai_assist.changed_lines("", after)
        assert added == 500
        assert len(lines) < 200
        assert sum(len(line) for line in lines) <= ai_assist.CHANGED_CHARS_MAX

    def test_summary_is_one_to_three_lines(self):
        content = json.dumps(
            {"summary": "첫 줄\n\n둘째 줄\n셋째 줄\n넷째 줄"}, ensure_ascii=False
        )
        result = ai_assist.parse_assist_result("policy_summary", content)
        assert result.summary == "첫 줄\n둘째 줄\n셋째 줄"
        long = json.dumps({"summary": "가" * 700}, ensure_ascii=False)
        cut = ai_assist.parse_assist_result("policy_summary", long)
        assert len(cut.summary) == 500
        with pytest.raises(ValueError):
            ai_assist.parse_assist_result("policy_summary", '{"summary": " "}')


class TestPolicySummaryEndpoint:
    async def _published(self, client: AsyncClient, headers: dict) -> str:
        resp = await client.get("/api/v1/site-settings/policies", headers=headers)
        assert resp.status_code == 200, resp.text
        return resp.json()["data"]["terms"]["body"]

    async def test_needs_kind_and_a_change(
        self, client: AsyncClient, auth_headers: dict, assist_tenant: dict
    ):
        no_kind = await client.post(_POLICY, headers=auth_headers, json={"body": "x"})
        assert no_kind.status_code == 400
        assert no_kind.json()["error"]["field"] == "kind"
        published = await self._published(client, auth_headers)
        same = await client.post(
            _POLICY, headers=auth_headers, json={"kind": "terms", "body": published}
        )
        assert same.status_code == 400
        assert same.json()["error"]["field"] == "body"

    async def test_sends_only_changed_lines(
        self, client: AsyncClient, auth_headers: dict, assist_tenant: dict, monkeypatch
    ):
        published = await self._published(client, auth_headers)
        seen: list[str] = []

        async def fake_call(messages):
            seen.append("\n".join(str(m.content) for m in messages))
            return '{"summary": "보관 기간 조항을 더했습니다."}', 80

        monkeypatch.setattr(ai_service, "_call_model", fake_call)
        edited = published + "\n제99조 (보관) 기록은 3년 보관합니다."
        resp = await client.post(
            _POLICY, headers=auth_headers, json={"kind": "terms", "body": edited}
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["result"] == {
            "summary": "보관 기간 조항을 더했습니다."
        }
        prompt = seen[0]
        assert "+ 제99조 (보관) 기록은 3년 보관합니다." in prompt
        # 약관 전체를 보내지 않는다 — 바뀌지 않은 첫 줄은 없다
        first = next(line for line in published.splitlines() if line.strip())
        assert first not in prompt
        assert resp.json()["data"]["usage"]["used"] == 1


# ═════════════════════ T-248 페이지 검색 문구 (page_seo) ═════════════════════

_PAGE_SEO = "/api/v1/ai/assist/page_seo"

PAGE_SEO_ANSWER = json.dumps(
    {
        "seo_title": "임플란트 안내 | 바른치과의원",
        "seo_description": "바른치과의원의 임플란트 진료 과정을 안내합니다.",
    },
    ensure_ascii=False,
)


class TestPageSeoResult:
    def test_cuts_to_page_field_limits(self):
        content = json.dumps(
            {"seo_title": "가" * 80, "seo_description": "나" * 200}, ensure_ascii=False
        )
        result = ai_assist.parse_assist_result("page_seo", content)
        assert len(result.seo_title) == 60
        assert len(result.seo_description) == 160

    def test_empty_text_is_wrong_answer(self):
        with pytest.raises(ValueError):
            ai_assist.parse_assist_result(
                "page_seo", '{"seo_title": "제목", "seo_description": " "}'
            )


async def _page(tenant_id: str, key: str, title: str, **seo: str) -> str:
    page_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO pages (id, tenant_id, page_key, title, origin, show_in_menu,"
        " is_public, display_order, seo_title, seo_description, noindex,"
        " created_at, updated_at) VALUES (:id, :t, :k, :title, 'CUSTOM', true,"
        " true, 0, :st, :sd, false, now(), now())",
        {
            "id": page_id,
            "t": tenant_id,
            "k": key,
            "title": title,
            "st": seo.get("seo_title"),
            "sd": seo.get("seo_description"),
        },
    )
    return page_id


async def _section(tenant_id: str, page_key: str, label: str) -> None:
    await _sql(
        "INSERT INTO sections (id, tenant_id, section_type, label, display_order,"
        " page_key, is_active, created_at, updated_at) VALUES (gen_random_uuid(),"
        " :t, 'INTRO', :label, 0, :k, true, now(), now())",
        {"t": tenant_id, "label": label, "k": page_key},
    )


@pytest.fixture
async def page_tenant(assist_tenant: dict):
    yield assist_tenant
    await _sql("DELETE FROM pages WHERE tenant_id = :t", {"t": assist_tenant["id"]})


class TestPageSeoEndpoint:
    async def test_needs_a_live_page_other_than_home(
        self, client: AsyncClient, auth_headers: dict, page_tenant: dict
    ):
        no_page = await client.post(_PAGE_SEO, headers=auth_headers, json={})
        assert no_page.status_code == 400
        assert no_page.json()["error"]["field"] == "page_id"

        unknown = await client.post(
            _PAGE_SEO, headers=auth_headers, json={"page_id": str(uuid.uuid4())}
        )
        assert unknown.status_code == 404

        # 홈은 사이트 SEO 설정 값을 쓴다
        home = await _page(page_tenant["id"], "home", "홈")
        resp = await client.post(
            _PAGE_SEO, headers=auth_headers, json={"page_id": home}
        )
        assert resp.status_code == 400
        assert "SEO 설정" in resp.json()["error"]["message"]

    async def test_other_tenant_page_is_404(
        self, client: AsyncClient, auth_headers: dict, page_tenant: dict
    ):
        other = str(uuid.uuid4())
        await _sql(
            "INSERT INTO tenants (id, name, slug, plan_type, is_active,"
            " created_at, updated_at) VALUES (:id, '다른 곳', :slug, 'FREE', true,"
            " now(), now())",
            {"id": other, "slug": f"other-{other[:8]}"},
        )
        try:
            page_id = await _page(other, "about", "소개")
            resp = await client.post(
                _PAGE_SEO, headers=auth_headers, json={"page_id": page_id}
            )
            assert resp.status_code == 404
        finally:
            await _sql("DELETE FROM pages WHERE tenant_id = :t", {"t": other})
            await _sql("DELETE FROM tenants WHERE id = :t", {"t": other})

    async def test_uses_only_that_pages_sections_and_counts_limit(
        self, client: AsyncClient, auth_headers: dict, page_tenant: dict, monkeypatch
    ):
        seen: list[str] = []

        async def fake_call(messages):
            seen.append("\n".join(str(m.content) for m in messages))
            return PAGE_SEO_ANSWER, 90

        monkeypatch.setattr(ai_service, "_call_model", fake_call)
        tenant_id = page_tenant["id"]
        page_id = await _page(
            tenant_id, "implant", "임플란트", seo_title="옛 임플란트 제목"
        )
        await _section(tenant_id, "implant", "임플란트 치료 과정")
        await _section(tenant_id, "home", "메인 배너 문구")

        resp = await client.post(
            _PAGE_SEO,
            headers=auth_headers,
            json={"page_id": page_id, "tone": "expert"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["result"] == {
            "seo_title": "임플란트 안내 | 바른치과의원",
            "seo_description": "바른치과의원의 임플란트 진료 과정을 안내합니다.",
        }
        assert data["usage"]["used"] == 1

        prompt = seen[0]
        assert "임플란트 치료 과정" in prompt
        assert "옛 임플란트 제목" in prompt
        assert "바른치과의원" in prompt
        assert "메인 배너 문구" not in prompt  # 다른 페이지 섹션은 보내지 않는다
        assert "02-123-4567" not in prompt
        assert "전문적으로" in prompt

        logged = await client.get("/api/v1/ai/usage", headers=auth_headers)
        assert logged.json()["data"]["copy_suggest"]["used"] == 1
