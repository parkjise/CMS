"""다른 게시판으로 글 옮기기 (T-184, 게시판 모듈 기획서 BM-05)."""

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from sqlalchemy import text

from app.core.security import create_access_token
from app.services import feature as feature_service
from app.services import site_cache
from tests.conftest import _TestSession  # type: ignore

BOARDS = "/api/v1/boards"
MOVE = "/api/v1/posts/move"
PREVIEW = "/api/v1/posts/move/preview"


async def _sql(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        rows = result.fetchall() if result.returns_rows else None
        await s.commit()
    return rows


@pytest.fixture(autouse=True)
def purged(monkeypatch) -> list[str]:
    calls: list[str] = []

    async def fake_purge(_db, tenant_id):
        calls.append(str(tenant_id))
        return True

    monkeypatch.setattr(site_cache, "purge_site", fake_purge)
    return calls


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


async def _board(client, headers, slug: str, **extra: Any) -> dict:
    resp = await client.post(
        BOARDS, json={"name": f"{slug} 게시판", "slug": slug, **extra}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _field(client, headers, board: dict, label: str, **extra: Any) -> str:
    resp = await client.post(
        f"{BOARDS}/{board['id']}/fields",
        json={"label": label, "field_type": "TEXT", **extra},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["field_key"]


async def _post(client, headers, board: dict, title: str = "글", **extra) -> dict:
    payload = {"title": title, "status": "PUBLISHED", **extra}
    resp = await client.post(
        f"{BOARDS}/{board['id']}/posts", json=payload, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _row(post_id: str) -> tuple:
    rows = await _sql(
        "SELECT board_id, category_id, custom_data, is_pinned, status"
        " FROM board_posts WHERE id = :p",
        p=post_id,
    )
    assert rows
    return rows[0]


def _body(post_ids: list[str], target: dict, **extra: Any) -> dict:
    return {"post_ids": post_ids, "target_board_id": target["id"], **extra}


@pytest.fixture
async def boards(client, auth_headers, tenant) -> dict:
    """채용(근무지 · 촬영일 · 형태) → 공고(근무지 · 형태) — 선택지는 이름으로."""
    jobs = await _board(client, auth_headers, "jobs")
    news = await _board(client, auth_headers, "news")
    keys = {
        "place": await _field(client, auth_headers, jobs, "근무지"),
        "date": await _field(client, auth_headers, jobs, "촬영일", field_type="DATE"),
        "kind": await _field(
            client,
            auth_headers,
            jobs,
            "형태",
            field_type="SELECT",
            options=[
                {"value": "a", "label": "정규직"},
                {"value": "b", "label": "인턴"},
            ],
        ),
        "news_place": await _field(client, auth_headers, news, "근무지"),
        "news_kind": await _field(
            client,
            auth_headers,
            news,
            "형태",
            field_type="SELECT",
            options=[
                {"value": "x", "label": "정규직"},
                {"value": "y", "label": "계약직"},
            ],
        ),
    }
    return {"jobs": jobs, "news": news, "keys": keys}


@pytest.fixture
async def other_headers() -> AsyncIterator[dict]:
    """다른 사업체의 관리자."""
    tenant_id, user_id = str(uuid.uuid4()), str(uuid.uuid4())
    slug = f"other-{tenant_id[:8]}"
    await _sql(
        "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
        " updated_at) VALUES (:id, :s, :s, 'PREMIUM', true, now(), now())",
        id=tenant_id,
        s=slug,
    )
    await _sql(
        "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
        " created_at, updated_at) VALUES (:id, :t, :e, 'x', 'TENANT_ADMIN', true,"
        " now(), now())",
        id=user_id,
        t=tenant_id,
        e=f"{slug}@example.com",
    )
    token = create_access_token(
        user_id=uuid.UUID(user_id), tenant_id=uuid.UUID(tenant_id), role="TENANT_ADMIN"
    )
    yield {"Authorization": f"Bearer {token}"}
    await _sql("DELETE FROM tenant_features WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM users WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM tenants WHERE id = :t", t=tenant_id)


@pytest.fixture
async def notice_section(tenant) -> AsyncIterator[str]:
    """공지 페이지가 있는 템플릿 — 공지 게시판 · 샘플 글."""
    section_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO sections (id, tenant_id, section_type, label, display_order,"
        " page_key, is_active, created_at, updated_at)"
        " VALUES (:id, :t, 'BOARD', '공지', 0, 'notice', true, now(), now())",
        id=section_id,
        t=tenant["id"],
    )
    await _sql(
        "INSERT INTO section_settings (id, tenant_id, section_id, field_key,"
        " field_value, value_type, is_sample, created_at, updated_at)"
        " VALUES (gen_random_uuid(), :t, :s, 'items', '[{\"id\": \"n1\"}]',"
        " 'JSON', true, now(), now())",
        t=tenant["id"],
        s=section_id,
    )
    yield section_id
    await _sql("DELETE FROM section_settings WHERE section_id = :s", s=section_id)
    await _sql("DELETE FROM sections WHERE id = :s", s=section_id)


class TestMovePosts:
    async def test_preview_then_move(
        self, client, auth_headers, boards, purged, tenant
    ):
        jobs, news, k = boards["jobs"], boards["news"], boards["keys"]
        post = await _post(
            client,
            auth_headers,
            jobs,
            is_pinned=True,
            custom_data={k["place"]: "서울", k["date"]: "2026-11-01", k["kind"]: "a"},
        )
        cat = await client.post(
            f"{BOARDS}/{news['id']}/categories",
            json={"name": "채용"},
            headers=auth_headers,
        )
        category_id = cat.json()["data"]["id"]
        body = _body([post["id"]], news, category_id=category_id)

        preview = await client.post(PREVIEW, json=body, headers=auth_headers)
        assert preview.status_code == 200, preview.text
        data = preview.json()["data"]
        assert data["posts"] == 1
        assert data["target_name"] == "news 게시판"
        assert {c["label"] for c in data["carried"]} == {"근무지", "형태"}
        assert data["dropped"] == [{"label": "촬영일", "posts": 1}]
        assert data["blocked_count"] == 0
        # 미리보기는 아무것도 바꾸지 않는다
        assert str((await _row(post["id"]))[0]) == jobs["id"]

        resp = await client.post(MOVE, json=body, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"] == {"moved": 1, "values_dropped": 1}
        board_id, cat_id, custom, pinned, status = await _row(post["id"])
        assert str(board_id) == news["id"]
        assert str(cat_id) == category_id
        assert custom == {k["news_place"]: "서울", k["news_kind"]: "x"}
        assert pinned is True and status == "PUBLISHED"
        assert purged

        logs = await _sql(
            "SELECT before_value, after_value FROM audit_logs"
            " WHERE action = 'POST_MOVED' AND tenant_id = :t",
            t=tenant["id"],
        )
        before, after = logs[0]
        assert before["board_ids"] == {post["id"]: jobs["id"]}
        assert before["custom_data"][post["id"]][k["date"]] == "2026-11-01"
        assert after["board_id"] == news["id"] and after["moved"] == 1

    async def test_choice_without_same_name_is_dropped(
        self, client, auth_headers, boards
    ):
        jobs, news, k = boards["jobs"], boards["news"], boards["keys"]
        post = await _post(client, auth_headers, jobs, custom_data={k["kind"]: "b"})
        resp = await client.post(
            PREVIEW, json=_body([post["id"]], news), headers=auth_headers
        )
        assert resp.json()["data"]["dropped"] == [{"label": "형태", "posts": 1}]
        await client.post(MOVE, json=_body([post["id"]], news), headers=auth_headers)
        assert (await _row(post["id"]))[2] == {}

    async def test_same_label_other_type_is_dropped(self, client, auth_headers, tenant):
        a = await _board(client, auth_headers, "a-board")
        b = await _board(client, auth_headers, "b-board")
        key = await _field(client, auth_headers, a, "가격")
        await _field(client, auth_headers, b, "가격", field_type="NUMBER")
        post = await _post(client, auth_headers, a, custom_data={key: "1000"})
        resp = await client.post(
            PREVIEW, json=_body([post["id"]], b), headers=auth_headers
        )
        assert resp.json()["data"]["dropped"] == [{"label": "가격", "posts": 1}]

    async def test_posts_from_many_boards(self, client, auth_headers, boards):
        jobs, news = boards["jobs"], boards["news"]
        third = await _board(client, auth_headers, "third")
        one = await _post(client, auth_headers, jobs, "하나")
        two = await _post(client, auth_headers, third, "둘", status="DRAFT")
        resp = await client.post(
            MOVE, json=_body([one["id"], two["id"]], news), headers=auth_headers
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["moved"] == 2
        assert str((await _row(two["id"]))[0]) == news["id"]
        assert (await _row(two["id"]))[4] == "DRAFT"

    async def test_required_field_blocks_published_only(
        self, client, auth_headers, boards
    ):
        jobs, news = boards["jobs"], boards["news"]
        await _field(client, auth_headers, news, "마감일", is_required=True)
        public = await _post(client, auth_headers, jobs, "공개 글")
        draft = await _post(client, auth_headers, jobs, "임시 글", status="DRAFT")
        body = _body([public["id"], draft["id"]], news)

        preview = (await client.post(PREVIEW, json=body, headers=auth_headers)).json()
        assert preview["data"]["blocked_count"] == 1
        blocked = preview["data"]["blocked"][0]
        assert blocked["post_id"] == public["id"]
        assert "마감일" in blocked["reason"]

        resp = await client.post(MOVE, json=body, headers=auth_headers)
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "CONFLICT"
        # 전부 취소 — 임시 글도 그대로
        assert str((await _row(draft["id"]))[0]) == jobs["id"]

        ok = await client.post(
            MOVE, json=_body([draft["id"]], news), headers=auth_headers
        )
        assert ok.status_code == 200, ok.text

    async def test_same_board_blocked(self, client, auth_headers, boards):
        post = await _post(client, auth_headers, boards["jobs"])
        resp = await client.post(
            PREVIEW, json=_body([post["id"]], boards["jobs"]), headers=auth_headers
        )
        assert (
            resp.json()["data"]["blocked"][0]["reason"]
            == "이미 이 게시판에 있는 글입니다."
        )
        resp = await client.post(
            MOVE, json=_body([post["id"]], boards["jobs"]), headers=auth_headers
        )
        assert resp.status_code == 409

    async def test_notice_takes_admin_posts_only(
        self, client, auth_headers, boards, notice_section
    ):
        listed = (await client.get(BOARDS, headers=auth_headers)).json()["data"]
        notice = next(b for b in listed if b["system_key"] == "notice")
        jobs = boards["jobs"]
        secret = await _post(client, auth_headers, jobs, "비밀", is_secret=True)
        guest = await _post(client, auth_headers, jobs, "비회원")
        await _sql(
            "UPDATE board_posts SET guest_name = '손님', guest_password_hash = 'x'"
            " WHERE id = :p",
            p=guest["id"],
        )
        plain = await _post(client, auth_headers, jobs, "알림")

        preview = await client.post(
            PREVIEW,
            json=_body([secret["id"], guest["id"], plain["id"]], notice),
            headers=auth_headers,
        )
        reasons = {b["title"]: b["reason"] for b in preview.json()["data"]["blocked"]}
        assert reasons == {
            "비밀": "비밀글은 공지로 옮길 수 없습니다.",
            "비회원": "회원 · 비회원이 쓴 글은 공지로 옮길 수 없습니다.",
        }
        resp = await client.post(
            MOVE, json=_body([plain["id"]], notice), headers=auth_headers
        )
        assert resp.status_code == 200, resp.text
        assert str((await _row(plain["id"]))[0]) == notice["id"]
        # 공지에 공개 글이 생겼으니 샘플 글은 내린다
        items = await _sql(
            "SELECT field_value FROM section_settings WHERE section_id = :s",
            s=notice_section,
        )
        assert items[0][0] == "[]"

    async def test_category_of_other_board(self, client, auth_headers, boards):
        cat = await client.post(
            f"{BOARDS}/{boards['jobs']['id']}/categories",
            json={"name": "다른 분류"},
            headers=auth_headers,
        )
        post = await _post(client, auth_headers, boards["jobs"])
        resp = await client.post(
            MOVE,
            json=_body(
                [post["id"]], boards["news"], category_id=cat.json()["data"]["id"]
            ),
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    async def test_trashed_or_unknown_post(self, client, auth_headers, boards):
        post = await _post(client, auth_headers, boards["jobs"])
        await _sql(
            "UPDATE board_posts SET deleted_at = now() WHERE id = :p", p=post["id"]
        )
        for ids in ([post["id"]], [str(uuid.uuid4())]):
            resp = await client.post(
                MOVE, json=_body(ids, boards["news"]), headers=auth_headers
            )
            assert resp.status_code == 404

    async def test_unknown_target(self, client, auth_headers, boards):
        post = await _post(client, auth_headers, boards["jobs"])
        resp = await client.post(
            MOVE,
            json={"post_ids": [post["id"]], "target_board_id": str(uuid.uuid4())},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_other_tenant_isolated(
        self, client, auth_headers, boards, other_headers
    ):
        post = await _post(client, auth_headers, boards["jobs"])
        resp = await client.post(
            MOVE, json=_body([post["id"]], boards["news"]), headers=other_headers
        )
        assert resp.status_code in (403, 404)
        assert str((await _row(post["id"]))[0]) == boards["jobs"]["id"]

    async def test_validation_and_auth(self, client, auth_headers, boards):
        empty = await client.post(
            MOVE, json=_body([], boards["news"]), headers=auth_headers
        )
        assert empty.status_code in (400, 422)
        resp = await client.post(MOVE, json=_body([str(uuid.uuid4())], boards["news"]))
        assert resp.status_code == 401


class TestPublicLocation:
    async def test_moved_post_location(self, client, auth_headers, boards, tenant):
        post = await _post(client, auth_headers, boards["jobs"])
        await client.post(
            MOVE, json=_body([post["id"]], boards["news"]), headers=auth_headers
        )
        url = f"/api/public/site/{tenant['slug']}/posts/{post['id']}/location"
        resp = await client.get(url)
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"] == {"board_slug": "news", "is_system": False}

    async def test_hidden_posts_have_no_location(
        self, client, auth_headers, boards, tenant
    ):
        draft = await _post(client, auth_headers, boards["jobs"], status="DRAFT")
        url = f"/api/public/site/{tenant['slug']}/posts"
        assert (await client.get(f"{url}/{draft['id']}/location")).status_code == 404
        assert (await client.get(f"{url}/{uuid.uuid4()}/location")).status_code == 404
        await _sql(
            "UPDATE boards SET status = 'INACTIVE' WHERE id = :b",
            b=boards["news"]["id"],
        )
        live = await _post(client, auth_headers, boards["news"])
        assert (await client.get(f"{url}/{live['id']}/location")).status_code == 404
        missing = f"/api/public/site/no-such-{uuid.uuid4().hex[:6]}/posts"
        assert (await client.get(f"{missing}/{live['id']}/location")).status_code == 404
