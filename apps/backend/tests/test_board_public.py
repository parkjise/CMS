"""새 게시판의 홈페이지 표시 · 메뉴 (T-140-B, 게시판 모듈 기획서 5.3 · 9.2)."""

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text

from app.services import feature as feature_service
from app.services import site_cache
from app.services import site_settings as site_settings_service
from tests.conftest import _TestSession  # type: ignore

BOARDS = "/api/v1/boards"
MENU = "/api/v1/site-settings/menu"
_CODE = "TPL_TEST_BOARD_MENU"
_PAGES = [{"key": "about", "title": "소개"}, {"key": "notice", "title": "공지사항"}]
_IMAGE = "http://localhost/first.webp"


async def _sql(sql: str, **params) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await s.execute(text(sql), params)
        await s.commit()


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
    await _sql("DELETE FROM tenant_features WHERE tenant_id = :t", t=test_tenant["id"])
    await feature_service.invalidate_cache(test_tenant["id"])


@pytest.fixture
async def code_tenant(tenant, monkeypatch) -> AsyncIterator[dict]:
    """코드형 템플릿을 쓰는 사업체 — 게시판이 메뉴 후보가 되는 조건."""
    template_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO templates (id, template_type, name, css_variables,"
        " section_layouts, is_active, min_plan, renderer, code, created_at, updated_at)"
        " VALUES (:id, 'HOSPITAL', '게시판 메뉴', '{}', '[]', true, 'BASIC', 'code',"
        " :code, now(), now())",
        id=template_id,
        code=f"{_CODE}_{template_id[:8]}",
    )
    await _sql(
        "INSERT INTO tenant_template_overrides (id, tenant_id, template_id,"
        " css_overrides, applied_at) VALUES (:id, :t, :tpl, '{}', now())",
        id=str(uuid.uuid4()),
        t=tenant["id"],
        tpl=template_id,
    )
    monkeypatch.setattr(
        site_settings_service,
        "load_menu",
        lambda code: _PAGES if code.startswith(_CODE) else [],
    )
    yield tenant
    await _sql(
        "DELETE FROM tenant_template_overrides WHERE tenant_id = :t", t=tenant["id"]
    )
    await _sql("DELETE FROM templates WHERE id = :id", id=template_id)


async def _create(client, headers, **fields) -> dict:
    resp = await client.post(BOARDS, json={"name": "소식", **fields}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _publish(client, headers, board_id: str, title: str, body: list) -> dict:
    resp = await client.post(
        f"{BOARDS}/{board_id}/posts",
        json={"title": title, "body": body, "status": "PUBLISHED"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _menu_items(client, headers) -> list[dict]:
    resp = await client.get(MENU, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["items"]


async def _public_boards(client, slug: str) -> list[dict]:
    resp = await client.get(f"/api/public/site/{slug}")
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["boards"]


def _key(board: dict) -> str:
    return f"board:{board['id']}"


class TestPublicSiteBoards:
    async def test_active_custom_boards_only(self, client, auth_headers, tenant):
        """기본 게시판 · 사용 안 함 · 휴지통은 나가지 않는다."""
        await client.get(BOARDS, headers=auth_headers)  # 기본 게시판 생성
        shown = await _create(
            client,
            auth_headers,
            name="갤러리",
            slug="photos",
            board_type="GALLERY",
            description="사진 모음",
        )
        await _create(client, auth_headers, name="준비 중", status="INACTIVE")
        trashed = await _create(client, auth_headers, name="지운 것")
        await client.delete(f"{BOARDS}/{trashed['id']}", headers=auth_headers)

        boards = await _public_boards(client, tenant["slug"])

        assert boards == [
            {
                "id": shown["id"],
                "name": "갤러리",
                "slug": "photos",
                "description": "사진 모음",
                "board_type": "GALLERY",
                "page_size": None,
                "seo_title": "",
                "seo_description": "",
                "seo_index": True,
                "design": {
                    "columns": 3,
                    "image_ratio": "4:3",
                    "show_date": True,
                    "show_image": True,
                    "show_summary": True,
                    "faq_single_open": False,
                    "faq_first_open": False,
                },
                "read_access": "PUBLIC",
                "categories": [],
            }
        ]

    async def test_other_tenant_boards_not_exposed(self, client, auth_headers, tenant):
        await _create(client, auth_headers, slug="news")
        other_id = str(uuid.uuid4())
        other_slug = f"other-{other_id[:8]}"
        await _sql(
            "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
            " updated_at) VALUES (:id, :s, :s, 'PREMIUM', true, now(), now())",
            id=other_id,
            s=other_slug,
        )
        try:
            assert await _public_boards(client, other_slug) == []
        finally:
            await _sql("DELETE FROM tenants WHERE id = :t", t=other_id)


class TestPublicPostFields:
    BODY = [
        {"type": "p", "text": "본문"},
        {"type": "image", "src": _IMAGE, "alt": "첫 사진"},
        {"type": "image", "src": "http://localhost/second.webp", "alt": "둘째"},
    ]

    async def _items(self, client, slug: str, board_slug: str) -> list[dict]:
        resp = await client.get(f"/api/public/site/{slug}/boards/{board_slug}/posts")
        assert resp.status_code == 200, resp.text
        return resp.json()["data"]["items"]

    async def test_thumbnail_is_first_image(self, client, auth_headers, tenant):
        board = await _create(client, auth_headers, slug="photos", board_type="GALLERY")
        await _publish(client, auth_headers, board["id"], "사진 글", self.BODY)
        await _publish(
            client, auth_headers, board["id"], "글만", [{"type": "p", "text": "글"}]
        )

        items = await self._items(client, tenant["slug"], "photos")

        assert {i["title"]: i["thumbnail"] for i in items} == {
            "사진 글": _IMAGE,
            "글만": None,
        }
        assert all(i["body"] is None for i in items)

    async def test_faq_list_includes_answer(self, client, auth_headers, tenant):
        board = await _create(client, auth_headers, slug="faq", board_type="FAQ")
        await _publish(
            client, auth_headers, board["id"], "질문", [{"type": "p", "text": "답변"}]
        )

        items = await self._items(client, tenant["slug"], "faq")

        assert items[0]["body"] == [{"type": "p", "text": "답변"}]

    async def test_list_board_has_no_body(self, client, auth_headers, tenant):
        board = await _create(client, auth_headers, slug="news")
        await _publish(client, auth_headers, board["id"], "글", self.BODY)

        items = await self._items(client, tenant["slug"], "news")

        assert items[0]["body"] is None

    async def test_inactive_board_is_404(self, client, auth_headers, tenant):
        await _create(client, auth_headers, slug="news", status="INACTIVE")
        resp = await client.get(f"/api/public/site/{tenant['slug']}/boards/news/posts")
        assert resp.status_code == 404


class TestBoardMenu:
    async def test_new_board_joins_menu_after_pages(
        self, client, auth_headers, code_tenant
    ):
        board = await _create(client, auth_headers, name="병원 소식")

        items = await _menu_items(client, auth_headers)

        assert [i["key"] for i in items] == ["about", "notice", _key(board)]
        assert items[-1]["default_label"] == "병원 소식"
        assert items[-1]["visible"] is True

    async def test_in_menu_false_hides_and_keeps_page_order(
        self, client, auth_headers, code_tenant
    ):
        board = await _create(client, auth_headers, in_menu=False)

        items = await _menu_items(client, auth_headers)

        assert [i["key"] for i in items] == ["about", "notice", _key(board)]
        assert [i["visible"] for i in items] == [True, True, False]
        # 숨겨도 게시판 주소는 열린다
        assert len(await _public_boards(client, code_tenant["slug"])) == 1

    async def test_in_menu_false_response_is_board(
        self, client, auth_headers, code_tenant
    ):
        board = await _create(client, auth_headers, name="숨김", in_menu=False)
        assert board["name"] == "숨김"
        assert board["post_count"] == 0

    async def test_duplicate_stays_out_of_menu(self, client, auth_headers, code_tenant):
        board = await _create(client, auth_headers)
        resp = await client.post(
            f"{BOARDS}/{board['id']}/duplicate", headers=auth_headers
        )
        assert resp.status_code == 201, resp.text
        copy = resp.json()["data"]

        by_key = {i["key"]: i for i in await _menu_items(client, auth_headers)}

        assert by_key[_key(board)]["visible"] is True
        assert by_key[_key(copy)]["visible"] is False

    async def test_trash_inactive_leave_menu_and_restore_keeps_settings(
        self, client, auth_headers, code_tenant
    ):
        board = await _create(client, auth_headers)
        saved = [
            {"key": _key(board), "label": "새 소식", "visible": True},
            {"key": "about", "label": None, "visible": True},
            {"key": "notice", "label": None, "visible": False},
        ]
        assert (
            await client.put(MENU, json={"items": saved}, headers=auth_headers)
        ).status_code == 200

        await client.patch(
            f"{BOARDS}/{board['id']}", json={"status": "INACTIVE"}, headers=auth_headers
        )
        assert _key(board) not in [
            i["key"] for i in await _menu_items(client, auth_headers)
        ]
        await client.patch(
            f"{BOARDS}/{board['id']}", json={"status": "ACTIVE"}, headers=auth_headers
        )
        await client.delete(f"{BOARDS}/{board['id']}", headers=auth_headers)
        assert _key(board) not in [
            i["key"] for i in await _menu_items(client, auth_headers)
        ]
        await client.post(f"{BOARDS}/{board['id']}/restore", headers=auth_headers)

        items = await _menu_items(client, auth_headers)

        assert items[0]["key"] == _key(board)
        assert items[0]["label"] == "새 소식"

    async def test_slug_change_keeps_menu_settings(
        self, client, auth_headers, code_tenant
    ):
        board = await _create(client, auth_headers, slug="news")
        await client.put(
            MENU,
            json={"items": [{"key": _key(board), "label": "소식", "visible": False}]},
            headers=auth_headers,
        )
        await client.patch(
            f"{BOARDS}/{board['id']}", json={"slug": "news-2"}, headers=auth_headers
        )

        by_key = {i["key"]: i for i in await _menu_items(client, auth_headers)}

        assert by_key[_key(board)]["visible"] is False

    async def test_theme_template_lists_boards_after_sections(
        self, client, auth_headers, tenant
    ):
        section_id = str(uuid.uuid4())
        await _sql(
            "INSERT INTO sections (id, tenant_id, section_type, label, display_order,"
            " is_active, page_key, created_at, updated_at)"
            " VALUES (:id, :t, 'INTRO', '소개', 0, true, 'home', now(), now())",
            id=section_id,
            t=tenant["id"],
        )
        shown = await _create(client, auth_headers, name="보이는 게시판")
        hidden = await _create(client, auth_headers, name="숨김", in_menu=False)

        resp = await client.get(MENU, headers=auth_headers)
        menu = resp.json()["data"]

        assert menu["mode"] == "theme"
        assert menu["reorderable"] is False
        assert [i["key"] for i in menu["items"]] == [
            section_id,
            _key(shown),
            _key(hidden),
        ]
        assert [i["visible"] for i in menu["items"]] == [True, True, False]
        await _sql("DELETE FROM sections WHERE id = :id", id=section_id)

    async def test_template_switch_keeps_boards_and_menu(
        self, client, auth_headers, tenant, monkeypatch
    ):
        """테마형 ↔ 코드형 — 글 · 주소 · 메뉴 숨김이 그대로다 (AC-18)."""
        board = await _create(client, auth_headers, slug="news", in_menu=False)
        await _publish(
            client, auth_headers, board["id"], "글", [{"type": "p", "text": "본문"}]
        )
        template_id = str(uuid.uuid4())
        await _sql(
            "INSERT INTO templates (id, template_type, name, css_variables,"
            " section_layouts, is_active, min_plan, renderer, code, created_at,"
            " updated_at) VALUES (:id, 'HOSPITAL', '전환', '{}', '[]', true, 'BASIC',"
            " 'code', :code, now(), now())",
            id=template_id,
            code=f"{_CODE}_{template_id[:8]}",
        )
        monkeypatch.setattr(
            site_settings_service,
            "load_menu",
            lambda code: _PAGES if code.startswith(_CODE) else [],
        )
        await _sql(
            "INSERT INTO tenant_template_overrides (id, tenant_id, template_id,"
            " css_overrides, applied_at) VALUES (:id, :t, :tpl, '{}', now())",
            id=str(uuid.uuid4()),
            t=tenant["id"],
            tpl=template_id,
        )

        async def state() -> tuple[bool, int]:
            by_key = {i["key"]: i for i in await _menu_items(client, auth_headers)}
            posts = await client.get(
                f"/api/public/site/{tenant['slug']}/boards/news/posts"
            )
            return by_key[_key(board)]["visible"], posts.json()["data"]["total"]

        assert await state() == (False, 1)
        await _sql(
            "DELETE FROM tenant_template_overrides WHERE tenant_id = :t", t=tenant["id"]
        )
        await _sql("DELETE FROM templates WHERE id = :id", id=template_id)
        assert await state() == (False, 1)

    async def test_other_tenant_board_key_rejected(
        self, client, auth_headers, code_tenant
    ):
        resp = await client.put(
            MENU,
            json={"items": [{"key": f"board:{uuid.uuid4()}", "visible": True}]},
            headers=auth_headers,
        )
        assert resp.status_code == 400
