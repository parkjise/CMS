"""콘텐츠 항목 · 카테고리 · 태그 (T-254, 콘텐츠 관리 기획서 CM-01 · 02 · 05)."""

import uuid

import pytest
from httpx import AsyncClient

from app.services import content_item as item_service
from app.services import content_taxonomy as taxonomy
from tests.test_content_types import _disable, _enable, _sql
from tests.test_rls import tenant_b, tenant_b_headers  # noqa: F401 (픽스처)

_URL = "/api/v1/contents"


@pytest.fixture
async def contents_on(test_tenant: dict):
    """스위치 켜짐 + STANDARD"""
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t",
        {"t": test_tenant["id"]},
    )
    await _enable(test_tenant["id"])
    yield test_tenant
    await _disable(test_tenant["id"])


def _error(resp) -> dict:
    return resp.json()["error"]


async def _type(client: AsyncClient, headers: dict, preset: str = "team") -> dict:
    resp = await client.post(
        f"{_URL}/types", headers=headers, json={"preset_key": preset}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _item(client: AsyncClient, headers: dict, **body) -> dict:
    resp = await client.post(f"{_URL}/items", headers=headers, json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _items(client: AsyncClient, headers: dict, query: str = "") -> dict:
    resp = await client.get(f"{_URL}/items{query}", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


class TestAccess:
    async def test_requires_auth_and_switch(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        assert (await client.get(f"{_URL}/items")).status_code == 401
        assert (
            await client.get(f"{_URL}/items", headers=auth_headers)
        ).status_code == 403
        assert (
            await client.get(f"{_URL}/tags", headers=auth_headers)
        ).status_code == 403

    async def test_other_tenant_cannot_touch(
        self,
        client: AsyncClient,
        auth_headers: dict,
        contents_on: dict,
        tenant_b_headers: dict,  # noqa: F811
        tenant_b: dict,  # noqa: F811
    ):
        t = await _type(client, auth_headers)
        item = await _item(
            client, auth_headers, type_id=t["id"], title="김원장", tags=["원장"]
        )
        cat = (
            await client.post(
                f"{_URL}/types/{t['id']}/categories",
                headers=auth_headers,
                json={"name": "진료부"},
            )
        ).json()["data"]
        tag_id = item["tags"][0]["id"]
        await _enable(tenant_b["tenant_id"])
        h = tenant_b_headers
        assert (
            await client.get(f"{_URL}/items/{item['id']}", headers=h)
        ).status_code == 404
        resp = await client.patch(
            f"{_URL}/items/{item['id']}", headers=h, json={"title": "해킹"}
        )
        assert resp.status_code == 404
        resp = await client.post(
            f"{_URL}/items", headers=h, json={"type_id": t["id"], "title": "x"}
        )
        assert resp.status_code == 400
        assert (
            await client.delete(f"{_URL}/categories/{cat['id']}", headers=h)
        ).status_code == 404
        assert (
            await client.delete(f"{_URL}/tags/{tag_id}", headers=h)
        ).status_code == 404
        assert (await _items(client, h))["total"] == 0
        assert (await client.get(f"{_URL}/tags", headers=h)).json()["data"] == []
        await _disable(tenant_b["tenant_id"])


class TestItems:
    async def test_draft_saves_without_required_publish_checks(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await _type(client, auth_headers)  # 직책(role) 필수
        draft = await _item(client, auth_headers, type_id=t["id"], title=" 김원장 ")
        assert draft["status"] == "DRAFT"
        assert draft["title"] == "김원장"
        assert draft["published_at"] is None
        resp = await client.patch(
            f"{_URL}/items/{draft['id']}",
            headers=auth_headers,
            json={"status": "PUBLISHED"},
        )
        assert resp.status_code == 400
        assert _error(resp)["field"] == "data.role"
        resp = await client.patch(
            f"{_URL}/items/{draft['id']}",
            headers=auth_headers,
            json={"status": "PUBLISHED", "data": {"role": "대표원장"}},
        )
        assert resp.status_code == 200, resp.text
        published = resp.json()["data"]
        assert published["status"] == "PUBLISHED"
        assert published["data"] == {"role": "대표원장"}
        first = published["published_at"]
        assert first is not None
        # 초안으로 되돌렸다가 다시 공개해도 처음 공개 시각은 그대로
        await client.patch(
            f"{_URL}/items/{draft['id']}",
            headers=auth_headers,
            json={"status": "DRAFT"},
        )
        again = (
            await client.patch(
                f"{_URL}/items/{draft['id']}",
                headers=auth_headers,
                json={"status": "PUBLISHED"},
            )
        ).json()["data"]
        assert again["published_at"] == first
        # 공개 상태에서 필수 칸을 비우면 막는다
        resp = await client.patch(
            f"{_URL}/items/{draft['id']}",
            headers=auth_headers,
            json={"data": {"role": ""}},
        )
        assert resp.status_code == 400
        assert _error(resp)["field"] == "data.role"

    async def test_field_values_are_checked(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await _type(client, auth_headers, "history")  # 연도 1900~2100
        for data, field in (
            ({"year": 1800}, "data.year"),
            ({"year": "abc"}, "data.year"),
            ({"nope": 1}, "data.nope"),
        ):
            resp = await client.post(
                f"{_URL}/items",
                headers=auth_headers,
                json={"type_id": t["id"], "title": "설립", "data": data},
            )
            assert resp.status_code == 400, data
            assert _error(resp)["field"] == field
        item = await _item(
            client,
            auth_headers,
            type_id=t["id"],
            title="설립",
            data={"year": 2010, "month": None},
            status="PUBLISHED",
        )
        assert item["data"] == {"year": 2010}  # 빈 값은 저장하지 않는다

    async def test_body_thumbnail_and_unknown_type(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await _type(client, auth_headers, "faq")
        resp = await client.post(
            f"{_URL}/items",
            headers=auth_headers,
            json={"type_id": str(uuid.uuid4()), "title": "x"},
        )
        assert resp.status_code == 400
        assert _error(resp)["field"] == "type_id"
        resp = await client.post(
            f"{_URL}/items",
            headers=auth_headers,
            json={"type_id": t["id"], "title": "x", "body": [{"type": "script"}]},
        )
        assert resp.status_code == 400
        resp = await client.post(
            f"{_URL}/items",
            headers=auth_headers,
            json={
                "type_id": t["id"],
                "title": "x",
                "thumbnail_url": "javascript:alert(1)",
            },
        )
        assert resp.status_code == 400
        assert _error(resp)["field"] == "thumbnail_url"
        body = [{"type": "paragraph", "content": [{"type": "text", "text": "답"}]}]
        item = await _item(
            client,
            auth_headers,
            type_id=t["id"],
            title="주차 되나요?",
            summary="  네  ",
            body=body,
            thumbnail_url="https://cdn.example.com/a.webp",
        )
        assert item["body"] == body
        assert item["summary"] == "네"
        assert item["thumbnail_url"] == "https://cdn.example.com/a.webp"
        assert item["type"]["type_key"] == "faq"

    async def test_list_filters_counts_and_search(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        faq = await _type(client, auth_headers, "faq")
        partner = await _type(client, auth_headers, "partner")
        a = await _item(
            client,
            auth_headers,
            type_id=faq["id"],
            title="주차 안내",
            status="PUBLISHED",
            tags=["안내"],
        )
        await _item(client, auth_headers, type_id=faq["id"], title="예약 방법")
        await _item(client, auth_headers, type_id=partner["id"], title="100%_회사")
        data = await _items(client, auth_headers)
        assert data["counts"] == {"all": 3, "published": 1, "draft": 2, "trash": 0}
        assert data["total"] == 3
        data = await _items(client, auth_headers, f"?type_id={faq['id']}&status=DRAFT")
        assert [i["title"] for i in data["items"]] == ["예약 방법"]
        assert data["counts"]["all"] == 2  # 유형 기준 수
        data = await _items(client, auth_headers, "?q=100%25_")
        assert [i["title"] for i in data["items"]] == ["100%_회사"]
        data = await _items(client, auth_headers, f"?tag_id={a['tags'][0]['id']}")
        assert [i["id"] for i in data["items"]] == [a["id"]]
        data = await _items(client, auth_headers, "?size=2&page=2")
        assert len(data["items"]) == 1

    async def test_trash_restore_and_type_in_trash(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await _type(client, auth_headers, "faq")
        item = await _item(client, auth_headers, type_id=t["id"], title="질문")
        assert (
            await client.delete(f"{_URL}/items/{item['id']}", headers=auth_headers)
        ).status_code == 200
        data = await _items(client, auth_headers, "?trash=true")
        assert [i["id"] for i in data["items"]] == [item["id"]]
        assert data["counts"]["trash"] == 1
        # 유형도 휴지통이면 항목을 되살릴 수 없다
        await client.delete(f"{_URL}/types/{t['id']}", headers=auth_headers)
        resp = await client.post(
            f"{_URL}/items/{item['id']}/restore", headers=auth_headers
        )
        assert resp.status_code == 409
        await client.post(f"{_URL}/types/{t['id']}/restore", headers=auth_headers)
        resp = await client.post(
            f"{_URL}/items/{item['id']}/restore", headers=auth_headers
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["deleted_at"] is None

    async def test_duplicate_is_draft_with_tags(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await _type(client, auth_headers)
        item = await _item(
            client,
            auth_headers,
            type_id=t["id"],
            title="김" * 100,
            data={"role": "원장"},
            tags=["원장", "치과"],
            status="PUBLISHED",
        )
        resp = await client.post(
            f"{_URL}/items/{item['id']}/duplicate", headers=auth_headers
        )
        assert resp.status_code == 201
        copy = resp.json()["data"]
        assert copy["status"] == "DRAFT"
        assert copy["published_at"] is None
        assert len(copy["title"]) == 100
        assert copy["title"].endswith(item_service.COPY_SUFFIX)
        assert copy["data"] == {"role": "원장"}
        assert [tag["name"] for tag in copy["tags"]] == ["원장", "치과"]

    async def test_bulk_skips_items_missing_required(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await _type(client, auth_headers)
        ready = await _item(
            client, auth_headers, type_id=t["id"], title="a", data={"role": "원장"}
        )
        empty = await _item(client, auth_headers, type_id=t["id"], title="b")
        resp = await client.post(
            f"{_URL}/items/bulk",
            headers=auth_headers,
            json={"ids": [ready["id"], empty["id"]], "action": "publish"},
        )
        assert resp.status_code == 200
        assert resp.json()["data"] == {"changed": 1, "skipped": [empty["id"]]}
        resp = await client.post(
            f"{_URL}/items/bulk",
            headers=auth_headers,
            json={"ids": [ready["id"], empty["id"]], "action": "trash"},
        )
        assert resp.json()["data"]["changed"] == 2
        resp = await client.post(
            f"{_URL}/items/bulk",
            headers=auth_headers,
            json={"ids": [ready["id"]], "action": "restore"},
        )
        assert resp.json()["data"]["changed"] == 1
        assert (await _items(client, auth_headers))["counts"]["published"] == 1

    async def test_reorder_within_type(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await _type(client, auth_headers, "faq")
        a = await _item(client, auth_headers, type_id=t["id"], title="a")
        b = await _item(client, auth_headers, type_id=t["id"], title="b")
        resp = await client.patch(
            f"{_URL}/items/order",
            headers=auth_headers,
            json={"type_id": t["id"], "ids": [b["id"]]},
        )
        assert resp.status_code == 400
        resp = await client.patch(
            f"{_URL}/items/order",
            headers=auth_headers,
            json={"type_id": t["id"], "ids": [b["id"], a["id"]]},
        )
        assert resp.status_code == 200
        data = await _items(client, auth_headers, f"?type_id={t['id']}")
        assert [i["title"] for i in data["items"]] == ["b", "a"]


class TestCategories:
    async def _cat(self, client, headers, type_id, name, parent_id=None) -> dict:
        resp = await client.post(
            f"{_URL}/types/{type_id}/categories",
            headers=headers,
            json={"name": name, "parent_id": parent_id},
        )
        assert resp.status_code == 201, resp.text
        return resp.json()["data"]

    async def test_two_levels_and_unique_names(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await _type(client, auth_headers, "faq")
        top = await self._cat(client, auth_headers, t["id"], "진료")
        child = await self._cat(client, auth_headers, t["id"], "예약", top["id"])
        resp = await client.post(
            f"{_URL}/types/{t['id']}/categories",
            headers=auth_headers,
            json={"name": "더 아래", "parent_id": child["id"]},
        )
        assert resp.status_code == 400
        assert _error(resp)["message"] == taxonomy.MSG_PARENT_DEPTH
        resp = await client.post(
            f"{_URL}/types/{t['id']}/categories",
            headers=auth_headers,
            json={"name": " 진 료 "},
        )
        assert resp.status_code == 409
        resp = await client.patch(
            f"{_URL}/categories/{child['id']}",
            headers=auth_headers,
            json={"name": "진료"},
        )
        assert resp.status_code == 409
        resp = await client.patch(
            f"{_URL}/categories/{child['id']}",
            headers=auth_headers,
            json={"name": "예약 · 접수"},
        )
        assert resp.json()["data"]["name"] == "예약 · 접수"
        tree = (
            await client.get(f"{_URL}/types/{t['id']}/categories", headers=auth_headers)
        ).json()["data"]
        assert [(n["name"], [c["name"] for c in n["children"]]) for n in tree] == [
            ("진료", ["예약 · 접수"])
        ]

    async def test_item_category_must_match_type_and_filter_includes_children(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        faq = await _type(client, auth_headers, "faq")
        other = await _type(client, auth_headers, "partner")
        top = await self._cat(client, auth_headers, faq["id"], "진료")
        child = await self._cat(client, auth_headers, faq["id"], "예약", top["id"])
        foreign = await self._cat(client, auth_headers, other["id"], "고객")
        resp = await client.post(
            f"{_URL}/items",
            headers=auth_headers,
            json={"type_id": faq["id"], "title": "x", "category_id": foreign["id"]},
        )
        assert resp.status_code == 400
        assert _error(resp)["field"] == "category_id"
        item = await _item(
            client, auth_headers, type_id=faq["id"], title="x", category_id=child["id"]
        )
        assert item["category_name"] == "예약"
        data = await _items(client, auth_headers, f"?category_id={top['id']}")
        assert [i["id"] for i in data["items"]] == [item["id"]]

    async def test_tree_save_and_delete_moves_items(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await _type(client, auth_headers, "faq")
        a = await self._cat(client, auth_headers, t["id"], "A")
        b = await self._cat(client, auth_headers, t["id"], "B")
        c = await self._cat(client, auth_headers, t["id"], "C")
        url = f"{_URL}/types/{t['id']}/categories/tree"
        # B 아래 C, C 아래 A 는 3단계라 막힘
        resp = await client.put(
            url,
            headers=auth_headers,
            json={
                "nodes": [
                    {"id": b["id"]},
                    {"id": c["id"], "parent_id": b["id"]},
                    {"id": a["id"], "parent_id": c["id"]},
                ]
            },
        )
        assert resp.status_code == 400
        resp = await client.put(
            url,
            headers=auth_headers,
            json={
                "nodes": [
                    {"id": b["id"]},
                    {"id": c["id"], "parent_id": b["id"]},
                    {"id": a["id"]},
                ]
            },
        )
        assert resp.status_code == 200
        tree = resp.json()["data"]
        assert [(n["name"], [x["name"] for x in n["children"]]) for n in tree] == [
            ("B", ["C"]),
            ("A", []),
        ]
        in_c = await _item(
            client, auth_headers, type_id=t["id"], title="c", category_id=c["id"]
        )
        in_b = await _item(
            client, auth_headers, type_id=t["id"], title="b", category_id=b["id"]
        )
        # B(하위 C 포함)를 지우며 A 로 옮긴다 — 지우는 카테고리로는 못 옮김
        resp = await client.delete(
            f"{_URL}/categories/{b['id']}?move_to={c['id']}", headers=auth_headers
        )
        assert resp.status_code == 400
        resp = await client.delete(
            f"{_URL}/categories/{b['id']}?move_to={a['id']}", headers=auth_headers
        )
        assert resp.json()["data"] == {"moved": 2}
        for item in (in_c, in_b):
            got = (
                await client.get(f"{_URL}/items/{item['id']}", headers=auth_headers)
            ).json()["data"]
            assert got["category_id"] == a["id"]
        tree = (
            await client.get(f"{_URL}/types/{t['id']}/categories", headers=auth_headers)
        ).json()["data"]
        assert [(n["name"], n["item_count"]) for n in tree] == [("A", 2)]


class TestTags:
    async def test_item_tags_reuse_same_names(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await _type(client, auth_headers, "faq")
        a = await _item(
            client, auth_headers, type_id=t["id"], title="a", tags=["주차", " 주 차"]
        )
        b = await _item(client, auth_headers, type_id=t["id"], title="b", tags=["주차"])
        assert [x["name"] for x in a["tags"]] == ["주차"]
        assert a["tags"][0]["id"] == b["tags"][0]["id"]
        tags = (await client.get(f"{_URL}/tags", headers=auth_headers)).json()["data"]
        assert [(x["name"], x["item_count"]) for x in tags] == [("주차", 2)]
        resp = await client.patch(
            f"{_URL}/items/{a['id']}", headers=auth_headers, json={"tags": []}
        )
        assert resp.json()["data"]["tags"] == []

    async def test_create_rename_delete(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        resp = await client.post(
            f"{_URL}/tags", headers=auth_headers, json={"name": "Event"}
        )
        assert resp.status_code == 201
        tag = resp.json()["data"]
        resp = await client.post(
            f"{_URL}/tags", headers=auth_headers, json={"name": "event"}
        )
        assert resp.status_code == 409
        other = (
            await client.post(
                f"{_URL}/tags", headers=auth_headers, json={"name": "새소식"}
            )
        ).json()["data"]
        resp = await client.patch(
            f"{_URL}/tags/{other['id']}", headers=auth_headers, json={"name": "EVENT"}
        )
        assert resp.status_code == 409
        t = await _type(client, auth_headers, "faq")
        item = await _item(
            client, auth_headers, type_id=t["id"], title="a", tags=["Event"]
        )
        assert (
            await client.delete(f"{_URL}/tags/{tag['id']}", headers=auth_headers)
        ).status_code == 200
        got = (
            await client.get(f"{_URL}/items/{item['id']}", headers=auth_headers)
        ).json()["data"]
        assert got["tags"] == []
        # 지운 태그 이름은 다시 쓸 수 있다
        resp = await client.post(
            f"{_URL}/tags", headers=auth_headers, json={"name": "Event"}
        )
        assert resp.status_code == 201

    async def test_merge_moves_links(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        t = await _type(client, auth_headers, "faq")
        a = await _item(
            client, auth_headers, type_id=t["id"], title="a", tags=["이벤트"]
        )
        b = await _item(
            client, auth_headers, type_id=t["id"], title="b", tags=["행사", "이벤트"]
        )
        c = await _item(client, auth_headers, type_id=t["id"], title="c", tags=["행사"])
        tags = {
            x["name"]: x["id"]
            for x in (await client.get(f"{_URL}/tags", headers=auth_headers)).json()[
                "data"
            ]
        }
        resp = await client.post(
            f"{_URL}/tags/merge",
            headers=auth_headers,
            json={"source_ids": [tags["행사"]], "target_id": tags["행사"]},
        )
        assert resp.status_code == 400
        resp = await client.post(
            f"{_URL}/tags/merge",
            headers=auth_headers,
            json={"source_ids": [tags["행사"]], "target_id": tags["이벤트"]},
        )
        assert resp.status_code == 200
        assert resp.json()["data"] == {"moved": 1}  # b 는 이미 이벤트
        after = (await client.get(f"{_URL}/tags", headers=auth_headers)).json()["data"]
        assert [(x["name"], x["item_count"]) for x in after] == [("이벤트", 3)]
        for item in (a, b, c):
            got = (
                await client.get(f"{_URL}/items/{item['id']}", headers=auth_headers)
            ).json()["data"]
            assert [x["name"] for x in got["tags"]] == ["이벤트"]

    @pytest.mark.parametrize("name", ["", " ", "x" * 31])
    async def test_tag_name_rules(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict, name: str
    ):
        resp = await client.post(
            f"{_URL}/tags", headers=auth_headers, json={"name": name}
        )
        assert resp.status_code == 400
