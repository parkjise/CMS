"""게시판 생성 · 설정 · 휴지통 (T-140-A, 게시판 모듈 기획서 4장)."""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from app.core.security import create_access_token
from app.services import feature as feature_service
from app.services import site_cache
from tests.conftest import _TestSession  # type: ignore

BOARDS = "/api/v1/boards"


async def _sql(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        rows = result.fetchall() if result.returns_rows else None
        await s.commit()
    return rows


async def _set_plan(tenant_id: str, plan: str) -> None:
    await _sql("UPDATE tenants SET plan_type = :p WHERE id = :t", p=plan, t=tenant_id)


@pytest.fixture(autouse=True)
def purged(monkeypatch) -> list[str]:
    calls: list[str] = []

    async def fake_purge(_db, tenant_id):
        calls.append(str(tenant_id))
        return True

    monkeypatch.setattr(site_cache, "purge_site", fake_purge)
    return calls


@pytest.fixture
async def standard(test_tenant, test_user) -> AsyncIterator[dict]:
    await feature_service.invalidate_cache(test_tenant["id"])
    await _set_plan(test_tenant["id"], "STANDARD")
    yield test_tenant
    await _sql("DELETE FROM tenant_features WHERE tenant_id = :t", t=test_tenant["id"])
    await feature_service.invalidate_cache(test_tenant["id"])


async def _create(client, headers, **fields) -> dict:
    resp = await client.post(
        BOARDS, json={"name": "병원 소식", **fields}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _add_notice_section(tenant_id: str) -> str:
    section_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO sections (id, tenant_id, section_type, label, display_order,"
        " page_key, is_active, created_at, updated_at)"
        " VALUES (:id, :t, 'BOARD', '공지', 0, 'notice', true, now(), now())",
        id=section_id,
        t=tenant_id,
    )
    await _sql(
        "INSERT INTO section_settings (id, tenant_id, section_id, field_key,"
        " field_value, value_type, is_sample, created_at, updated_at)"
        " VALUES (gen_random_uuid(), :t, :s, 'items', :v, 'JSON', true, now(), now())",
        t=tenant_id,
        s=section_id,
        v='[{"id": "n1", "subject": "샘플", "date": "2026-01-01"}]',
    )
    return section_id


@pytest.fixture
async def notice_board(standard, client, auth_headers) -> dict:
    section_id = await _add_notice_section(standard["id"])
    board = (await client.get(BOARDS, headers=auth_headers)).json()["data"][0]
    return {**board, "section_id": section_id}


class TestCreate:
    async def test_auto_slug_and_defaults(self, client, auth_headers, standard, purged):
        board = await _create(client, auth_headers, description="소식 모음")
        assert board["slug"] == "board-1"
        assert board["board_type"] == "LIST"
        assert board["status"] == "ACTIVE"
        assert board["description"] == "소식 모음"
        assert board["system_key"] is None
        assert board["post_count"] == 0
        assert standard["id"] in purged

    async def test_setting_timestamp_in_create_list_update_and_restore(
        self, client, auth_headers, standard
    ):
        board = await _create(client, auth_headers)
        assert datetime.fromisoformat(board["updated_at"]).tzinfo is not None
        past = datetime(2020, 1, 2, 3, 4, 5, tzinfo=UTC)
        await _sql(
            "UPDATE boards SET updated_at = :stamp WHERE id = :id",
            stamp=past,
            id=board["id"],
        )
        listed = (await client.get(BOARDS, headers=auth_headers)).json()["data"]
        assert (
            datetime.fromisoformat(
                next(b for b in listed if b["id"] == board["id"])["updated_at"]
            )
            == past
        )
        response = await client.patch(
            f"{BOARDS}/{board['id']}", json={"name": "이름 수정"}, headers=auth_headers
        )
        assert response.status_code == 200, response.text
        updated = datetime.fromisoformat(response.json()["data"]["updated_at"])
        assert updated > past
        rows = await _sql(
            "SELECT updated_at FROM boards WHERE id = :id", id=board["id"]
        )
        assert rows[0][0] == updated
        await client.delete(f"{BOARDS}/{board['id']}", headers=auth_headers)
        trash = (
            await client.get(BOARDS, params={"trash": True}, headers=auth_headers)
        ).json()["data"]
        removed = datetime.fromisoformat(
            next(b for b in trash if b["id"] == board["id"])["updated_at"]
        )
        assert removed >= updated
        restored = await client.post(
            f"{BOARDS}/{board['id']}/restore", headers=auth_headers
        )
        assert restored.status_code == 200, restored.text
        assert (
            datetime.fromisoformat(restored.json()["data"]["board"]["updated_at"])
            >= removed
        )

    async def test_auto_slug_skips_used_and_trashed(
        self, client, auth_headers, standard
    ):
        first = await _create(client, auth_headers)
        await client.delete(f"{BOARDS}/{first['id']}", headers=auth_headers)
        # 휴지통의 board-1 을 다시 쓰면 복원할 때 주소가 바뀐다
        second = await _create(client, auth_headers)
        assert second["slug"] == "board-2"

    async def test_custom_slug_and_type(self, client, auth_headers, standard):
        board = await _create(
            client, auth_headers, slug="news-2027", board_type="GALLERY"
        )
        assert board["slug"] == "news-2027"
        assert board["board_type"] == "GALLERY"

    async def test_duplicate_slug_409(self, client, auth_headers, standard):
        await _create(client, auth_headers, slug="news")
        resp = await client.post(
            BOARDS, json={"name": "또", "slug": "news"}, headers=auth_headers
        )
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "CONFLICT"

    @pytest.mark.parametrize("slug", ["notice", "new", "trash"])
    async def test_reserved_slug_409(self, client, auth_headers, standard, slug):
        resp = await client.post(
            BOARDS, json={"name": "또", "slug": slug}, headers=auth_headers
        )
        assert resp.status_code == 409

    @pytest.mark.parametrize(
        "payload",
        [
            {"name": "   "},
            {"name": "가" * 101},
            {"name": "이름", "slug": "한글주소"},
            {"name": "이름", "slug": "Upper"},
            {"name": "이름", "slug": "a"},
            {"name": "이름", "slug": "-start"},
            {"name": "이름", "slug": "a--b"},
            {"name": "이름", "board_type": "QNA"},
            {"name": "이름", "status": "HIDDEN"},
            {"name": "이름", "description": "가" * 201},
        ],
    )
    async def test_invalid_payload(self, client, auth_headers, standard, payload):
        resp = await client.post(BOARDS, json=payload, headers=auth_headers)
        assert resp.status_code == 400, resp.text

    async def test_requires_login(self, client):
        assert (await client.post(BOARDS, json={"name": "x"})).status_code == 401


class TestLimits:
    @pytest.mark.parametrize("plan", ["FREE", "BASIC"])
    async def test_low_plans_blocked(self, client, auth_headers, standard, plan):
        await _set_plan(standard["id"], plan)
        limits = (await client.get(f"{BOARDS}/limits", headers=auth_headers)).json()
        assert limits["data"]["can_create"] is False
        assert "STANDARD" in limits["data"]["reason"]
        resp = await client.post(BOARDS, json={"name": "x"}, headers=auth_headers)
        assert resp.status_code == 422
        assert resp.json()["error"]["code"] == "PLAN_LIMIT_EXCEEDED"

    async def test_standard_five(self, client, auth_headers, standard):
        for _ in range(5):
            await _create(client, auth_headers)
        resp = await client.post(BOARDS, json={"name": "x"}, headers=auth_headers)
        assert resp.status_code == 422
        assert "5개" in resp.json()["error"]["message"]
        limits = (await client.get(f"{BOARDS}/limits", headers=auth_headers)).json()
        assert limits["data"]["used"] == 5

    async def test_premium_unlimited(self, client, auth_headers, standard):
        await _set_plan(standard["id"], "PREMIUM")
        for _ in range(6):
            await _create(client, auth_headers)
        limits = (await client.get(f"{BOARDS}/limits", headers=auth_headers)).json()
        assert limits["data"]["limit"] is None
        assert limits["data"]["can_create"] is True

    async def test_system_and_trash_not_counted(
        self, client, auth_headers, notice_board
    ):
        board = await _create(client, auth_headers)
        limits = (await client.get(f"{BOARDS}/limits", headers=auth_headers)).json()
        assert limits["data"]["used"] == 1
        await client.delete(f"{BOARDS}/{board['id']}", headers=auth_headers)
        limits = (await client.get(f"{BOARDS}/limits", headers=auth_headers)).json()
        assert limits["data"]["used"] == 0

    async def test_downgrade_keeps_boards_and_posts(
        self, client, auth_headers, standard
    ):
        board = await _create(client, auth_headers)
        await _set_plan(standard["id"], "BASIC")
        boards = (await client.get(BOARDS, headers=auth_headers)).json()["data"]
        assert [b["id"] for b in boards] == [board["id"]]
        post = await client.post(
            f"{BOARDS}/{board['id']}/posts",
            json={"title": "글", "status": "PUBLISHED"},
            headers=auth_headers,
        )
        assert post.status_code == 201
        renamed = await client.patch(
            f"{BOARDS}/{board['id']}", json={"name": "새 이름"}, headers=auth_headers
        )
        assert renamed.status_code == 200
        copy = await client.post(
            f"{BOARDS}/{board['id']}/duplicate", headers=auth_headers
        )
        assert copy.status_code == 422


class TestUpdate:
    async def test_change_fields(self, client, auth_headers, standard):
        board = await _create(client, auth_headers)
        resp = await client.patch(
            f"{BOARDS}/{board['id']}",
            json={
                "name": "새 이름",
                "slug": "fresh",
                "description": "설명",
                "board_type": "FAQ",
                "status": "INACTIVE",
            },
            headers=auth_headers,
        )
        data = resp.json()["data"]
        assert resp.status_code == 200
        assert (data["name"], data["slug"], data["description"]) == (
            "새 이름",
            "fresh",
            "설명",
        )
        assert (data["board_type"], data["status"]) == ("FAQ", "INACTIVE")

    async def test_description_kept_when_other_field_changes(
        self, client, auth_headers, standard
    ):
        board = await _create(client, auth_headers, description="유지")
        resp = await client.patch(
            f"{BOARDS}/{board['id']}", json={"name": "다른"}, headers=auth_headers
        )
        assert resp.json()["data"]["description"] == "유지"

    async def test_type_change_allowed_with_posts(self, client, auth_headers, standard):
        board = await _create(client, auth_headers)
        await client.post(
            f"{BOARDS}/{board['id']}/posts", json={"title": "글"}, headers=auth_headers
        )
        resp = await client.patch(
            f"{BOARDS}/{board['id']}",
            json={"board_type": "GALLERY"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["post_count"] == 1

    async def test_slug_conflict_and_same_slug(self, client, auth_headers, standard):
        one = await _create(client, auth_headers, slug="one")
        await _create(client, auth_headers, slug="two")
        conflict = await client.patch(
            f"{BOARDS}/{one['id']}", json={"slug": "two"}, headers=auth_headers
        )
        assert conflict.status_code == 409
        same = await client.patch(
            f"{BOARDS}/{one['id']}", json={"slug": "one"}, headers=auth_headers
        )
        assert same.status_code == 200

    async def test_inactive_hides_from_public(self, client, auth_headers, standard):
        board = await _create(client, auth_headers, slug="news")
        url = f"/api/public/site/{standard['slug']}/boards/news/posts"
        assert (await client.get(url)).status_code == 200
        await client.patch(
            f"{BOARDS}/{board['id']}", json={"status": "INACTIVE"}, headers=auth_headers
        )
        assert (await client.get(url)).status_code == 404


class TestSystemBoard:
    async def test_cannot_delete(self, client, auth_headers, notice_board):
        resp = await client.delete(
            f"{BOARDS}/{notice_board['id']}", headers=auth_headers
        )
        assert resp.status_code == 409

    @pytest.mark.parametrize("payload", [{"slug": "other"}, {"board_type": "GALLERY"}])
    async def test_slug_and_type_locked(
        self, client, auth_headers, notice_board, payload
    ):
        resp = await client.patch(
            f"{BOARDS}/{notice_board['id']}", json=payload, headers=auth_headers
        )
        assert resp.status_code == 409

    async def test_same_values_and_name_allowed(
        self, client, auth_headers, notice_board
    ):
        """설정 화면은 칸 전체를 보낸다 — 값이 같으면 막지 않는다."""
        resp = await client.patch(
            f"{BOARDS}/{notice_board['id']}",
            json={"name": "병원 공지", "slug": "notice", "board_type": "LIST"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["name"] == "병원 공지"

    async def test_inactive_clears_samples(self, client, auth_headers, notice_board):
        resp = await client.patch(
            f"{BOARDS}/{notice_board['id']}",
            json={"status": "INACTIVE"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        rows = await _sql(
            "SELECT field_value, is_sample FROM section_settings"
            " WHERE section_id = :s AND field_key = 'items'",
            s=notice_board["section_id"],
        )
        assert tuple(rows[0]) == ("[]", False)


class TestSamplesOnlyForNotice:
    async def test_other_board_post_keeps_notice_samples(
        self, client, auth_headers, notice_board
    ):
        board = await _create(client, auth_headers)
        resp = await client.post(
            f"{BOARDS}/{board['id']}/posts",
            json={"title": "글", "status": "PUBLISHED"},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        rows = await _sql(
            "SELECT field_value, is_sample FROM section_settings"
            " WHERE section_id = :s AND field_key = 'items'",
            s=notice_board["section_id"],
        )
        assert "샘플" in rows[0][0] and rows[0][1] is True
        boards = (await client.get(BOARDS, headers=auth_headers)).json()["data"]
        notice = next(b for b in boards if b["system_key"] == "notice")
        assert notice["has_samples"] is True


class TestDuplicate:
    async def test_copies_settings_not_posts(self, client, auth_headers, standard):
        board = await _create(
            client, auth_headers, description="설명", board_type="FAQ"
        )
        await client.post(
            f"{BOARDS}/{board['id']}/posts", json={"title": "글"}, headers=auth_headers
        )
        resp = await client.post(
            f"{BOARDS}/{board['id']}/duplicate", headers=auth_headers
        )
        assert resp.status_code == 201
        copy = resp.json()["data"]
        assert copy["id"] != board["id"]
        assert copy["name"] == "병원 소식 복사본"
        assert copy["slug"] == "board-2"
        assert (copy["board_type"], copy["description"]) == ("FAQ", "설명")
        assert copy["post_count"] == 0

    async def test_system_copy_is_normal_board(
        self, client, auth_headers, notice_board
    ):
        resp = await client.post(
            f"{BOARDS}/{notice_board['id']}/duplicate", headers=auth_headers
        )
        assert resp.status_code == 201
        assert resp.json()["data"]["system_key"] is None

    async def test_long_name_fits(self, client, auth_headers, standard):
        board = await _create(client, auth_headers, name="가" * 100)
        resp = await client.post(
            f"{BOARDS}/{board['id']}/duplicate", headers=auth_headers
        )
        assert resp.status_code == 201
        assert len(resp.json()["data"]["name"]) == 100


class TestTrash:
    async def test_delete_and_restore(self, client, auth_headers, standard):
        board = await _create(client, auth_headers, slug="news")
        await client.post(
            f"{BOARDS}/{board['id']}/posts",
            json={"title": "글", "status": "PUBLISHED"},
            headers=auth_headers,
        )
        url = f"/api/public/site/{standard['slug']}/boards/news/posts"
        assert (
            await client.delete(f"{BOARDS}/{board['id']}", headers=auth_headers)
        ).status_code == 200

        assert (await client.get(BOARDS, headers=auth_headers)).json()["data"] == []
        trash = await client.get(f"{BOARDS}?trash=true", headers=auth_headers)
        assert [b["id"] for b in trash.json()["data"]] == [board["id"]]
        assert trash.json()["data"][0]["deleted_at"] is not None
        assert (await client.get(url)).status_code == 404
        assert (
            await client.get(f"{BOARDS}/{board['id']}/posts", headers=auth_headers)
        ).status_code == 404

        resp = await client.post(
            f"{BOARDS}/{board['id']}/restore", headers=auth_headers
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["slug_changed"] is False
        assert resp.json()["data"]["board"]["post_count"] == 1
        assert (await client.get(url)).json()["data"]["total"] == 1

    async def test_restore_with_taken_slug_adds_number(
        self, client, auth_headers, standard
    ):
        old = await _create(client, auth_headers, slug="news")
        await client.delete(f"{BOARDS}/{old['id']}", headers=auth_headers)
        await _create(client, auth_headers, slug="news")
        await _create(client, auth_headers, slug="news-2")

        resp = await client.post(f"{BOARDS}/{old['id']}/restore", headers=auth_headers)
        data = resp.json()["data"]
        assert data["slug_changed"] is True
        assert data["board"]["slug"] == "news-3"

    async def test_restore_checks_limit(self, client, auth_headers, standard):
        old = await _create(client, auth_headers)
        await client.delete(f"{BOARDS}/{old['id']}", headers=auth_headers)
        await _set_plan(standard["id"], "BASIC")
        resp = await client.post(f"{BOARDS}/{old['id']}/restore", headers=auth_headers)
        assert resp.status_code == 422
        assert resp.json()["error"]["code"] == "PLAN_LIMIT_EXCEEDED"

    async def test_restore_active_board_404(self, client, auth_headers, standard):
        board = await _create(client, auth_headers)
        resp = await client.post(
            f"{BOARDS}/{board['id']}/restore", headers=auth_headers
        )
        assert resp.status_code == 404


@pytest.fixture
async def other_headers() -> AsyncIterator[dict]:
    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    slug = f"other-{uuid.uuid4().hex[:8]}"
    await _sql(
        "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
        " updated_at) VALUES (:id, :n, :s, 'PREMIUM', true, now(), now())",
        id=tenant_id,
        n=slug,
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
    await _sql("DELETE FROM users WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM tenants WHERE id = :t", t=tenant_id)


class TestAccess:
    async def test_other_tenant_404(
        self, client, auth_headers, standard, other_headers
    ):
        board = await _create(client, auth_headers, slug="news")
        url = f"{BOARDS}/{board['id']}"
        assert (await client.get(url, headers=other_headers)).status_code == 404
        assert (
            await client.patch(url, json={"name": "x"}, headers=other_headers)
        ).status_code == 404
        assert (await client.delete(url, headers=other_headers)).status_code == 404
        assert (
            await client.post(f"{url}/duplicate", headers=other_headers)
        ).status_code == 404
        await client.delete(url, headers=auth_headers)
        assert (
            await client.post(f"{url}/restore", headers=other_headers)
        ).status_code == 404

    async def test_same_slug_in_other_tenant_ok(
        self, client, auth_headers, standard, other_headers
    ):
        await _create(client, auth_headers, slug="news")
        await _create(client, other_headers, slug="news")

    async def test_viewer_cannot_write(self, client, standard, test_user, auth_headers):
        board = await _create(client, auth_headers)
        await _sql(
            "UPDATE users SET role = 'TENANT_VIEWER' WHERE id = :u", u=test_user["id"]
        )
        token = create_access_token(
            user_id=uuid.UUID(test_user["id"]),
            tenant_id=uuid.UUID(test_user["tenant_id"]),
            role="TENANT_VIEWER",
        )
        headers = {"Authorization": f"Bearer {token}"}
        assert (await client.get(BOARDS, headers=headers)).status_code == 200
        assert (
            await client.post(BOARDS, json={"name": "x"}, headers=headers)
        ).status_code == 403
        url = f"{BOARDS}/{board['id']}"
        assert (await client.delete(url, headers=headers)).status_code == 403

    async def test_feature_off_403(self, client, auth_headers, standard):
        await _sql(
            "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled)"
            " SELECT gen_random_uuid(), :t, id, false FROM features"
            " WHERE key = 'BOARD_MANAGER'",
            t=standard["id"],
        )
        await feature_service.invalidate_cache(standard["id"])
        resp = await client.post(BOARDS, json={"name": "x"}, headers=auth_headers)
        assert resp.status_code == 403
