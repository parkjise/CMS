"""게시판 설정 — 정렬 · 페이지당 글 수 · 검색 노출 (T-146, 기획서 BM-03)."""

from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text

from app.services import feature as feature_service
from app.services import site_cache
from tests.conftest import _TestSession  # type: ignore

BOARDS = "/api/v1/boards"


@pytest.fixture(autouse=True)
def no_purge(monkeypatch) -> None:
    async def fake_purge(_db, _tenant_id):
        return True

    monkeypatch.setattr(site_cache, "purge_site", fake_purge)


@pytest.fixture
async def tenant(test_tenant, test_user) -> AsyncIterator[dict]:
    await feature_service.invalidate_cache(test_tenant["id"])
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await s.execute(
            text("UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t"),
            {"t": test_tenant["id"]},
        )
        await s.commit()
    yield test_tenant
    await feature_service.invalidate_cache(test_tenant["id"])


async def _board(client, headers, **fields) -> dict:
    resp = await client.post(BOARDS, json={"name": "소식", **fields}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _publish(client, headers, board_id: str, title: str, pinned=False) -> None:
    resp = await client.post(
        f"{BOARDS}/{board_id}/posts",
        json={"title": title, "body": [], "status": "PUBLISHED", "is_pinned": pinned},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text


async def _patch(client, headers, board_id: str, **fields) -> dict:
    resp = await client.patch(f"{BOARDS}/{board_id}", json=fields, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


async def _titles(client, slug: str, board_slug: str, query: str = "") -> list[str]:
    resp = await client.get(f"/api/public/site/{slug}/boards/{board_slug}/posts{query}")
    assert resp.status_code == 200, resp.text
    return [item["title"] for item in resp.json()["data"]["items"]]


class TestSaveOptions:
    @pytest.mark.asyncio
    async def test_defaults(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers)
        assert board["sort_order"] == "LATEST"
        assert board["page_size"] is None
        assert (board["seo_title"], board["seo_description"]) == ("", "")
        assert board["seo_index"] is True

    @pytest.mark.asyncio
    async def test_saves_and_keeps_what_was_not_sent(
        self, client, auth_headers, tenant
    ):
        board = await _board(client, auth_headers, description="소식 모음")
        await _patch(
            client,
            auth_headers,
            board["id"],
            sort_order="TITLE",
            page_size=20,
            seo_title="검색 제목",
            seo_description="검색 설명",
            seo_index=False,
        )
        data = await _patch(client, auth_headers, board["id"], name="새 이름")
        assert data["name"] == "새 이름"
        assert data["description"] == "소식 모음"
        assert (data["sort_order"], data["page_size"]) == ("TITLE", 20)
        assert (data["seo_title"], data["seo_description"]) == (
            "검색 제목",
            "검색 설명",
        )
        assert data["seo_index"] is False

    @pytest.mark.asyncio
    async def test_null_page_size_returns_to_automatic(
        self, client, auth_headers, tenant
    ):
        board = await _board(client, auth_headers)
        await _patch(client, auth_headers, board["id"], page_size=30)
        data = await _patch(client, auth_headers, board["id"], page_size=None)
        assert data["page_size"] is None

    @pytest.mark.parametrize(
        "fields",
        [
            {"sort_order": "RANDOM"},
            {"page_size": 15},
            {"seo_title": "가" * 61},
            {"seo_description": "가" * 161},
        ],
    )
    @pytest.mark.asyncio
    async def test_rejects_bad_values(self, client, auth_headers, tenant, fields):
        board = await _board(client, auth_headers)
        resp = await client.patch(
            f"{BOARDS}/{board['id']}", json=fields, headers=auth_headers
        )
        assert resp.status_code == 400, resp.text

    @pytest.mark.asyncio
    async def test_duplicate_copies_options(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers)
        await _patch(client, auth_headers, board["id"], sort_order="OLDEST")
        resp = await client.post(
            f"{BOARDS}/{board['id']}/duplicate", headers=auth_headers
        )
        assert resp.status_code in (200, 201), resp.text
        assert resp.json()["data"]["sort_order"] == "OLDEST"


class TestPublicList:
    @pytest.fixture
    async def board(self, client, auth_headers, tenant) -> dict:
        board = await _board(client, auth_headers)
        for title in ["나", "다", "가"]:
            await _publish(client, auth_headers, board["id"], title)
        return board

    @pytest.mark.asyncio
    async def test_latest_is_default(self, client, tenant, board):
        assert await _titles(client, tenant["slug"], board["slug"]) == [
            "가",
            "다",
            "나",
        ]

    @pytest.mark.asyncio
    async def test_oldest(self, client, auth_headers, tenant, board):
        await _patch(client, auth_headers, board["id"], sort_order="OLDEST")
        assert await _titles(client, tenant["slug"], board["slug"]) == [
            "나",
            "다",
            "가",
        ]

    @pytest.mark.asyncio
    async def test_title_keeps_pinned_first(self, client, auth_headers, tenant, board):
        await _publish(client, auth_headers, board["id"], "하 고정", pinned=True)
        await _patch(client, auth_headers, board["id"], sort_order="TITLE")
        assert await _titles(client, tenant["slug"], board["slug"]) == [
            "하 고정",
            "가",
            "나",
            "다",
        ]

    @pytest.mark.asyncio
    async def test_latest_order_param_ignores_setting(
        self, client, auth_headers, tenant, board
    ):
        """메인의 최신 글 칸은 게시판 정렬과 관계없이 최신순."""
        await _patch(client, auth_headers, board["id"], sort_order="OLDEST")
        titles = await _titles(
            client, tenant["slug"], board["slug"], "?order=latest&size=1"
        )
        assert titles == ["가"]

    @pytest.mark.asyncio
    async def test_page_size_setting(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers)
        for i in range(11):
            await _publish(client, auth_headers, board["id"], f"글 {i}")
        path = f"/api/public/site/{tenant['slug']}/boards/{board['slug']}/posts"

        automatic = (await client.get(path)).json()["data"]
        assert (automatic["size"], len(automatic["items"])) == (10, 10)

        await _patch(client, auth_headers, board["id"], page_size=20)
        chosen = (await client.get(path)).json()["data"]
        assert (chosen["size"], len(chosen["items"])) == (20, 11)

        explicit = (await client.get(f"{path}?size=3")).json()["data"]
        assert (explicit["size"], len(explicit["items"])) == (3, 3)

    @pytest.mark.asyncio
    async def test_site_response_has_board_options(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers)
        await _patch(
            client,
            auth_headers,
            board["id"],
            page_size=30,
            seo_title="검색 제목",
            seo_description="검색 설명",
            seo_index=False,
        )
        resp = await client.get(f"/api/public/site/{tenant['slug']}")
        assert resp.status_code == 200, resp.text
        found = next(b for b in resp.json()["data"]["boards"] if b["id"] == board["id"])
        assert found["page_size"] == 30
        assert (found["seo_title"], found["seo_description"]) == (
            "검색 제목",
            "검색 설명",
        )
        assert found["seo_index"] is False


class TestDesign:
    """게시판 디자인 · 카드형 (T-148)."""

    @pytest.mark.asyncio
    async def test_default_and_save(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers)
        assert board["design"]["columns"] == 3
        assert board["design"]["image_ratio"] == "4:3"
        design = {**board["design"], "columns": 4, "faq_single_open": True}
        data = await _patch(client, auth_headers, board["id"], design=design)
        assert data["design"] == design
        kept = await _patch(client, auth_headers, board["id"], name="새 이름")
        assert kept["design"] == design

    @pytest.mark.parametrize(
        "design",
        [{"columns": 5}, {"image_ratio": "2:1"}, {"unknown": True}],
    )
    @pytest.mark.asyncio
    async def test_rejects_bad_values(self, client, auth_headers, tenant, design):
        board = await _board(client, auth_headers)
        resp = await client.patch(
            f"{BOARDS}/{board['id']}", json={"design": design}, headers=auth_headers
        )
        assert resp.status_code == 400, resp.text

    @pytest.mark.asyncio
    async def test_site_response_has_design(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers)
        design = {**board["design"], "show_date": False}
        await _patch(client, auth_headers, board["id"], design=design)
        resp = await client.get(f"/api/public/site/{tenant['slug']}")
        found = next(b for b in resp.json()["data"]["boards"] if b["id"] == board["id"])
        assert found["design"] == design

    @pytest.mark.asyncio
    async def test_card_list_has_summary_and_chosen_fields(
        self, client, auth_headers, tenant
    ):
        board = await _board(client, auth_headers, board_type="CARD")
        fields = f"{BOARDS}/{board['id']}/fields"

        async def field(**body) -> str:
            resp = await client.post(
                fields, json={"field_type": "TEXT", **body}, headers=auth_headers
            )
            assert resp.status_code == 201, resp.text
            return resp.json()["data"]["field_key"]

        shown = await field(label="부서", show_in_list=True)
        unlisted = await field(label="메모")
        hidden = await field(label="내부", show_in_list=True, is_visible=False)
        text = "가나다 " * 60
        resp = await client.post(
            f"{BOARDS}/{board['id']}/posts",
            json={
                "title": "채용",
                "status": "PUBLISHED",
                "body": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": text}],
                    }
                ],
                "custom_data": {shown: "개발팀", unlisted: "안보임", hidden: "비밀"},
            },
            headers=auth_headers,
        )
        assert resp.status_code == 201, resp.text

        listed = await client.get(
            f"/api/public/site/{tenant['slug']}/boards/{board['slug']}/posts"
        )
        item = listed.json()["data"]["items"][0]
        assert item["summary"].endswith("…")
        assert len(item["summary"]) <= 121
        assert [f["label"] for f in item["card_fields"]] == ["부서"]
        assert item["card_fields"][0]["value"] == "개발팀"
        assert "비밀" not in listed.text
        assert "안보임" not in listed.text
        assert item["body"] is None

    @pytest.mark.asyncio
    async def test_other_types_have_no_card_values(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers)
        await _publish(client, auth_headers, board["id"], "글")
        listed = await client.get(
            f"/api/public/site/{tenant['slug']}/boards/{board['slug']}/posts"
        )
        item = listed.json()["data"]["items"][0]
        assert item["summary"] is None
        assert item["card_fields"] is None
