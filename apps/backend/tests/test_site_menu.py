"""상단 메뉴 설정 (T-036-B) · 메뉴 트리 (T-223, 사이트 관리 기획서 SM-02)."""

import json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.data.template_samples import load_menu
from app.services import feature as feature_service
from app.services import site_settings as site_settings_service
from tests.conftest import _TestSession  # type: ignore
from tests.test_rls import tenant_b, tenant_b_headers  # noqa: F401 (픽스처)

_URL = "/api/v1/site-settings/menu"
_CODE = "TPL_TEST_MENU"
_PAGES = [
    {"key": "about", "title": "회사소개"},
    {"key": "about-history", "title": "연혁", "parent": "about"},
    {"key": "business", "title": "사업영역"},
    {"key": "notice", "title": "공지사항"},
]


async def _sql(sql: str, params: dict | None = None) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(text(sql), params or {})
        await session.commit()


async def _add_section(tenant_id: str, stype: str, label: str, order: int, **kw) -> str:
    sid = str(uuid.uuid4())
    await _sql(
        "INSERT INTO sections (id, tenant_id, section_type, label, display_order,"
        " is_active, page_key, created_at, updated_at)"
        " VALUES (:id, :t, :ty, :l, :o, :a, :p, now(), now())",
        {
            "id": sid,
            "t": tenant_id,
            "ty": stype,
            "l": label,
            "o": order,
            "a": kw.get("active", True),
            "p": kw.get("page", "home"),
        },
    )
    return sid


@pytest.fixture
async def standard_plan(test_tenant: dict):
    """게시판을 만들 수 있는 요금제 (STANDARD 부터)"""
    await feature_service.invalidate_cache(test_tenant["id"])
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t",
        {"t": test_tenant["id"]},
    )
    yield
    await feature_service.invalidate_cache(test_tenant["id"])


@pytest.fixture
async def theme_sections(test_tenant: dict, standard_plan: None):
    tid = test_tenant["id"]
    ids = [
        await _add_section(tid, "HERO_BANNER", "메인", 1),
        await _add_section(tid, "INTRO", "소개", 2),
        await _add_section(tid, "GALLERY", "꺼진 갤러리", 3, active=False),
        await _add_section(tid, "INTRO", "다른 페이지", 4, page="about"),
        await _add_section(tid, "HERO_SLIDER", "슬라이더", 5),
    ]
    yield ids
    await _sql("DELETE FROM sections WHERE tenant_id = :t", {"t": tid})


@pytest.fixture
async def code_template(test_tenant: dict, monkeypatch):
    template_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO templates (id, template_type, name, css_variables,"
        " section_layouts, is_active, min_plan, renderer, code, created_at, updated_at)"
        " VALUES (:id, 'HOSPITAL', '메뉴 테스트', CAST(:css AS jsonb),"
        " CAST(:layouts AS jsonb), true, 'BASIC', 'code', :code, now(), now())",
        {
            "id": template_id,
            "css": json.dumps({}),
            "layouts": json.dumps(["HERO_SLIDER"]),
            "code": f"{_CODE}_{template_id[:8]}",
        },
    )
    await _sql(
        "INSERT INTO tenant_template_overrides (id, tenant_id, template_id,"
        " css_overrides, applied_at, created_at, updated_at)"
        " VALUES (:id, :t, :tpl, '{}'::jsonb, now(), now(), now())",
        {"id": str(uuid.uuid4()), "t": test_tenant["id"], "tpl": template_id},
    )
    monkeypatch.setattr(
        site_settings_service,
        "load_menu",
        lambda code: _PAGES if code.startswith(_CODE) else [],
    )
    yield template_id
    await _sql(
        "DELETE FROM tenant_template_overrides WHERE template_id = :t",
        {"t": template_id},
    )
    await _sql("DELETE FROM templates WHERE id = :t", {"t": template_id})


def test_hospital_a_menu_file():
    menu = load_menu("TPL_HOSPITAL_A")
    assert [m["key"] for m in menu if not m.get("parent")] == [
        "about",
        "business",
        "notice",
        "consult",
    ]
    # 하위 페이지는 부모와 함께 (T-223)
    assert {m["key"]: m.get("parent") for m in menu if m.get("parent")} == {
        "about-history": "about",
        "about-location": "about",
        "reservation": "consult",
    }
    assert load_menu("TPL_NOT_THERE") == []


def _node(nid: str, label: str, ntype: str, target=None, **kw) -> dict:
    return {"id": nid, "label": label, "type": ntype, "target": target, **kw}


async def _put(client: AsyncClient, headers: dict, nodes: list[dict]):
    return await client.put(_URL, json={"nodes": nodes}, headers=headers)


async def _public(client: AsyncClient, slug: str) -> dict:
    resp = await client.get(f"/api/public/site/{slug}")
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["site_settings"]


async def _board(client: AsyncClient, headers: dict, name: str, **kw) -> dict:
    resp = await client.post(
        "/api/v1/boards",
        json={"name": name, "board_type": "LIST", **kw},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


class TestThemeMenu:
    async def test_unsaved_menu_is_converted_from_current(
        self, client: AsyncClient, auth_headers: dict, theme_sections: list
    ):
        resp = await client.get(_URL, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["mode"] == "theme" and data["saved"] is False
        assert data["max_depth"] == 3
        # 꺼진 섹션 · 다른 페이지 · 테마형이 못 그리는 섹션은 빠진다
        assert [n["label"] for n in data["nodes"]] == ["메인", "소개"]
        assert [n["type"] for n in data["nodes"]] == ["page", "page"]
        assert [p["label"] for p in data["pages"]] == ["메인", "소개"]
        assert [i["default_label"] for i in data["items"]] == ["메인", "소개"]

    async def test_save_tree_and_public(
        self,
        client: AsyncClient,
        auth_headers: dict,
        theme_sections: list,
        test_tenant: dict,
    ):
        hero, intro = theme_sections[0], theme_sections[1]
        board = await _board(client, auth_headers, "병원 소식")
        nodes = [
            _node(
                "g1",
                "  병원 안내 ",
                "group",
                children=[
                    _node("s1", "소개", "page", intro),
                    _node(
                        "s2",
                        "블로그",
                        "url",
                        "https://blog.example.com",
                        new_window=True,
                    ),
                ],
            ),
            _node("b1", "소식", "board", board["id"]),
            _node("s3", "메인", "page", hero, visible=False),
            # 연결 대상이 없는 빈 묶음은 홈페이지에서 빠진다
            _node("g2", "준비 중", "group", "무시"),
        ]
        resp = await _put(client, auth_headers, nodes)
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["saved"] is True
        assert data["nodes"][0]["label"] == "병원 안내"
        assert data["nodes"][3]["target"] is None  # 묶음은 연결 대상이 없다
        # 숨긴 섹션은 평평한 보기에서도 숨김
        flat = {i["key"]: i for i in data["items"]}
        assert flat[hero]["visible"] is False and flat[intro]["visible"] is True
        assert flat[f"board:{board['id']}"]["label"] == "소식"

        info = await _public(client, test_tenant["slug"])
        tree = info["menu_tree"]
        assert [n["label"] for n in tree] == ["병원 안내", "소식"]
        assert tree[0]["children"][1] == {
            "label": "블로그",
            "type": "url",
            "target": "https://blog.example.com",
            "slug": None,
            "new_window": True,
            "children": [],
        }
        assert tree[1]["slug"] == board["slug"]
        assert info["menu_hidden"] == [hero]
        # 예전 방식 값에는 트리가 섞이지 않는다
        assert info["menu_items"] is None

    async def test_unavailable_targets_leave_public_menu(
        self,
        client: AsyncClient,
        auth_headers: dict,
        theme_sections: list,
        test_tenant: dict,
    ):
        board = await _board(client, auth_headers, "소식")
        gone = await _board(client, auth_headers, "지울 게시판")
        resp = await _put(
            client,
            auth_headers,
            [
                _node("b1", "소식", "board", board["id"]),
                _node(
                    "g1",
                    "묶음",
                    "group",
                    children=[_node("b2", "지울", "board", gone["id"])],
                ),
            ],
        )
        assert resp.status_code == 200, resp.text
        await client.patch(
            f"/api/v1/boards/{board['id']}",
            json={"status": "INACTIVE"},
            headers=auth_headers,
        )
        await client.delete(f"/api/v1/boards/{gone['id']}", headers=auth_headers)
        info = await _public(client, test_tenant["slug"])
        # 사용 안 함 · 지운 게시판은 빠지고, 비게 된 묶음도 빠진다
        assert info["menu_tree"] == []
        # 관리자 화면에는 남아 있다 — 경고용
        data = (await client.get(_URL, headers=auth_headers)).json()["data"]
        assert [n["id"] for n in data["nodes"]] == ["b1", "g1"]
        boards = {b["id"]: b for b in data["boards"]}
        assert boards[board["id"]]["active"] is False
        assert gone["id"] not in boards

    async def test_new_sections_and_boards_appended_after_save(
        self,
        client: AsyncClient,
        auth_headers: dict,
        theme_sections: list,
        test_tenant: dict,
    ):
        await _put(
            client,
            auth_headers,
            [_node("s1", "홈", "page", theme_sections[0])],
        )
        await _add_section(test_tenant["id"], "MAP", "오시는 길", 9)
        board = await _board(client, auth_headers, "새 게시판")
        tree = (await _public(client, test_tenant["slug"]))["menu_tree"]
        # 저장할 때 없던 것만 끝에 — 저장 때 뺀 '소개' 섹션은 다시 붙지 않는다
        assert [n["label"] for n in tree] == ["홈", "오시는 길", "새 게시판"]
        assert tree[2]["slug"] == board["slug"]

    async def test_hidden_board_copy_not_appended(
        self,
        client: AsyncClient,
        auth_headers: dict,
        theme_sections: list,
        test_tenant: dict,
    ):
        await _put(client, auth_headers, [_node("s1", "홈", "page", theme_sections[0])])
        await _board(client, auth_headers, "숨긴 게시판", in_menu=False)
        tree = (await _public(client, test_tenant["slug"]))["menu_tree"]
        assert [n["label"] for n in tree] == ["홈"]

    async def test_validation(
        self, client: AsyncClient, auth_headers: dict, theme_sections: list
    ):
        hero = theme_sections[0]

        def deep(levels: int) -> dict:
            node = _node(f"n{levels}", "끝", "page", hero)
            for level in range(levels - 1, 0, -1):
                node = _node(f"n{level}", "묶음", "group", children=[node])
            return node

        cases = [
            ([_node("a", "x", "page", "nope")], "페이지"),
            ([_node("a", "x", "page", hero), _node("a", "y", "page", hero)], "두 번"),
            ([_node("a", "가" * 21, "page", hero)], "20자"),
            ([_node("a", "  ", "page", hero)], "이름"),
            ([_node("a", "x", "url", "javascript:alert(1)")], "http"),
            ([_node("a", "x", "url", "ftp://example.com")], "http"),
            ([_node("a", "x", "board", str(uuid.uuid4()))], "게시판"),
            ([_node("a", "x", "page")], "연결 대상"),
            ([_node("a b", "x", "page", hero)], "id"),
            ([deep(4)], "3단계"),
            (
                [_node(f"n{i}", "x", "page", hero) for i in range(61)],
                "60개",
            ),
        ]
        for nodes, word in cases:
            resp = await _put(client, auth_headers, nodes)
            assert resp.status_code == 400, (word, resp.text)
            body = resp.json()["error"]
            assert body["code"] == "VALIDATION_ERROR"
            assert word in body["message"], (word, body)
        # 3단계까지는 된다
        assert (await _put(client, auth_headers, [deep(3)])).status_code == 200

    async def test_other_tenant_board_rejected(
        self,
        client: AsyncClient,
        auth_headers: dict,
        theme_sections: list,
        tenant_b: dict,  # noqa: F811
        tenant_b_headers: dict,  # noqa: F811
    ):
        await _sql(
            "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t",
            {"t": tenant_b["tenant_id"]},
        )
        await feature_service.invalidate_cache(tenant_b["tenant_id"])
        other = await _board(client, tenant_b_headers, "B 게시판")
        resp = await _put(client, auth_headers, [_node("a", "x", "board", other["id"])])
        assert resp.status_code == 400

    async def test_reset_to_default(
        self,
        client: AsyncClient,
        auth_headers: dict,
        theme_sections: list,
        test_tenant: dict,
    ):
        await _put(client, auth_headers, [_node("s1", "홈", "page", theme_sections[0])])
        resp = await client.delete(_URL, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["saved"] is False
        assert [n["label"] for n in data["nodes"]] == ["메인", "소개"]
        assert (await _public(client, test_tenant["slug"]))["menu_tree"] is None

    async def test_unauthenticated(self, client: AsyncClient):
        assert (await client.get(_URL)).status_code == 401
        assert (await client.put(_URL, json={"nodes": []})).status_code == 401
        assert (await client.delete(_URL)).status_code == 401


class TestCodeMenu:
    async def test_converted_tree_keeps_legacy_and_adds_sub_pages(
        self,
        client: AsyncClient,
        auth_headers: dict,
        code_template: str,
        test_tenant: dict,
    ):
        # 예전 방식으로 저장한 이름 · 순서 · 숨김
        await _sql(
            "INSERT INTO site_settings (id, tenant_id, menu_items, created_at,"
            " updated_at) VALUES (:id, :t, CAST(:m AS jsonb), now(), now())",
            {
                "id": str(uuid.uuid4()),
                "t": test_tenant["id"],
                "m": json.dumps(
                    [
                        {"key": "business", "label": "진료과목", "visible": True},
                        {"key": "about", "label": None, "visible": True},
                        {"key": "notice", "label": None, "visible": False},
                    ]
                ),
            },
        )
        data = (await client.get(_URL, headers=auth_headers)).json()["data"]
        assert data["mode"] == "code" and data["saved"] is False
        nodes = data["nodes"]
        assert [n["label"] for n in nodes] == ["진료과목", "회사소개", "공지사항"]
        assert nodes[2]["visible"] is False
        # 하위 페이지는 하위 메뉴로
        assert [c["target"] for c in nodes[1]["children"]] == ["about-history"]
        assert {p["key"]: p["parent"] for p in data["pages"]}["about-history"] == (
            "about"
        )
        # 저장 전 홈페이지는 예전 방식 그대로
        info = await _public(client, test_tenant["slug"])
        assert info["menu_tree"] is None
        assert [i["key"] for i in info["menu_items"]] == ["business", "about", "notice"]

        # 바꾼 그대로 저장하면 홈페이지가 트리로
        resp = await _put(client, auth_headers, nodes)
        assert resp.status_code == 200, resp.text
        tree = (await _public(client, test_tenant["slug"]))["menu_tree"]
        assert [n["target"] for n in tree] == ["business", "about"]
        assert tree[1]["children"][0]["label"] == "연혁"

    async def test_theme_section_rejected_in_code(
        self,
        client: AsyncClient,
        auth_headers: dict,
        theme_sections: list,
        code_template: str,
    ):
        resp = await _put(
            client, auth_headers, [_node("a", "x", "page", theme_sections[0])]
        )
        assert resp.status_code == 400

    async def test_switching_template_keeps_each_tree(
        self,
        client: AsyncClient,
        auth_headers: dict,
        theme_sections: list,
        code_template: str,
        test_tenant: dict,
    ):
        await _put(client, auth_headers, [_node("c1", "진료과목", "page", "business")])
        # 테마형으로 돌아가 테마 메뉴를 저장해도 코드형 트리는 남는다
        await _sql(
            "DELETE FROM tenant_template_overrides WHERE template_id = :t",
            {"t": code_template},
        )
        await _put(client, auth_headers, [_node("t1", "홈", "page", theme_sections[0])])
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            raw = (
                await session.execute(
                    text("SELECT menu_items FROM site_settings WHERE tenant_id = :t"),
                    {"t": test_tenant["id"]},
                )
            ).scalar_one()
        scopes = sorted(i["scope"] for i in raw)
        assert scopes[1] == "theme" and scopes[0].startswith("code:")
        tree = (await _public(client, test_tenant["slug"]))["menu_tree"]
        assert [n["label"] for n in tree] == ["홈"]
