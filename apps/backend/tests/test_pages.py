"""페이지 관리 (T-237, 페이지 관리 기획서 PM-01 · PM-02 · PART C)."""

import json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from app.services import feature as feature_service
from app.services import page as page_service
from tests.conftest import _TestSession  # type: ignore
from tests.test_rls import tenant_b, tenant_b_headers  # noqa: F401 (픽스처)

_URL = "/api/v1/pages"
_CODE = "TPL_TEST_PAGES"
_TEMPLATE_PAGES = [
    {"key": "home", "title": "홈"},
    {"key": "about", "title": "회사소개"},
    {"key": "about-history", "title": "연혁", "parent": "about"},
]


async def _sql(sql: str, params: dict | None = None) -> list:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        result = await session.execute(text(sql), params or {})
        rows = result.all() if result.returns_rows else []
        await session.commit()
        return rows


async def _enable(tenant_id: str) -> None:
    await _sql(
        "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled,"
        " enabled_at, created_at, updated_at) SELECT gen_random_uuid(), :t, id,"
        " true, now(), now(), now() FROM features WHERE key = 'CUSTOM_PAGES'"
        " ON CONFLICT ON CONSTRAINT uq_tenant_features_pair DO NOTHING",
        {"t": tenant_id},
    )
    await feature_service.invalidate_cache(tenant_id)


async def _add_section(tenant_id: str, page_key: str, label: str = "본문") -> str:
    sid = str(uuid.uuid4())
    await _sql(
        "INSERT INTO sections (id, tenant_id, section_type, label, display_order,"
        " is_active, page_key, created_at, updated_at)"
        " VALUES (:id, :t, 'INTRO', :l, 1, true, :p, now(), now())",
        {"id": sid, "t": tenant_id, "l": label, "p": page_key},
    )
    await _sql(
        "INSERT INTO section_settings (id, tenant_id, section_id, field_key,"
        " field_value, value_type, is_sample, created_at, updated_at)"
        " VALUES (gen_random_uuid(), :t, :s, 'main_title', '안녕하세요', 'STRING',"
        " false, now(), now())",
        {"t": tenant_id, "s": sid},
    )
    return sid


@pytest.fixture
async def pages_on(test_tenant: dict):
    """스위치 켜짐 + STANDARD (페이지 10개)"""
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t",
        {"t": test_tenant["id"]},
    )
    await _enable(test_tenant["id"])
    yield test_tenant
    for table in ("tenant_features", "site_settings"):
        await _sql(
            f"DELETE FROM {table} WHERE tenant_id = :t",  # noqa: S608
            {"t": test_tenant["id"]},
        )
    await feature_service.invalidate_cache(test_tenant["id"])


@pytest.fixture
async def code_template(test_tenant: dict, monkeypatch):
    template_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO templates (id, template_type, name, css_variables,"
        " section_layouts, is_active, min_plan, renderer, code, created_at, updated_at)"
        " VALUES (:id, 'HOSPITAL', '페이지 테스트', '{}'::jsonb, '[]'::jsonb, true,"
        " 'BASIC', 'code', :code, now(), now())",
        {"id": template_id, "code": f"{_CODE}_{template_id[:8]}"},
    )
    await _sql(
        "INSERT INTO tenant_template_overrides (id, tenant_id, template_id,"
        " css_overrides, applied_at, created_at, updated_at)"
        " VALUES (:id, :t, :tpl, '{}'::jsonb, now(), now(), now())",
        {"id": str(uuid.uuid4()), "t": test_tenant["id"], "tpl": template_id},
    )
    monkeypatch.setattr(
        page_service,
        "template_pages",
        lambda code: _TEMPLATE_PAGES if code.startswith(_CODE) else [],
    )
    yield template_id
    await _sql(
        "DELETE FROM tenant_template_overrides WHERE template_id = :t",
        {"t": template_id},
    )
    await _sql("DELETE FROM templates WHERE id = :t", {"t": template_id})


async def _create(client: AsyncClient, headers: dict, key: str, **kw):
    return await client.post(
        _URL,
        headers=headers,
        json={"title": kw.pop("title", key[:30]), "page_key": key, **kw},
    )


async def _list(client: AsyncClient, headers: dict) -> dict:
    resp = await client.get(_URL, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _error(resp) -> dict:
    return resp.json()["error"]


class TestAccess:
    async def test_requires_auth(self, client: AsyncClient):
        assert (await client.get(_URL)).status_code == 401

    async def test_switch_off_lists_home_only_and_blocks_writes(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        data = await _list(client, auth_headers)
        assert data["enabled"] is False
        assert [p["page_key"] for p in data["pages"]] == ["home"]
        assert data["pages"][0]["origin"] == "TEMPLATE"
        assert data["limits"]["limit"] == 0
        resp = await _create(client, auth_headers, "event")
        assert resp.status_code == 403
        resp = await client.get(f"{_URL}/check-key?key=event", headers=auth_headers)
        assert resp.status_code == 403

    async def test_free_plan_is_422(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _enable(test_tenant["id"])
        resp = await _create(client, auth_headers, "event")
        assert resp.status_code == 422
        assert _error(resp)["code"] == "PLAN_LIMIT_EXCEEDED"
        assert "STANDARD" in _error(resp)["message"]
        await _sql(
            "DELETE FROM tenant_features WHERE tenant_id = :t", {"t": test_tenant["id"]}
        )
        await feature_service.invalidate_cache(test_tenant["id"])

    async def test_viewer_cannot_write(
        self, client: AsyncClient, test_user: dict, pages_on: dict
    ):
        await _sql(
            "UPDATE users SET role = 'TENANT_VIEWER' WHERE id = :i",
            {"i": test_user["id"]},
        )
        token = create_access_token(
            user_id=uuid.UUID(test_user["id"]),
            tenant_id=uuid.UUID(pages_on["id"]),
            role="TENANT_VIEWER",
        )
        headers = {"Authorization": f"Bearer {token}"}
        assert (await client.get(_URL, headers=headers)).status_code == 200
        assert (await _create(client, headers, "event")).status_code == 403

    async def test_other_tenant_page_is_404(
        self,
        client: AsyncClient,
        auth_headers: dict,
        pages_on: dict,
        tenant_b_headers: dict,  # noqa: F811
        tenant_b: dict,  # noqa: F811
    ):
        page = (await _create(client, auth_headers, "event")).json()["data"]
        await _enable(tenant_b["tenant_id"])
        resp = await client.patch(
            f"{_URL}/{page['id']}", headers=tenant_b_headers, json={"title": "해킹"}
        )
        assert resp.status_code == 404
        resp = await client.delete(f"{_URL}/{page['id']}", headers=tenant_b_headers)
        assert resp.status_code == 404
        listed = await _list(client, tenant_b_headers)
        assert "event" not in [p["page_key"] for p in listed["pages"]]
        await _sql(
            "DELETE FROM tenant_features WHERE tenant_id = :t",
            {"t": tenant_b["tenant_id"]},
        )


class TestCreate:
    async def test_create_and_list(
        self, client: AsyncClient, auth_headers: dict, pages_on: dict
    ):
        resp = await _create(
            client,
            auth_headers,
            "event",
            title="  겨울 이벤트 ",
            is_public=False,
            seo_title="겨울 이벤트 | 하나치과",
        )
        assert resp.status_code == 201, resp.text
        page = resp.json()["data"]
        assert page["title"] == "겨울 이벤트"
        assert page["origin"] == "CUSTOM"
        assert page["is_public"] is False
        assert page["section_count"] == 0
        data = await _list(client, auth_headers)
        assert [p["page_key"] for p in data["pages"]] == ["home", "event"]
        assert data["limits"] == {
            "plan": "STANDARD",
            "limit": 10,
            "used": 1,
            "can_create": True,
            "reason": None,
        }

    @pytest.mark.parametrize(
        ("key", "status", "message"),
        [
            ("A", 400, "영문 소문자"),
            ("bad key", 400, "영문 소문자"),
            ("-event", 400, "영문 소문자"),
            ("x" * 41, 400, "영문 소문자"),
            ("home", 409, "홈 페이지"),
            ("login", 409, "다른 화면"),
            ("b", 400, "영문 소문자"),
            ("member", 409, "다른 화면"),
            ("notice", 409, "공지사항"),
        ],
    )
    async def test_key_rules(
        self,
        client: AsyncClient,
        auth_headers: dict,
        pages_on: dict,
        key: str,
        status: int,
        message: str,
    ):
        resp = await _create(client, auth_headers, key)
        assert resp.status_code == status
        assert message in _error(resp)["message"]
        assert _error(resp)["field"] == "page_key"

    async def test_duplicate_and_trash_keys(
        self, client: AsyncClient, auth_headers: dict, pages_on: dict
    ):
        page = (await _create(client, auth_headers, "event")).json()["data"]
        resp = await _create(client, auth_headers, "event")
        assert resp.status_code == 409
        assert "이미 다른 페이지" in _error(resp)["message"]
        await client.delete(f"{_URL}/{page['id']}", headers=auth_headers)
        resp = await client.get(f"{_URL}/check-key?key=event", headers=auth_headers)
        assert resp.json()["data"] == {
            "available": False,
            "reason": page_service.MSG_KEY_TRASH,
        }
        resp = await client.get(f"{_URL}/check-key?key=sale", headers=auth_headers)
        assert resp.json()["data"] == {"available": True, "reason": None}

    async def test_code_template_pages_and_key_clash(
        self,
        client: AsyncClient,
        auth_headers: dict,
        pages_on: dict,
        code_template: str,
    ):
        data = await _list(client, auth_headers)
        assert [
            (p["page_key"], p["origin"], p["parent_key"]) for p in data["pages"]
        ] == [
            ("home", "TEMPLATE", None),
            ("about", "TEMPLATE", None),
            ("about-history", "TEMPLATE", "about"),
        ]
        resp = await _create(client, auth_headers, "about")
        assert resp.status_code == 409
        assert _error(resp)["message"] == page_service.MSG_KEY_TEMPLATE
        # 템플릿 하위 페이지 아래는 못 묶고, 맨 위 템플릿 페이지 아래는 된다
        resp = await _create(client, auth_headers, "team", parent_key="about-history")
        assert resp.status_code == 400
        assert _error(resp)["field"] == "parent_key"
        resp = await _create(client, auth_headers, "team", parent_key="about")
        assert resp.status_code == 201
        assert resp.json()["data"]["parent_key"] == "about"

    async def test_template_switch_hides_then_revives_template_pages(
        self,
        client: AsyncClient,
        auth_headers: dict,
        pages_on: dict,
        code_template: str,
    ):
        data = await _list(client, auth_headers)
        about = next(p for p in data["pages"] if p["page_key"] == "about")
        await client.patch(
            f"{_URL}/{about['id']}", headers=auth_headers, json={"seo_title": "소개"}
        )
        await _sql(
            "DELETE FROM tenant_template_overrides WHERE tenant_id = :t",
            {"t": pages_on["id"]},
        )
        data = await _list(client, auth_headers)
        assert [p["page_key"] for p in data["pages"]] == ["home"]
        assert data["trash"] == []  # 템플릿 페이지는 휴지통에 안 보인다
        await _sql(
            "INSERT INTO tenant_template_overrides (id, tenant_id, template_id,"
            " css_overrides, applied_at, created_at, updated_at)"
            " VALUES (gen_random_uuid(), :t, :tpl, '{}'::jsonb, now(), now(), now())",
            {"t": pages_on["id"], "tpl": code_template},
        )
        data = await _list(client, auth_headers)
        about = next(p for p in data["pages"] if p["page_key"] == "about")
        assert about["seo_title"] == "소개"

    async def test_limit(
        self, client: AsyncClient, auth_headers: dict, pages_on: dict, monkeypatch
    ):
        monkeypatch.setitem(page_service.PAGE_LIMITS, "STANDARD", 1)
        assert (await _create(client, auth_headers, "event")).status_code == 201
        resp = await _create(client, auth_headers, "sale")
        assert resp.status_code == 422
        assert "1개까지" in _error(resp)["message"]


class TestUpdate:
    async def test_fields_and_clear(
        self, client: AsyncClient, auth_headers: dict, pages_on: dict
    ):
        page = (
            await _create(client, auth_headers, "event", seo_description="설명")
        ).json()["data"]
        resp = await client.patch(
            f"{_URL}/{page['id']}",
            headers=auth_headers,
            json={
                "title": "새 이름",
                "seo_description": "",
                "noindex": True,
                "show_in_menu": False,
            },
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert (data["title"], data["seo_description"], data["noindex"]) == (
            "새 이름",
            None,
            True,
        )
        assert data["show_in_menu"] is False

    async def test_rename_moves_sections_menu_and_redirects(
        self, client: AsyncClient, auth_headers: dict, pages_on: dict
    ):
        tid = pages_on["id"]
        page = (await _create(client, auth_headers, "event")).json()["data"]
        child = (
            await _create(client, auth_headers, "event-faq", parent_key="event")
        ).json()["data"]
        await _add_section(tid, "event")
        await _sql(
            "INSERT INTO site_settings (id, tenant_id, menu_items, created_at,"
            " updated_at) VALUES (gen_random_uuid(), :t, CAST(:m AS jsonb), now(),"
            " now())",
            {
                "t": tid,
                "m": json.dumps(
                    [
                        {
                            "scope": "theme",
                            "nodes": [
                                {
                                    "id": "p-event",
                                    "label": "이벤트",
                                    "type": "page",
                                    "target": "event",
                                    "children": [],
                                }
                            ],
                            "known": ["event"],
                        }
                    ]
                ),
            },
        )
        url = f"{_URL}/{page['id']}"
        resp = await client.patch(url, headers=auth_headers, json={"page_key": "sale"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["section_count"] == 1
        resp = await client.patch(url, headers=auth_headers, json={"page_key": "promo"})
        assert resp.status_code == 200

        redirects = await _sql(
            "SELECT from_key, to_key FROM page_redirects WHERE tenant_id = :t"
            " ORDER BY from_key",
            {"t": tid},
        )
        assert [tuple(r) for r in redirects] == [("event", "promo"), ("sale", "promo")]
        sections = await _sql(
            "SELECT page_key FROM sections WHERE tenant_id = :t", {"t": tid}
        )
        assert [r[0] for r in sections] == ["promo"]
        menu = await _sql(
            "SELECT menu_items FROM site_settings WHERE tenant_id = :t", {"t": tid}
        )
        entry = menu[0][0][0]
        assert entry["nodes"][0]["target"] == "promo"
        assert entry["known"] == ["promo"]
        data = await _list(client, auth_headers)
        assert (
            next(p for p in data["pages"] if p["id"] == child["id"])["parent_key"]
            == "promo"
        )
        # 예전 주소로 되돌리면 그 주소의 이동 기록은 지운다
        resp = await client.patch(url, headers=auth_headers, json={"page_key": "event"})
        assert resp.status_code == 200
        redirects = await _sql(
            "SELECT from_key, to_key FROM page_redirects WHERE tenant_id = :t"
            " ORDER BY from_key",
            {"t": tid},
        )
        assert [tuple(r) for r in redirects] == [("promo", "event"), ("sale", "event")]

    async def test_template_page_rules(
        self,
        client: AsyncClient,
        auth_headers: dict,
        pages_on: dict,
        code_template: str,
    ):
        pages = {p["page_key"]: p for p in (await _list(client, auth_headers))["pages"]}
        about = f"{_URL}/{pages['about']['id']}"
        home = f"{_URL}/{pages['home']['id']}"
        resp = await client.patch(about, headers=auth_headers, json={"page_key": "x1"})
        assert resp.status_code == 400
        resp = await client.patch(
            about, headers=auth_headers, json={"parent_key": "home"}
        )
        assert resp.status_code == 400
        resp = await client.patch(
            about, headers=auth_headers, json={"is_public": False}
        )
        assert resp.status_code == 200
        resp = await client.patch(home, headers=auth_headers, json={"is_public": False})
        assert resp.status_code == 400
        assert (await client.delete(about, headers=auth_headers)).status_code == 403
        assert (await client.delete(home, headers=auth_headers)).status_code == 403

    async def test_parent_rules(
        self, client: AsyncClient, auth_headers: dict, pages_on: dict
    ):
        parent = (await _create(client, auth_headers, "event")).json()["data"]
        await _create(client, auth_headers, "event-faq", parent_key="event")
        resp = await _create(client, auth_headers, "x-missing", parent_key="nope")
        assert _error(resp)["message"] == page_service.MSG_PARENT_MISSING
        resp = await _create(client, auth_headers, "deep", parent_key="event-faq")
        assert _error(resp)["message"] == page_service.MSG_PARENT_DEPTH
        resp = await _create(client, auth_headers, "under-home", parent_key="home")
        assert _error(resp)["message"] == page_service.MSG_PARENT_MISSING
        other = (await _create(client, auth_headers, "sale")).json()["data"]
        resp = await client.patch(
            f"{_URL}/{parent['id']}", headers=auth_headers, json={"parent_key": "sale"}
        )
        assert _error(resp)["message"] == page_service.MSG_HAS_CHILDREN
        resp = await client.patch(
            f"{_URL}/{other['id']}", headers=auth_headers, json={"parent_key": "sale"}
        )
        assert _error(resp)["message"] == page_service.MSG_PARENT_SELF
        resp = await client.patch(
            f"{_URL}/{other['id']}", headers=auth_headers, json={"parent_key": "event"}
        )
        assert resp.json()["data"]["parent_key"] == "event"
        resp = await client.patch(
            f"{_URL}/{other['id']}", headers=auth_headers, json={"parent_key": ""}
        )
        assert resp.json()["data"]["parent_key"] is None

    async def test_reorder(
        self, client: AsyncClient, auth_headers: dict, pages_on: dict
    ):
        a = (await _create(client, auth_headers, "aa")).json()["data"]
        b = (await _create(client, auth_headers, "bb")).json()["data"]
        home = (await _list(client, auth_headers))["pages"][0]
        resp = await client.patch(
            f"{_URL}/order", headers=auth_headers, json={"ids": [b["id"], a["id"]]}
        )
        assert resp.status_code == 400  # 홈이 빠졌다
        resp = await client.patch(
            f"{_URL}/order",
            headers=auth_headers,
            json={"ids": [home["id"], b["id"], a["id"]]},
        )
        assert resp.status_code == 200
        keys = [p["page_key"] for p in (await _list(client, auth_headers))["pages"]]
        assert keys == ["home", "bb", "aa"]


class TestTrashAndCopy:
    async def test_delete_and_restore_with_sections(
        self, client: AsyncClient, auth_headers: dict, pages_on: dict, monkeypatch
    ):
        tid = pages_on["id"]
        page = (await _create(client, auth_headers, "event")).json()["data"]
        child = (
            await _create(client, auth_headers, "event-faq", parent_key="event")
        ).json()["data"]
        await _add_section(tid, "event")
        old = await _add_section(tid, "event", "먼저 지운 섹션")
        await _sql(
            "UPDATE sections SET deleted_at = now() - interval '1 day' WHERE id = :i",
            {"i": old},
        )

        assert (
            await client.delete(f"{_URL}/{page['id']}", headers=auth_headers)
        ).status_code == 200
        data = await _list(client, auth_headers)
        assert [p["page_key"] for p in data["trash"]] == ["event"]
        assert (
            next(p for p in data["pages"] if p["id"] == child["id"])["parent_key"]
            is None
        )
        live = await _sql(
            "SELECT count(*) FROM sections WHERE tenant_id = :t AND deleted_at IS NULL",
            {"t": tid},
        )
        assert live[0][0] == 0

        # 한도가 차면 복구도 막는다
        monkeypatch.setitem(page_service.PAGE_LIMITS, "STANDARD", 1)
        resp = await client.post(f"{_URL}/{page['id']}/restore", headers=auth_headers)
        assert resp.status_code == 422
        monkeypatch.setitem(page_service.PAGE_LIMITS, "STANDARD", 10)
        resp = await client.post(f"{_URL}/{page['id']}/restore", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["data"]["section_count"] == 1  # 먼저 지운 섹션은 그대로
        resp = await client.post(f"{_URL}/{page['id']}/restore", headers=auth_headers)
        assert resp.status_code == 404

    async def test_duplicate_copies_sections_hidden(
        self, client: AsyncClient, auth_headers: dict, pages_on: dict
    ):
        tid = pages_on["id"]
        page = (
            await _create(client, auth_headers, "event", seo_title="이벤트")
        ).json()["data"]
        await _add_section(tid, "event")
        resp = await client.post(
            f"{_URL}/{page['id']}/duplicate",
            headers=auth_headers,
            json={"title": "이벤트 복사", "page_key": "event-copy"},
        )
        assert resp.status_code == 201, resp.text
        copy = resp.json()["data"]
        assert (copy["is_public"], copy["show_in_menu"], copy["seo_title"]) == (
            False,
            False,
            "이벤트",
        )
        assert copy["section_count"] == 1
        values = await _sql(
            "SELECT ss.field_value FROM section_settings ss JOIN sections s"
            " ON s.id = ss.section_id"
            " WHERE s.tenant_id = :t AND s.page_key = 'event-copy'",
            {"t": tid},
        )
        assert [r[0] for r in values] == ["안녕하세요"]
        resp = await client.post(
            f"{_URL}/{page['id']}/duplicate",
            headers=auth_headers,
            json={"title": "또", "page_key": "event"},
        )
        assert resp.status_code == 409


class TestMenu:
    async def test_custom_pages_in_menu_options(
        self, client: AsyncClient, auth_headers: dict, pages_on: dict
    ):
        await _create(client, auth_headers, "event", title="이벤트")
        await _create(
            client, auth_headers, "event-faq", title="FAQ", parent_key="event"
        )
        await _create(client, auth_headers, "hidden", is_public=False)
        await _create(client, auth_headers, "quiet", show_in_menu=False)
        resp = await client.get("/api/v1/site-settings/menu", headers=auth_headers)
        menu = resp.json()["data"]
        options = {p["key"]: p for p in menu["pages"] if p["custom"]}
        assert set(options) == {"event", "event-faq", "quiet"}
        assert options["event-faq"]["parent"] == "event"
        tops = [
            n for n in menu["nodes"] if n["type"] == "page" and n["target"] in options
        ]
        assert [(n["id"], n["target"]) for n in tops] == [("p-event", "event")]
        assert [c["target"] for c in tops[0]["children"]] == ["event-faq"]

    async def test_switch_off_hides_custom_pages_from_menu(
        self, client: AsyncClient, auth_headers: dict, pages_on: dict
    ):
        await _create(client, auth_headers, "event")
        await _sql(
            "DELETE FROM tenant_features WHERE tenant_id = :t", {"t": pages_on["id"]}
        )
        await feature_service.invalidate_cache(pages_on["id"])
        resp = await client.get("/api/v1/site-settings/menu", headers=auth_headers)
        assert not [p for p in resp.json()["data"]["pages"] if p["custom"]]
