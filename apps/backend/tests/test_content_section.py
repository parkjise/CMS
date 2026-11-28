"""콘텐츠 연결 섹션 · 공개 API · 사용 위치 (T-258, 콘텐츠 관리 기획서 5장)."""

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient

from app.services import content_section, site_cache
from app.services import content_type as type_service
from tests.test_content_types import _disable, _enable, _sql

CONTENTS = "/api/v1/contents"
SECTIONS = "/api/v1/sections"


@pytest.fixture(autouse=True)
def purged(monkeypatch) -> list:
    calls: list = []

    async def fake_purge(_db, tenant_id):
        calls.append(tenant_id)
        return True

    monkeypatch.setattr(site_cache, "purge_site", fake_purge)
    return calls


@pytest.fixture
async def contents_on(test_tenant: dict) -> AsyncIterator[dict]:
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t",
        {"t": test_tenant["id"]},
    )
    await _enable(test_tenant["id"])
    yield test_tenant
    await _disable(test_tenant["id"])


async def _type(client: AsyncClient, headers: dict, preset: str = "team") -> dict:
    resp = await client.post(
        f"{CONTENTS}/types", headers=headers, json={"preset_key": preset}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _item(client: AsyncClient, headers: dict, **body) -> dict:
    resp = await client.post(f"{CONTENTS}/items", headers=headers, json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _section(tenant_id: str, page_key: str = "home") -> str:
    section_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO sections (id, tenant_id, section_type, label, display_order,"
        " page_key, is_active, created_at, updated_at)"
        " VALUES (:id, :t, 'CONTENT_LIST', '콘텐츠', 0, :p, true, now(), now())",
        {"id": section_id, "t": tenant_id, "p": page_key},
    )
    return section_id


async def _save(client: AsyncClient, headers: dict, section_id: str, **values: str):
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


def _public(slug: str, type_id: str, query: str = "") -> str:
    return f"/api/public/site/{slug}/content-types/{type_id}/items{query}"


class TestAddable:
    async def test_only_when_switch_on(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _sql(
            "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t",
            {"t": test_tenant["id"]},
        )
        limits = (await client.get(f"{SECTIONS}/limits", headers=auth_headers)).json()
        kinds = [t["section_type"] for t in limits["data"]["addable_types"]]
        assert "CONTENT_LIST" not in kinds
        await _enable(test_tenant["id"])
        limits = (await client.get(f"{SECTIONS}/limits", headers=auth_headers)).json()
        assert {"section_type": "CONTENT_LIST", "label": "콘텐츠 연결"} in [
            {"section_type": t["section_type"], "label": t["label"]}
            for t in limits["data"]["addable_types"]
        ]
        await _disable(test_tenant["id"])


class TestSettings:
    async def test_valid_settings_are_saved(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await _type(client, auth_headers, "faq")
        cat = (
            await client.post(
                f"{CONTENTS}/types/{t['id']}/categories",
                headers=auth_headers,
                json={"name": "진료"},
            )
        ).json()["data"]
        section_id = await _section(contents_on["id"])
        resp = await _save(
            client,
            auth_headers,
            section_id,
            content_type=t["id"],
            category_id=cat["id"],
            item_count="12",
            display_mode="FAQ",
            sort="latest",
            empty_text=" 준비 중 ",
        )
        assert resp.status_code == 200, resp.text
        saved = {s["field_key"]: s for s in resp.json()["data"]["settings"]}
        assert saved["content_type"]["field_value"] == t["id"]
        assert saved["item_count"]["value_type"] == "INTEGER"
        assert saved["empty_text"]["field_value"] == "준비 중"

    @pytest.mark.parametrize(
        ("values", "message"),
        [
            ({"content_type": str(uuid.uuid4())}, content_section.MSG_TYPE),
            ({"item_count": "2"}, content_section.MSG_COUNT),
            ({"item_count": "25"}, content_section.MSG_COUNT),
            ({"display_mode": "GRID"}, content_section.MSG_DISPLAY),
            ({"sort": "random"}, content_section.MSG_SORT),
            ({"tag_id": str(uuid.uuid4())}, content_section.MSG_TAG),
            ({"empty_text": "x" * 101}, content_section.MSG_EMPTY_TEXT),
        ],
    )
    async def test_invalid_settings_are_400(
        self,
        client: AsyncClient,
        auth_headers: dict,
        contents_on: dict,
        values: dict,
        message: str,
    ):
        section_id = await _section(contents_on["id"])
        resp = await _save(client, auth_headers, section_id, **values)
        assert resp.status_code == 400
        assert message in resp.text

    async def test_category_must_belong_to_saved_type(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        faq = await _type(client, auth_headers, "faq")
        team = await _type(client, auth_headers, "team")
        foreign = (
            await client.post(
                f"{CONTENTS}/types/{team['id']}/categories",
                headers=auth_headers,
                json={"name": "의료진"},
            )
        ).json()["data"]
        section_id = await _section(contents_on["id"])
        assert (
            await _save(client, auth_headers, section_id, content_type=faq["id"])
        ).status_code == 200
        # 카테고리만 바꿔도 저장된 유형 기준으로 검사
        resp = await _save(client, auth_headers, section_id, category_id=foreign["id"])
        assert resp.status_code == 400
        assert content_section.MSG_CATEGORY in resp.text


class TestPublic:
    async def test_published_only_with_fields_and_filters(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await _type(client, auth_headers, "team")
        cat = (
            await client.post(
                f"{CONTENTS}/types/{t['id']}/categories",
                headers=auth_headers,
                json={"name": "진료부"},
            )
        ).json()["data"]
        child = (
            await client.post(
                f"{CONTENTS}/types/{t['id']}/categories",
                headers=auth_headers,
                json={"name": "치과", "parent_id": cat["id"]},
            )
        ).json()["data"]
        a = await _item(
            client,
            auth_headers,
            type_id=t["id"],
            title="가원장",
            data={"role": "대표원장", "specialty": "임플란트"},
            category_id=child["id"],
            tags=["원장"],
            status="PUBLISHED",
        )
        await _item(
            client,
            auth_headers,
            type_id=t["id"],
            title="나실장",
            data={"role": "실장"},
            status="PUBLISHED",
        )
        await _item(client, auth_headers, type_id=t["id"], title="초안")
        slug = contents_on["slug"]
        resp = await client.get(_public(slug, t["id"]))
        assert resp.status_code == 200, resp.text
        items = resp.json()["data"]
        assert [i["title"] for i in items] == ["가원장", "나실장"]
        assert items[0]["fields"][0] == {
            "key": "role",
            "label": "직책",
            "field_type": "TEXT",
            "value": "대표원장",
        }
        assert items[0]["body"] is None
        # 맨 위 카테고리는 하위 카테고리 항목도
        resp = await client.get(_public(slug, t["id"], f"?category={cat['id']}"))
        assert [i["id"] for i in resp.json()["data"]] == [a["id"]]
        tag_id = a["tags"][0]["id"]
        resp = await client.get(_public(slug, t["id"], f"?tag={tag_id}&body=true"))
        assert [i["title"] for i in resp.json()["data"]] == ["가원장"]
        assert resp.json()["data"][0]["body"] == []
        resp = await client.get(_public(slug, t["id"], "?sort=title&limit=1"))
        assert [i["title"] for i in resp.json()["data"]] == ["가원장"]

    async def test_404_when_switch_off_or_unknown(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await _type(client, auth_headers, "faq")
        slug = contents_on["slug"]
        assert (await client.get(_public(slug, str(uuid.uuid4())))).status_code == 404
        assert (await client.get(_public("no-such-site", t["id"]))).status_code == 404
        await _disable(contents_on["id"])
        assert (await client.get(_public(slug, t["id"]))).status_code == 404

    async def test_item_changes_purge_site_cache(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict, purged: list
    ):
        t = await _type(client, auth_headers, "faq")
        purged.clear()
        item = await _item(client, auth_headers, type_id=t["id"], title="질문")
        await client.patch(
            f"{CONTENTS}/items/{item['id']}",
            headers=auth_headers,
            json={"status": "PUBLISHED"},
        )
        await client.delete(f"{CONTENTS}/items/{item['id']}", headers=auth_headers)
        assert len(purged) == 3


class TestUsage:
    async def test_type_and_item_usage(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await _type(client, auth_headers, "faq")
        cat = (
            await client.post(
                f"{CONTENTS}/types/{t['id']}/categories",
                headers=auth_headers,
                json={"name": "주차"},
            )
        ).json()["data"]
        in_cat = await _item(
            client, auth_headers, type_id=t["id"], title="a", category_id=cat["id"]
        )
        other = await _item(client, auth_headers, type_id=t["id"], title="b")
        everything = await _section(contents_on["id"])
        only_cat = await _section(contents_on["id"])
        await _save(
            client,
            auth_headers,
            everything,
            content_type=t["id"],
            section_title="<b>자주 묻는 질문</b>",
        )
        await _save(
            client,
            auth_headers,
            only_cat,
            content_type=t["id"],
            category_id=cat["id"],
        )
        usage = (
            await client.get(f"{CONTENTS}/types/{t['id']}/usage", headers=auth_headers)
        ).json()["data"]
        assert {u["section_id"] for u in usage} == {everything, only_cat}
        assert any(u["label"] == "자주 묻는 질문" for u in usage)
        assert {u["page_title"] for u in usage} == {"홈"}
        a_usage = (
            await client.get(
                f"{CONTENTS}/items/{in_cat['id']}/usage", headers=auth_headers
            )
        ).json()["data"]
        assert {u["section_id"] for u in a_usage} == {everything, only_cat}
        b_usage = (
            await client.get(
                f"{CONTENTS}/items/{other['id']}/usage", headers=auth_headers
            )
        ).json()["data"]
        assert [u["section_id"] for u in b_usage] == [everything]

    async def test_type_in_use_cannot_be_deleted(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await _type(client, auth_headers, "faq")
        section_id = await _section(contents_on["id"])
        await _save(client, auth_headers, section_id, content_type=t["id"])
        resp = await client.delete(f"{CONTENTS}/types/{t['id']}", headers=auth_headers)
        assert resp.status_code == 409
        assert resp.json()["error"]["message"] == type_service.MSG_IN_USE
        # 지운 섹션은 세지 않는다
        await _sql(
            "UPDATE sections SET deleted_at = now() WHERE id = :s", {"s": section_id}
        )
        resp = await client.delete(f"{CONTENTS}/types/{t['id']}", headers=auth_headers)
        assert resp.status_code == 200
