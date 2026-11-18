"""사이트 관리 AEO · GEO (T-221, 사이트 관리 기획서 SM-05 · SM-06)."""

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text

from app.core.security import create_access_token
from app.services import feature as feature_service
from app.services import site_cache
from app.services.seo import body_text
from tests.conftest import _TestSession  # type: ignore

BOARDS = "/api/v1/boards"
AEO = "/api/v1/seo-settings/aeo"
GEO = "/api/v1/seo-settings/geo"


async def _sql(sql: str, **params) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await s.execute(text(sql), params)
        await s.commit()


async def _user_headers(tenant_id: str, role: str) -> dict:
    user_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
        " created_at, updated_at) VALUES (:id, :t, :e, 'x', :r, true, now(), now())",
        id=user_id,
        t=tenant_id,
        e=f"{user_id[:8]}@example.com",
        r=role,
    )
    token = create_access_token(
        user_id=uuid.UUID(user_id), tenant_id=uuid.UUID(tenant_id), role=role
    )
    return {"Authorization": f"Bearer {token}"}


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


async def _board(client, headers, **fields) -> dict:
    body = {"name": "자주 묻는 질문", "board_type": "FAQ", **fields}
    resp = await client.post(BOARDS, json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _post(client, headers, board_id: str, title: str, **fields) -> dict:
    body = {
        "title": title,
        "body": [{"type": "p", "text": f"{title} 답변"}],
        "status": "PUBLISHED",
        **fields,
    }
    resp = await client.post(f"{BOARDS}/{board_id}/posts", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


class TestBodyText:
    def test_old_blocks(self):
        nodes = [
            {"type": "p", "text": "**진료** 시간은\n평일입니다."},
            {"type": "ul", "items": ["월", "화"]},
            {"type": "image", "src": "x", "alt": "사진"},
        ]
        assert body_text(nodes) == "진료 시간은\n평일입니다.\n월\n화"

    def test_rich_nodes(self):
        nodes = [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "예약은 "},
                    {"type": "text", "text": "전화로", "marks": [{"type": "bold"}]},
                    {"type": "hardBreak"},
                    {"type": "text", "text": "가능합니다."},
                ],
            },
            {
                "type": "bulletList",
                "content": [
                    {
                        "type": "listItem",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "A"}],
                            }
                        ],
                    },
                    {
                        "type": "listItem",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "B"}],
                            }
                        ],
                    },
                ],
            },
        ]
        assert body_text(nodes) == "예약은 전화로\n가능합니다.\nA\nB"

    def test_empty(self):
        assert body_text([]) == ""
        assert body_text([{"type": "paragraph"}]) == ""


class TestAeo:
    async def test_lists_faq_boards_with_public_state(
        self, client, auth_headers, tenant
    ):
        board = await _board(client, auth_headers, slug="faq")
        await _board(client, auth_headers, name="소식", slug="news", board_type="LIST")
        await _post(client, auth_headers, board["id"], "공개 질문")
        await _post(client, auth_headers, board["id"], "초안 질문", status="DRAFT")
        await _post(client, auth_headers, board["id"], "비밀 질문", is_secret=True)

        resp = await client.get(AEO, headers=auth_headers)

        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["faq_board_ids"] == []
        assert [b["slug"] for b in data["boards"]] == ["faq"]
        items = {i["question"]: i for i in data["boards"][0]["items"]}
        assert items["공개 질문"]["answer"] == "공개 질문 답변"
        assert items["공개 질문"]["public"] is True
        assert items["공개 질문"]["note"] is None
        assert (items["초안 질문"]["public"], items["초안 질문"]["note"]) == (
            False,
            "공개 전 글",
        )
        assert items["비밀 질문"]["note"] == "비밀글"

    async def test_save_marks_public_board(self, client, auth_headers, tenant, purged):
        board = await _board(client, auth_headers, slug="faq")
        other = await _board(client, auth_headers, name="FAQ 2", slug="faq-two")
        purged.clear()

        resp = await client.put(
            AEO, json={"faq_board_ids": [board["id"]]}, headers=auth_headers
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["faq_board_ids"] == [board["id"]]
        assert purged == [tenant["id"]]
        site = (await client.get(f"/api/public/site/{tenant['slug']}")).json()["data"]
        flags = {b["slug"]: b["faq_jsonld"] for b in site["boards"]}
        assert flags == {"faq": True, "faq-two": False}
        assert other["id"] not in resp.json()["data"]["faq_board_ids"]

    async def test_non_faq_board_rejected(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, slug="news", board_type="LIST")
        resp = await client.put(
            AEO, json={"faq_board_ids": [board["id"]]}, headers=auth_headers
        )
        assert resp.status_code == 400
        error = resp.json()["error"]
        assert (error["code"], error["field"]) == ("VALIDATION_ERROR", "faq_board_ids")

    async def test_unknown_board_rejected(self, client, auth_headers, tenant):
        resp = await client.put(
            AEO, json={"faq_board_ids": [str(uuid.uuid4())]}, headers=auth_headers
        )
        assert resp.status_code == 400

    async def test_deleted_board_drops_out(self, client, auth_headers, tenant):
        board = await _board(client, auth_headers, slug="faq")
        await client.put(
            AEO, json={"faq_board_ids": [board["id"]]}, headers=auth_headers
        )
        await client.delete(f"{BOARDS}/{board['id']}", headers=auth_headers)
        data = (await client.get(AEO, headers=auth_headers)).json()["data"]
        assert data == {"faq_board_ids": [], "boards": []}

    async def test_requires_auth(self, client):
        assert (await client.get(AEO)).status_code == 401
        assert (await client.put(AEO, json={"faq_board_ids": []})).status_code == 401

    async def test_viewer_reads_only(self, client, tenant):
        viewer = await _user_headers(tenant["id"], "TENANT_VIEWER")
        assert (await client.get(AEO, headers=viewer)).status_code == 200
        resp = await client.put(AEO, json={"faq_board_ids": []}, headers=viewer)
        assert resp.status_code == 403

    async def test_seo_feature_off_blocks_save(self, client, auth_headers, tenant):
        await _sql(
            "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled)"
            " SELECT gen_random_uuid(), :t, id, false FROM features"
            " WHERE key = 'SEO_WIZARD'",
            t=tenant["id"],
        )
        await feature_service.invalidate_cache(tenant["id"])
        resp = await client.put(AEO, json={"faq_board_ids": []}, headers=auth_headers)
        assert resp.status_code == 403


GEO_BODY = {
    "description": "  강남 치과 — 임플란트 전문  ",
    "topics": ["임플란트", " 임플란트 ", "교정", ""],
    "profile_urls": ["https://blog.naver.com/a", "", "https://blog.naver.com/a"],
    "evidence": [
        {
            "claim": "임플란트 3,000건",
            "url": "https://a.com/about",
            "checked_at": "2026-11-19",
        }
    ],
    "crawlers": {"GPTBot": "block", "ClaudeBot": "allow", "CCBot": "keep"},
}


class TestGeo:
    async def test_empty_defaults_and_crawler_list(self, client, auth_headers, tenant):
        resp = await client.get(GEO, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["settings"] == {
            "description": "",
            "topics": [],
            "profile_urls": [],
            "evidence": [],
            "crawlers": {},
        }
        names = [c["name"] for c in data["crawlers"]]
        assert {"GPTBot", "ClaudeBot", "Google-Extended"} <= set(names)

    async def test_save_cleans_values(self, client, auth_headers, tenant, purged):
        resp = await client.put(GEO, json=GEO_BODY, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        saved = resp.json()["data"]["settings"]
        assert saved["description"] == "강남 치과 — 임플란트 전문"
        assert saved["topics"] == ["임플란트", "교정"]
        assert saved["profile_urls"] == ["https://blog.naver.com/a"]
        assert saved["evidence"][0]["checked_at"] == "2026-11-19"
        # 기존 유지는 저장하지 않는다
        assert saved["crawlers"] == {"GPTBot": "block", "ClaudeBot": "allow"}
        assert purged == [tenant["id"]]

    async def test_public_site_hides_evidence(self, client, auth_headers, tenant):
        await client.put(GEO, json=GEO_BODY, headers=auth_headers)
        site = (await client.get(f"/api/public/site/{tenant['slug']}")).json()["data"]
        assert site["seo_settings"]["geo"] == {
            "description": "강남 치과 — 임플란트 전문",
            "topics": ["임플란트", "교정"],
            "profile_urls": ["https://blog.naver.com/a"],
            "crawlers": {"GPTBot": "block", "ClaudeBot": "allow"},
        }

    async def test_geo_keeps_other_seo_values(self, client, auth_headers, tenant):
        await client.put(
            "/api/v1/seo-settings", json={"meta_title": "제목"}, headers=auth_headers
        )
        await client.put(GEO, json=GEO_BODY, headers=auth_headers)
        seo = (await client.get("/api/v1/seo-settings", headers=auth_headers)).json()
        assert seo["data"]["meta_title"] == "제목"

    @pytest.mark.parametrize(
        "patch",
        [
            {"crawlers": {"EvilBot": "block"}},
            {"crawlers": {"GPTBot": "maybe"}},
            {"profile_urls": ["javascript:alert(1)"]},
            {"evidence": [{"claim": "", "url": "https://a.com"}]},
            {"evidence": [{"claim": "주장", "url": "ftp://a.com"}]},
            {"topics": ["가" * 31]},
            {"topics": [f"주제{i}" for i in range(11)]},
            {"description": "가" * 501},
        ],
    )
    async def test_bad_values_400(self, client, auth_headers, tenant, patch):
        resp = await client.put(GEO, json=patch, headers=auth_headers)
        assert resp.status_code == 400, resp.text

    async def test_requires_auth(self, client):
        assert (await client.get(GEO)).status_code == 401

    async def test_viewer_reads_only(self, client, tenant):
        viewer = await _user_headers(tenant["id"], "TENANT_VIEWER")
        assert (await client.get(GEO, headers=viewer)).status_code == 200
        assert (await client.put(GEO, json={}, headers=viewer)).status_code == 403
