"""공통 블록 (T-260, 콘텐츠 관리 기획서 CM-04)."""

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient

from app.services import content_block, site_cache
from app.services import feature as feature_service
from tests.test_content_types import _disable, _enable, _sql
from tests.test_rls import tenant_b, tenant_b_headers  # noqa: F401 (픽스처)

BLOCKS = "/api/v1/contents/blocks"
SECTIONS = "/api/v1/sections"


@pytest.fixture(autouse=True)
def purged(monkeypatch) -> None:
    async def fake_purge(_db, _tenant_id):
        return True

    monkeypatch.setattr(site_cache, "purge_site", fake_purge)


@pytest.fixture
async def contents_on(test_tenant: dict) -> AsyncIterator[dict]:
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t",
        {"t": test_tenant["id"]},
    )
    await _enable(test_tenant["id"])
    yield test_tenant
    await _disable(test_tenant["id"])


async def _section(
    tenant_id: str, *, section_type: str = "INTRO", page_key: str = "home"
) -> str:
    section_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO sections (id, tenant_id, section_type, label, display_order,"
        " page_key, is_active, created_at, updated_at)"
        " VALUES (:id, :t, :type, '소개', 0, :p, true, now(), now())",
        {"id": section_id, "t": tenant_id, "type": section_type, "p": page_key},
    )
    await _sql(
        "INSERT INTO section_settings (id, tenant_id, section_id, field_key,"
        " field_value, value_type, is_sample, created_at, updated_at)"
        " VALUES (gen_random_uuid(), :t, :s, 'intro_text', '안녕하세요', 'STRING',"
        " false, now(), now())",
        {"t": tenant_id, "s": section_id},
    )
    return section_id


async def _values(section_id: str) -> dict[str, str]:
    rows = await _sql(
        "SELECT field_key, field_value FROM section_settings WHERE section_id = :s",
        {"s": section_id},
    )
    return {r[0]: r[1] for r in rows}


async def _page(tenant_id: str, key: str) -> None:
    """직접 만든 페이지 — 섹션을 더하려면 페이지 스위치도 켜야 한다."""
    await _sql(
        "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled,"
        " enabled_at, created_at, updated_at) SELECT gen_random_uuid(), :t, id,"
        " true, now(), now(), now() FROM features WHERE key = 'CUSTOM_PAGES'"
        " ON CONFLICT ON CONSTRAINT uq_tenant_features_pair DO NOTHING",
        {"t": tenant_id},
    )
    await feature_service.invalidate_cache(tenant_id)
    await _sql(
        "INSERT INTO pages (tenant_id, page_key, title, origin)"
        " VALUES (:t, :k, :k, 'CUSTOM')",
        {"t": tenant_id, "k": key},
    )


async def _create(client: AsyncClient, headers: dict, section_id: str, name="인사말"):
    return await client.post(
        BLOCKS, headers=headers, json={"section_id": section_id, "name": name}
    )


class TestBlocks:
    async def test_requires_switch(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        assert (await client.get(BLOCKS)).status_code == 401
        assert (await client.get(BLOCKS, headers=auth_headers)).status_code == 403

    async def test_create_links_section_and_lists_usage(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        section_id = await _section(contents_on["id"])
        resp = await _create(client, auth_headers, section_id)
        assert resp.status_code == 201, resp.text
        block = resp.json()["data"]
        assert block["section_type"] == "INTRO"
        assert block["type_label"] == "소개"
        assert [u["section_id"] for u in block["usage"]] == [section_id]
        section = (
            await client.get(f"{SECTIONS}/{section_id}", headers=auth_headers)
        ).json()["data"]
        assert section["block_id"] == block["id"]
        # 이미 이어진 섹션은 다시 블록으로 만들 수 없다
        assert (await _create(client, auth_headers, section_id)).status_code == 409

    async def test_reference_section_follows_edits_copy_does_not(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        tenant_id = contents_on["id"]
        await _page(tenant_id, "about")
        source = await _section(tenant_id)
        block = (await _create(client, auth_headers, source)).json()["data"]
        ref = await client.post(
            f"{BLOCKS}/{block['id']}/sections",
            headers=auth_headers,
            json={"page_key": "about", "mode": "reference"},
        )
        assert ref.status_code == 201, ref.text
        ref_id = ref.json()["data"]["section_id"]
        copy = await client.post(
            f"{BLOCKS}/{block['id']}/sections",
            headers=auth_headers,
            json={"page_key": "about", "mode": "copy"},
        )
        copy_id = copy.json()["data"]["section_id"]
        assert (await _values(ref_id)) == {"intro_text": "안녕하세요"}
        assert (await _values(copy_id)) == {"intro_text": "안녕하세요"}

        # 관리자 섹션 저장으로 고치면 블록 · 참조형이 함께
        resp = await client.patch(
            f"{SECTIONS}/{ref_id}",
            headers=auth_headers,
            json={
                "settings": [
                    {
                        "field_key": "intro_text",
                        "field_value": "반갑습니다",
                        "value_type": "STRING",
                    }
                ]
            },
        )
        assert resp.status_code == 200, resp.text
        assert (await _values(source))["intro_text"] == "반갑습니다"
        assert (await _values(copy_id))["intro_text"] == "안녕하세요"
        # 인라인 편집도
        resp = await client.post(
            "/api/v1/edit/batch-save",
            headers=auth_headers,
            json={
                "changes": [
                    {"section_id": source, "field": "intro_text", "value": "또 왔어요"}
                ]
            },
        )
        assert resp.status_code == 200, resp.text
        assert (await _values(ref_id))["intro_text"] == "또 왔어요"
        rows = await _sql(
            "SELECT settings FROM content_blocks WHERE id = :b", {"b": block["id"]}
        )
        assert rows[0][0][0]["field_value"] == "또 왔어요"

    async def test_unlink_then_edits_stay_local(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        tenant_id = contents_on["id"]
        source = await _section(tenant_id)
        block = (await _create(client, auth_headers, source)).json()["data"]
        other = (
            await client.post(
                f"{BLOCKS}/{block['id']}/sections",
                headers=auth_headers,
                json={"page_key": "home"},
            )
        ).json()["data"]["section_id"]
        resp = await client.post(
            f"{BLOCKS}/unlink", headers=auth_headers, json={"section_id": other}
        )
        assert resp.status_code == 200
        assert (
            await client.post(
                f"{BLOCKS}/unlink", headers=auth_headers, json={"section_id": other}
            )
        ).status_code == 409
        await client.post(
            "/api/v1/edit/batch-save",
            headers=auth_headers,
            json={
                "changes": [{"section_id": other, "field": "intro_text", "value": "x"}]
            },
        )
        assert (await _values(source))["intro_text"] == "안녕하세요"

    async def test_delete_blocked_while_used(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        source = await _section(contents_on["id"])
        block = (await _create(client, auth_headers, source)).json()["data"]
        resp = await client.delete(f"{BLOCKS}/{block['id']}", headers=auth_headers)
        assert resp.status_code == 409
        assert resp.json()["error"]["message"] == content_block.MSG_IN_USE
        await client.post(
            f"{BLOCKS}/unlink", headers=auth_headers, json={"section_id": source}
        )
        assert (
            await client.delete(f"{BLOCKS}/{block['id']}", headers=auth_headers)
        ).status_code == 200
        assert (await client.get(BLOCKS, headers=auth_headers)).json()["data"] == []

    async def test_rename_and_add_rules(
        self, client: AsyncClient, auth_headers: dict, contents_on: dict
    ):
        source = await _section(contents_on["id"], section_type="FAQ")
        block = (await _create(client, auth_headers, source, "자주 묻는")).json()[
            "data"
        ]
        resp = await client.patch(
            f"{BLOCKS}/{block['id']}", headers=auth_headers, json={"name": " 질문 "}
        )
        assert resp.json()["data"]["name"] == "질문"
        # 테마형이 그릴 수 없는 종류는 더할 수 없다
        resp = await client.post(
            f"{BLOCKS}/{block['id']}/sections", headers=auth_headers, json={}
        )
        assert resp.status_code == 400
        resp = await client.post(
            f"{BLOCKS}/{uuid.uuid4()}/sections", headers=auth_headers, json={}
        )
        assert resp.status_code == 404
        # FREE 는 섹션을 더할 수 없다
        intro = await _section(contents_on["id"])
        intro_block = (await _create(client, auth_headers, intro, "소개")).json()[
            "data"
        ]
        await _sql(
            "UPDATE tenants SET plan_type = 'FREE' WHERE id = :t",
            {"t": contents_on["id"]},
        )
        resp = await client.post(
            f"{BLOCKS}/{intro_block['id']}/sections", headers=auth_headers, json={}
        )
        assert resp.status_code == 422

    async def test_other_tenant_cannot_touch(
        self,
        client: AsyncClient,
        auth_headers: dict,
        contents_on: dict,
        tenant_b_headers: dict,  # noqa: F811
        tenant_b: dict,  # noqa: F811
    ):
        source = await _section(contents_on["id"])
        block = (await _create(client, auth_headers, source)).json()["data"]
        await _enable(tenant_b["tenant_id"])
        h = tenant_b_headers
        assert (
            await client.patch(f"{BLOCKS}/{block['id']}", headers=h, json={"name": "x"})
        ).status_code == 404
        assert (await _create(client, h, source)).status_code == 404
        assert (await client.get(BLOCKS, headers=h)).json()["data"] == []
        await _disable(tenant_b["tenant_id"])
