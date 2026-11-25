"""메인 화면 최신 글 · 게시판 연결 섹션 (T-185, T-243 — 페이지 기획서 PM-05 · CM-03)."""

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text

from app.core.security import create_access_token
from app.services import feature as feature_service
from app.services import site_cache
from tests.conftest import _TestSession  # type: ignore

BOARDS = "/api/v1/boards"
SECTIONS = "/api/v1/sections"


async def _sql(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        rows = result.fetchall() if result.returns_rows else None
        await s.commit()
    return rows


@pytest.fixture(autouse=True)
def purged(monkeypatch) -> None:
    async def fake_purge(_db, _tenant_id):
        return True

    monkeypatch.setattr(site_cache, "purge_site", fake_purge)


@pytest.fixture
async def tenant(test_tenant, test_user) -> AsyncIterator[dict]:
    await feature_service.invalidate_cache(test_tenant["id"])
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t", t=test_tenant["id"]
    )
    yield test_tenant
    await _sql("DELETE FROM audit_logs WHERE tenant_id = :t", t=test_tenant["id"])
    await _sql("DELETE FROM tenant_features WHERE tenant_id = :t", t=test_tenant["id"])
    await feature_service.invalidate_cache(test_tenant["id"])


async def _board(client, headers, slug: str) -> dict:
    resp = await client.post(
        BOARDS, json={"name": f"{slug} 게시판", "slug": slug}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _section(tenant_id: str, section_type: str) -> str:
    section_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO sections (id, tenant_id, section_type, label, display_order,"
        " page_key, is_active, created_at, updated_at)"
        " VALUES (:id, :t, :type, '최신', 0, 'home', true, now(), now())",
        id=section_id,
        t=tenant_id,
        type=section_type,
    )
    return section_id


async def _save(client, headers, section_id: str, **values: str):
    return await client.patch(
        f"{SECTIONS}/{section_id}",
        json={
            "settings": [
                {"field_key": k, "field_value": v, "value_type": "STRING"}
                for k, v in values.items()
            ]
        },
        headers=headers,
    )


def _settings(resp) -> dict[str, dict]:
    return {s["field_key"]: s for s in resp.json()["data"]["settings"]}


@pytest.fixture
async def other_board(client) -> AsyncIterator[dict]:
    """다른 사업체의 게시판"""
    tenant_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
        " updated_at) VALUES (:id, '다른 곳', :slug, 'STANDARD', true, now(), now())",
        id=tenant_id,
        slug=f"other-{tenant_id[:8]}",
    )
    user_id = uuid.uuid4()
    await _sql(
        "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
        " created_at, updated_at) VALUES (:id, :t, :email, 'x', 'TENANT_ADMIN', true,"
        " now(), now())",
        id=str(user_id),
        t=tenant_id,
        email=f"a@{tenant_id[:8]}.com",
    )
    token = create_access_token(
        user_id=user_id, tenant_id=uuid.UUID(tenant_id), role="TENANT_ADMIN"
    )
    board = await _board(client, {"Authorization": f"Bearer {token}"}, "theirs")
    yield board
    await _sql("DELETE FROM boards WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM audit_logs WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM users WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM tenants WHERE id = :t", t=tenant_id)


class TestAddSection:
    async def test_addable_and_starts_without_board(self, client, auth_headers, tenant):
        limits = (await client.get(f"{SECTIONS}/limits", headers=auth_headers)).json()
        assert {
            "section_type": "BOARD_LATEST",
            "label": "게시판 연결",
            "variant": None,
        } in limits["data"]["addable_types"]
        resp = await client.post(
            SECTIONS, json={"section_type": "BOARD_LATEST"}, headers=auth_headers
        )
        assert resp.status_code == 201, resp.text
        settings = _settings(resp)
        assert settings["section_title"]["field_value"] == "최신 글"
        # 게시판은 고객이 고른다 — 고르기 전에는 홈페이지에 보이지 않는다
        assert "latest_board" not in settings


class TestSaveSettings:
    async def test_saves_board_and_count(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, "news")
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(
            client,
            auth_headers,
            section_id,
            latest_board=f" {board['id']} ",
            post_count="6",
        )
        assert resp.status_code == 200, resp.text
        settings = _settings(resp)
        assert settings["latest_board"]["field_value"] == board["id"]
        assert settings["post_count"]["field_value"] == "6"
        assert settings["post_count"]["value_type"] == "INTEGER"

    async def test_empty_board_allowed(self, client, auth_headers, tenant):
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(
            client, auth_headers, section_id, latest_board="", post_count=""
        )
        assert resp.status_code == 200
        assert _settings(resp)["latest_board"]["field_value"] == ""

    @pytest.mark.parametrize("count", ["2", "13", "다섯"])
    async def test_count_range(self, client, auth_headers, tenant, count):
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(client, auth_headers, section_id, post_count=count)
        assert resp.status_code == 400
        assert "3~12" in resp.json()["error"]["message"]

    async def test_notice_section_keeps_eight(self, client, auth_headers, tenant):
        """코드형 최신 공지는 그대로 3~8개"""
        section_id = await _section(tenant["id"], "NOTICE_LATEST")
        resp = await _save(client, auth_headers, section_id, post_count="9")
        assert resp.status_code == 400
        assert "3~8" in resp.json()["error"]["message"]

    @pytest.mark.parametrize("value", ["not-a-uuid", str(uuid.uuid4())])
    async def test_unknown_board(self, client, auth_headers, tenant, value):
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(client, auth_headers, section_id, latest_board=value)
        assert resp.status_code == 400
        assert "게시판" in resp.json()["error"]["message"]

    async def test_other_tenant_board(self, client, auth_headers, tenant, other_board):
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(
            client, auth_headers, section_id, latest_board=other_board["id"]
        )
        assert resp.status_code == 400

    async def test_deleted_board(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, "gone")
        await _sql("UPDATE boards SET deleted_at = now() WHERE id = :b", b=board["id"])
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(client, auth_headers, section_id, latest_board=board["id"])
        assert resp.status_code == 400

    async def test_member_only_board(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, "members")
        await _sql(
            "UPDATE boards SET settings = jsonb_set(coalesce(settings, '{}'::jsonb),"
            ' \'{permissions}\', \'{"read": "MEMBER", "write": "ADMIN"}\')'
            " WHERE id = :b",
            b=board["id"],
        )
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(client, auth_headers, section_id, latest_board=board["id"])
        assert resp.status_code == 400
        assert "회원만" in resp.json()["error"]["message"]

    async def test_code_template_notice_section(self, client, auth_headers, tenant):
        """코드형 최신 공지도 같은 칸으로 다른 게시판을 고른다"""
        board = await _board(client, auth_headers, "events")
        section_id = await _section(tenant["id"], "NOTICE_LATEST")
        resp = await _save(client, auth_headers, section_id, latest_board=board["id"])
        assert resp.status_code == 200
        resp = await _save(client, auth_headers, section_id, post_count="1")
        assert resp.status_code == 400

    async def test_other_sections_untouched(self, client, auth_headers, tenant):
        section_id = await _section(tenant["id"], "INTRO")
        resp = await _save(client, auth_headers, section_id, post_count="1")
        assert resp.status_code == 200


async def _post(client, headers, board_id: str, title: str, **extra) -> dict:
    body = extra.pop("body", [{"type": "p", "text": f"{title} 본문"}])
    resp = await client.post(
        f"{BOARDS}/{board_id}/posts",
        json={"title": title, "body": body, "status": "PUBLISHED", **extra},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _category(client, headers, board_id: str, name: str) -> dict:
    resp = await client.post(
        f"{BOARDS}/{board_id}/categories", json={"name": name}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


class TestConnectSettings:
    """게시판 연결 칸 (T-243) — 보여 주는 방식 · 정렬 · 분류 · 빈 결과 문구"""

    async def test_saves_connect_fields(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, "services")
        category = await _category(client, auth_headers, board["id"], "진료")
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(
            client,
            auth_headers,
            section_id,
            latest_board=board["id"],
            post_count="12",
            display_mode="CARD",
            sort="oldest",
            category_id=category["id"],
            empty_text="  준비 중이에요  ",
        )
        assert resp.status_code == 200, resp.text
        settings = _settings(resp)
        assert settings["display_mode"]["field_value"] == "CARD"
        assert settings["sort"]["field_value"] == "oldest"
        assert settings["category_id"]["field_value"] == category["id"]
        assert settings["empty_text"]["field_value"] == "준비 중이에요"

    async def test_category_only_uses_saved_board(self, client, auth_headers, tenant):
        """분류만 바꿔도 저장된 게시판의 분류인지 본다"""
        board = await _board(client, auth_headers, "team")
        other = await _board(client, auth_headers, "history")
        mine = await _category(client, auth_headers, board["id"], "의사")
        theirs = await _category(client, auth_headers, other["id"], "2020")
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        await _save(client, auth_headers, section_id, latest_board=board["id"])

        resp = await _save(client, auth_headers, section_id, category_id=theirs["id"])
        assert resp.status_code == 400
        assert "분류" in resp.json()["error"]["message"]
        resp = await _save(client, auth_headers, section_id, category_id=mine["id"])
        assert resp.status_code == 200

    async def test_category_without_board_cleared(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, "faq")
        category = await _category(client, auth_headers, board["id"], "예약")
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(
            client,
            auth_headers,
            section_id,
            latest_board="",
            category_id=category["id"],
        )
        assert resp.status_code == 200
        assert _settings(resp)["category_id"]["field_value"] == ""

    @pytest.mark.parametrize(
        ("field", "value"),
        [
            ("display_mode", "SLIDER"),
            ("sort", "random"),
            ("category_id", "not-a-uuid"),
            ("empty_text", "가" * 101),
        ],
    )
    async def test_rejects_bad_values(self, client, auth_headers, tenant, field, value):
        board = await _board(client, auth_headers, "bad")
        section_id = await _section(tenant["id"], "BOARD_LATEST")
        resp = await _save(
            client, auth_headers, section_id, latest_board=board["id"], **{field: value}
        )
        assert resp.status_code == 400

    async def test_notice_section_ignores_connect_fields(
        self, client, auth_headers, tenant
    ):
        """코드형 최신 공지는 게시판 연결 칸을 검사하지 않는다 (테마형만)"""
        section_id = await _section(tenant["id"], "NOTICE_LATEST")
        resp = await _save(client, auth_headers, section_id, display_mode="SLIDER")
        assert resp.status_code == 200


class TestSectionPosts:
    """게시판 연결 섹션의 공개 글 (T-243) — 비밀글 · 회원 전용 노출 금지"""

    def _url(self, tenant: dict, board_slug: str) -> str:
        return f"/api/public/site/{tenant['slug']}/boards/{board_slug}/section-posts"

    async def test_fixed_mapping_and_no_secret(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, "svc")
        await _post(
            client,
            auth_headers,
            board["id"],
            "임플란트",
            body=[
                {"type": "p", "text": "튼튼한 치아"},
                {"type": "image", "src": "http://localhost/a.webp", "alt": "사진"},
            ],
        )
        secret = await _post(client, auth_headers, board["id"], "비밀")
        await _sql(
            "UPDATE board_posts SET is_secret = true WHERE id = :p", p=secret["id"]
        )

        resp = await client.get(self._url(tenant, "svc"))
        assert resp.status_code == 200, resp.text
        items = resp.json()["data"]
        assert [i["title"] for i in items] == ["임플란트"]
        assert items[0]["summary"] == "튼튼한 치아"
        assert items[0]["thumbnail"] == "http://localhost/a.webp"
        assert items[0]["body"] is None

    async def test_body_sort_size_category(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, "faqs")
        category = await _category(client, auth_headers, board["id"], "예약")
        first = await _post(
            client, auth_headers, board["id"], "첫 질문", category_id=category["id"]
        )
        await _post(client, auth_headers, board["id"], "둘째 질문")
        await _post(
            client, auth_headers, board["id"], "셋째 질문", category_id=category["id"]
        )
        await _sql(
            "UPDATE board_posts SET published_at = now() - interval '1 day'"
            " WHERE id = :p",
            p=first["id"],
        )
        url = self._url(tenant, "faqs")

        latest = (await client.get(url, params={"size": 2})).json()["data"]
        assert [i["title"] for i in latest] == ["셋째 질문", "둘째 질문"]
        oldest = (await client.get(url, params={"sort": "oldest"})).json()["data"]
        assert oldest[0]["title"] == "첫 질문"
        by_category = (
            await client.get(url, params={"category": category["id"], "body": "true"})
        ).json()["data"]
        assert [i["title"] for i in by_category] == ["셋째 질문", "첫 질문"]
        assert by_category[0]["body"] == [{"type": "p", "text": "셋째 질문 본문"}]

    async def test_member_only_board_hidden(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, "vip")
        await _post(client, auth_headers, board["id"], "회원 글")
        await _sql(
            "UPDATE boards SET settings = jsonb_set(coalesce(settings, '{}'::jsonb),"
            ' \'{permissions}\', \'{"read": "MEMBER", "write": "ADMIN"}\')'
            " WHERE id = :b",
            b=board["id"],
        )
        resp = await client.get(self._url(tenant, "vip"))
        assert resp.status_code == 404

    async def test_deleted_board_404(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, "old")
        await _sql("UPDATE boards SET deleted_at = now() WHERE id = :b", b=board["id"])
        resp = await client.get(self._url(tenant, "old"))
        assert resp.status_code == 404

    async def test_size_limit(self, client, auth_headers, tenant):
        await _board(client, auth_headers, "big")
        resp = await client.get(self._url(tenant, "big"), params={"size": 13})
        assert resp.status_code in (400, 422)


class TestBoardUsage:
    """게시판 화면의 사용 위치 (T-243)"""

    async def test_lists_sections_with_page_title(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, "used")
        home = await _section(tenant["id"], "BOARD_LATEST")
        await _save(
            client,
            auth_headers,
            home,
            latest_board=board["id"],
            section_title="<b>우리</b> 소식",
        )
        gone = await _section(tenant["id"], "BOARD_LATEST")
        await _save(client, auth_headers, gone, latest_board=board["id"])
        await _sql("UPDATE sections SET deleted_at = now() WHERE id = :s", s=gone)
        await _section(tenant["id"], "BOARD_LATEST")  # 다른 게시판 · 빈 칸
        # 제목이 없으면 관리용 이름
        plain = await _section(tenant["id"], "NOTICE_LATEST")
        await _save(client, auth_headers, plain, latest_board=board["id"])

        resp = await client.get(f"{BOARDS}/{board['id']}/usage", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        # 같은 페이지 · 같은 순서 값이면 id 순서라 정렬해 비교
        assert sorted(resp.json()["data"], key=lambda u: u["section_id"]) == sorted(
            [
                {
                    "section_id": home,
                    "section_type": "BOARD_LATEST",
                    "label": "우리 소식",
                    "page_key": "home",
                    "page_title": "홈",
                    "is_active": True,
                },
                {
                    "section_id": plain,
                    "section_type": "NOTICE_LATEST",
                    "label": "최신",
                    "page_key": "home",
                    "page_title": "홈",
                    "is_active": True,
                },
            ],
            key=lambda u: u["section_id"],
        )

    async def test_requires_login(self, client, tenant):
        resp = await client.get(f"{BOARDS}/{uuid.uuid4()}/usage")
        assert resp.status_code == 401

    async def test_other_tenant_board_404(
        self, client, auth_headers, tenant, other_board
    ):
        resp = await client.get(
            f"{BOARDS}/{other_board['id']}/usage", headers=auth_headers
        )
        assert resp.status_code == 404


class TestContentPresets:
    """콘텐츠형 게시판 프리셋 (T-243, CM-03)"""

    async def test_lists_five_presets(self, client, auth_headers, tenant):
        resp = await client.get(f"{BOARDS}/content-presets", headers=auth_headers)
        assert resp.status_code == 200
        presets = {p["key"]: p for p in resp.json()["data"]}
        assert list(presets) == ["services", "faq", "history", "team", "reviews"]
        assert [f["key"] for f in presets["history"]["fields"]] == ["year"]
        # 리뷰형은 별점이 늘 들어간다
        assert presets["reviews"]["fields"][0]["always"] is True

    async def test_creates_board_with_preset_fields(self, client, auth_headers, tenant):
        resp = await client.post(
            BOARDS,
            json={
                "name": "의료진",
                "slug": "doctors",
                "board_type": "CARD",
                "in_menu": False,
                "preset_fields": ["role", "specialty"],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 201, resp.text
        fields = (
            await client.get(
                f"{BOARDS}/{resp.json()['data']['id']}/fields", headers=auth_headers
            )
        ).json()["data"]
        assert [
            f["field_key"] for f in fields if f["field_key"] in {"role", "specialty"}
        ] == [
            "role",
            "specialty",
        ]

    async def test_preset_field_of_other_type_rejected(
        self, client, auth_headers, tenant
    ):
        resp = await client.post(
            BOARDS,
            json={"name": "목록", "board_type": "LIST", "preset_fields": ["role"]},
            headers=auth_headers,
        )
        assert resp.status_code == 400
