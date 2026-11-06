"""홈페이지 회원 글쓰기 · 본인 글 수정 · 삭제 (T-150-B, 게시판 모듈 기획서 BM-10)."""

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text

from app.core.security import create_member_access_token
from app.services import board_member_post, site_cache
from app.services import feature as feature_service
from tests.conftest import _TestSession  # type: ignore

BOARDS = "/api/v1/boards"
MEMBER_WRITE = {"permissions": {"read": "PUBLIC", "write": "MEMBER"}}


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
        "UPDATE tenants SET plan_type = 'STANDARD', template_type = 'GENERAL'"
        " WHERE id = :t",
        t=test_tenant["id"],
    )
    yield test_tenant
    await _sql("DELETE FROM audit_logs WHERE tenant_id = :t", t=test_tenant["id"])
    await _sql("DELETE FROM tenant_features WHERE tenant_id = :t", t=test_tenant["id"])
    await feature_service.invalidate_cache(test_tenant["id"])


async def _member(tenant_id: str, name: str = "회원") -> dict:
    member_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO site_members (id, tenant_id, email, name, phone)"
        " VALUES (:id, :t, :e, :n, '010-1111-2222')",
        id=member_id,
        t=tenant_id,
        e=f"{member_id[:8]}@example.com",
        n=name,
    )
    token = create_member_access_token(uuid.UUID(member_id), uuid.UUID(tenant_id))
    return {"id": member_id, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture
async def member(tenant) -> dict:
    return await _member(tenant["id"], "홍길동")


@pytest.fixture
async def board(client, auth_headers, tenant) -> dict:
    resp = await client.post(
        BOARDS, json={"name": "자유게시판", "slug": "free"}, headers=auth_headers
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    data["public"] = f"/api/public/site/{tenant['slug']}/boards/free/posts"
    data["admin_posts"] = f"{BOARDS}/{data['id']}/posts"
    return data


@pytest.fixture
async def open_board(client, auth_headers, board) -> dict:
    resp = await client.patch(
        f"{BOARDS}/{board['id']}", json=MEMBER_WRITE, headers=auth_headers
    )
    assert resp.status_code == 200, resp.text
    return board


async def _write(client, board: dict, headers: dict, **payload):
    body = {"title": "안녕하세요", "content": "첫 줄\n둘째 줄\n\n새 문단", **payload}
    return await client.post(board["public"], json=body, headers=headers)


class TestSettings:
    async def test_turn_on_member_write(self, client, auth_headers, board):
        resp = await client.patch(
            f"{BOARDS}/{board['id']}", json=MEMBER_WRITE, headers=auth_headers
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["permissions"]["write"] == "MEMBER"
        options = await client.get(
            f"{BOARDS}/{board['id']}/permission-options", headers=auth_headers
        )
        assert options.json()["data"] == {
            "member_read_blocked": None,
            "member_write_blocked": None,
        }

    async def test_hospital_blocked(self, client, auth_headers, tenant, board):
        await _sql(
            "UPDATE tenants SET template_type = 'HOSPITAL' WHERE id = :t",
            t=tenant["id"],
        )
        resp = await client.patch(
            f"{BOARDS}/{board['id']}", json=MEMBER_WRITE, headers=auth_headers
        )
        assert resp.status_code == 409
        assert "병원" in resp.json()["error"]["message"]
        options = await client.get(
            f"{BOARDS}/{board['id']}/permission-options", headers=auth_headers
        )
        assert "병원" in options.json()["data"]["member_write_blocked"]
        # 병원도 회원만 읽기는 고를 수 있다
        assert options.json()["data"]["member_read_blocked"] is None

    async def test_required_field_blocks_and_is_blocked(
        self, client, auth_headers, board
    ):
        field = await client.post(
            f"{BOARDS}/{board['id']}/fields",
            json={"label": "연락처", "field_type": "PHONE", "is_required": True},
            headers=auth_headers,
        )
        assert field.status_code == 201
        resp = await client.patch(
            f"{BOARDS}/{board['id']}", json=MEMBER_WRITE, headers=auth_headers
        )
        assert resp.status_code == 409
        assert "필수 칸" in resp.json()["error"]["message"]
        # 필수를 끄면 켤 수 있고, 켠 뒤에는 필수 칸을 만들 수 없다
        field_id = field.json()["data"]["id"]
        await client.patch(
            f"{BOARDS}/{board['id']}/fields/{field_id}",
            json={"is_required": False},
            headers=auth_headers,
        )
        resp = await client.patch(
            f"{BOARDS}/{board['id']}", json=MEMBER_WRITE, headers=auth_headers
        )
        assert resp.status_code == 200
        again = await client.patch(
            f"{BOARDS}/{board['id']}/fields/{field_id}",
            json={"is_required": True},
            headers=auth_headers,
        )
        assert again.status_code == 409
        new = await client.post(
            f"{BOARDS}/{board['id']}/fields",
            json={"label": "메모", "field_type": "TEXT", "is_required": True},
            headers=auth_headers,
        )
        assert new.status_code == 409

    async def test_public_site_marks_board(self, client, tenant, open_board):
        resp = await client.get(f"/api/public/site/{tenant['slug']}")
        found = next(b for b in resp.json()["data"]["boards"] if b["slug"] == "free")
        assert found["write_access"] == "MEMBER"


class TestWrite:
    async def test_member_writes_published_post(
        self, client, auth_headers, open_board, member, purged
    ):
        resp = await _write(client, open_board, member["headers"])
        assert resp.status_code == 201, resp.text
        created = resp.json()["data"]
        assert created["content"] == "첫 줄\n둘째 줄\n\n새 문단"
        detail = await client.get(f"{open_board['public']}/{created['id']}")
        assert detail.status_code == 200
        assert detail.json()["data"]["body"] == [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "첫 줄"},
                    {"type": "hardBreak"},
                    {"type": "text", "text": "둘째 줄"},
                ],
            },
            {"type": "paragraph", "content": [{"type": "text", "text": "새 문단"}]},
        ]
        assert purged
        admin = await client.get(open_board["admin_posts"], headers=auth_headers)
        item = admin.json()["data"]["items"][0]
        assert item["author_member_id"] == member["id"]
        assert item["author_member_name"] == "홍길동"
        assert item["status"] == "PUBLISHED"
        overview = await client.get("/api/v1/posts", headers=auth_headers)
        assert overview.json()["data"]["items"][0]["author_member_name"] == "홍길동"

    async def test_markup_stays_text(self, client, open_board, member):
        resp = await _write(
            client,
            open_board,
            member["headers"],
            content="<script>alert(1)</script> [링크](javascript:x)",
        )
        post_id = resp.json()["data"]["id"]
        body = (await client.get(f"{open_board['public']}/{post_id}")).json()["data"][
            "body"
        ]
        assert body[0]["content"][0] == {
            "type": "text",
            "text": "<script>alert(1)</script> [링크](javascript:x)",
        }

    async def test_category(self, client, auth_headers, open_board, member):
        category = await client.post(
            f"{BOARDS}/{open_board['id']}/categories",
            json={"name": "질문"},
            headers=auth_headers,
        )
        category_id = category.json()["data"]["id"]
        resp = await _write(
            client, open_board, member["headers"], category_id=category_id
        )
        assert resp.json()["data"]["category_id"] == category_id
        bad = await _write(
            client, open_board, member["headers"], category_id=str(uuid.uuid4())
        )
        assert bad.status_code == 400

    @pytest.mark.parametrize(
        "payload",
        [
            {"title": ""},
            {"content": "   "},
            {"content": "가" * 5001},
            {"is_pinned": True},
            {"status": "DRAFT"},
            {"body": []},
        ],
    )
    async def test_invalid_400(self, client, open_board, member, payload):
        resp = await _write(client, open_board, member["headers"], **payload)
        assert resp.status_code == 400, resp.text

    async def test_admin_only_board_403(self, client, board, member):
        assert (await _write(client, board, member["headers"])).status_code == 403

    async def test_no_token_401(self, client, open_board):
        assert (await _write(client, open_board, {})).status_code == 401

    async def test_admin_token_403(self, client, auth_headers, open_board):
        assert (await _write(client, open_board, auth_headers)).status_code == 403

    async def test_other_tenant_member_403(self, client, open_board):
        token = create_member_access_token(uuid.uuid4(), uuid.uuid4())
        headers = {"Authorization": f"Bearer {token}"}
        assert (await _write(client, open_board, headers)).status_code == 403

    async def test_hospital_switch_blocks_writing(
        self, client, tenant, open_board, member
    ):
        await _sql(
            "UPDATE tenants SET template_type = 'HOSPITAL' WHERE id = :t",
            t=tenant["id"],
        )
        resp = await _write(client, open_board, member["headers"])
        assert resp.status_code == 403
        assert "병원" in resp.json()["error"]["message"]

    async def test_rate_limit(self, client, open_board, member, monkeypatch):
        monkeypatch.setattr(board_member_post, "MAX_POSTS_PER_HOUR", 2)
        for _ in range(2):
            assert (
                await _write(client, open_board, member["headers"])
            ).status_code == 201
        resp = await _write(client, open_board, member["headers"])
        assert resp.status_code == 429
        assert resp.json()["error"]["code"] == "RATE_LIMIT_EXCEEDED"

    async def test_member_only_read_board(
        self, client, auth_headers, open_board, member
    ):
        await client.patch(
            f"{BOARDS}/{open_board['id']}",
            json={"permissions": {"read": "MEMBER", "write": "MEMBER"}},
            headers=auth_headers,
        )
        assert (await _write(client, open_board, member["headers"])).status_code == 201


class TestOwnPosts:
    @pytest.fixture
    async def mine(self, client, open_board, member) -> dict:
        resp = await _write(client, open_board, member["headers"])
        return resp.json()["data"]

    async def test_get_update_delete_own(self, client, open_board, member, mine):
        url = f"{open_board['public']}/{mine['id']}"
        got = await client.get(f"{url}/mine", headers=member["headers"])
        assert got.status_code == 200
        assert got.headers["cache-control"] == "private, no-store"
        assert got.json()["data"]["content"] == mine["content"]

        updated = await client.patch(
            url,
            json={"title": "고친 제목", "content": "고친 내용"},
            headers=member["headers"],
        )
        assert updated.status_code == 200
        assert updated.json()["data"]["title"] == "고친 제목"
        public = (await client.get(url)).json()["data"]
        assert public["title"] == "고친 제목"

        deleted = await client.delete(url, headers=member["headers"])
        assert deleted.status_code == 200
        assert (await client.get(url)).status_code == 404
        assert (
            await client.get(f"{url}/mine", headers=member["headers"])
        ).status_code == 404

    async def test_others_post_404(self, client, tenant, open_board, mine):
        other = await _member(tenant["id"], "남")
        url = f"{open_board['public']}/{mine['id']}"
        assert (
            await client.get(f"{url}/mine", headers=other["headers"])
        ).status_code == 404
        resp = await client.patch(url, json={"title": "x"}, headers=other["headers"])
        assert resp.status_code == 404
        assert (await client.delete(url, headers=other["headers"])).status_code == 404

    async def test_admin_post_404(self, client, auth_headers, open_board, member):
        created = await client.post(
            open_board["admin_posts"],
            json={"title": "관리자 글", "status": "PUBLISHED"},
            headers=auth_headers,
        )
        url = f"{open_board['public']}/{created.json()['data']['id']}"
        resp = await client.patch(url, json={"title": "x"}, headers=member["headers"])
        assert resp.status_code == 404
        assert (await client.delete(url, headers=member["headers"])).status_code == 404

    async def test_writing_off_edit_403_delete_ok(
        self, client, auth_headers, open_board, member, mine
    ):
        await client.patch(
            f"{BOARDS}/{open_board['id']}",
            json={"permissions": {"read": "PUBLIC", "write": "ADMIN"}},
            headers=auth_headers,
        )
        url = f"{open_board['public']}/{mine['id']}"
        resp = await client.patch(url, json={"title": "x"}, headers=member["headers"])
        assert resp.status_code == 403
        assert (await client.delete(url, headers=member["headers"])).status_code == 200

    async def test_admin_can_hide_member_post(
        self, client, auth_headers, open_board, mine
    ):
        resp = await client.patch(
            f"{open_board['admin_posts']}/{mine['id']}",
            json={"status": "PRIVATE"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert (
            await client.get(f"{open_board['public']}/{mine['id']}")
        ).status_code == 404

    async def test_deleted_member_keeps_post(self, client, open_board, member, mine):
        await _sql("DELETE FROM site_members WHERE id = :i", i=member["id"])
        resp = await client.get(f"{open_board['public']}/{mine['id']}")
        assert resp.status_code == 200
