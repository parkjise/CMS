"""게시판 · 게시글 (T-139, 게시판 모듈 기획서 AC-09 · AC-15 ~ AC-20)."""

import uuid
from collections.abc import AsyncIterator

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


async def _add_section(tenant_id: str, section_type: str, page_key: str) -> str:
    section_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO sections (id, tenant_id, section_type, label, display_order,"
        " page_key, is_active, created_at, updated_at)"
        " VALUES (:id, :t, :st, :st, 0, :p, true, now(), now())",
        id=section_id,
        t=tenant_id,
        st=section_type,
        p=page_key,
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


async def _items_of(section_id: str) -> tuple[str, bool]:
    rows = await _sql(
        "SELECT field_value, is_sample FROM section_settings"
        " WHERE section_id = :s AND field_key = 'items'",
        s=section_id,
    )
    return rows[0][0], rows[0][1]


@pytest.fixture(autouse=True)
def purged(monkeypatch) -> list[str]:
    """캐시 비우기 호출을 센다 — 실제 홈페이지 호출 없이."""
    calls: list[str] = []

    async def fake_purge(_db, tenant_id):
        calls.append(str(tenant_id))
        return True

    monkeypatch.setattr(site_cache, "purge_site", fake_purge)
    return calls


@pytest.fixture
async def notice(test_tenant, test_user, client, auth_headers) -> AsyncIterator[dict]:
    """공지 페이지 · 메인 최신 공지 샘플이 있는 사업체와 그 공지 게시판."""
    await feature_service.invalidate_cache(test_tenant["id"])
    board_section = await _add_section(test_tenant["id"], "BOARD", "notice")
    latest_section = await _add_section(test_tenant["id"], "NOTICE_LATEST", "home")
    resp = await client.get(BOARDS, headers=auth_headers)
    assert resp.status_code == 200
    board = resp.json()["data"][0]
    yield {
        "id": board["id"],
        "slug": test_tenant["slug"],
        "tenant_id": test_tenant["id"],
        "board_section": board_section,
        "latest_section": latest_section,
        "posts": f"{BOARDS}/{board['id']}/posts",
        "public": f"/api/public/site/{test_tenant['slug']}/boards/notice/posts",
    }
    await _sql("DELETE FROM tenant_features WHERE tenant_id = :t", t=test_tenant["id"])
    await feature_service.invalidate_cache(test_tenant["id"])


async def _write(client, headers, notice, **fields) -> dict:
    payload = {"title": "진료 안내", "status": "PUBLISHED", **fields}
    resp = await client.post(notice["posts"], json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


class TestBoardList:
    async def test_notice_board_created_once(self, client, auth_headers, notice):
        first = (await client.get(BOARDS, headers=auth_headers)).json()["data"]
        second = (await client.get(BOARDS, headers=auth_headers)).json()["data"]
        assert [b["id"] for b in second] == [b["id"] for b in first]
        assert first[0]["system_key"] == "notice"
        assert first[0]["has_samples"] is True
        assert first[0]["post_count"] == 0

    async def test_no_notice_page_means_no_board(
        self, client, auth_headers, test_tenant
    ):
        """테마형처럼 공지 페이지가 없으면 게시판을 만들지 않는다."""
        await feature_service.invalidate_cache(test_tenant["id"])
        resp = await client.get(BOARDS, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["data"] == []

    async def test_requires_login(self, client):
        assert (await client.get(BOARDS)).status_code == 401


class TestPostWrite:
    async def test_publish_stamps_date_and_purges(
        self, client, auth_headers, notice, purged
    ):
        post = await _write(
            client,
            auth_headers,
            notice,
            body=[
                {"type": "p", "text": "첫 줄\n**굵게**"},
                {"type": "ul", "items": ["가", "나"]},
                {"type": "image", "src": "/x.webp", "alt": "사진"},
            ],
        )
        assert post["published_at"] is not None
        assert post["body"][1]["items"] == ["가", "나"]
        assert notice["tenant_id"] in purged

    async def test_draft_has_no_public_date(self, client, auth_headers, notice):
        post = await _write(client, auth_headers, notice, status="DRAFT")
        assert post["published_at"] is None

    async def test_republish_keeps_first_date(self, client, auth_headers, notice):
        post = await _write(client, auth_headers, notice)
        url = f"{notice['posts']}/{post['id']}"
        await client.patch(url, json={"status": "PRIVATE"}, headers=auth_headers)
        resp = await client.patch(
            url, json={"status": "PUBLISHED"}, headers=auth_headers
        )
        assert resp.json()["data"]["published_at"] == post["published_at"]

    @pytest.mark.parametrize(
        "payload",
        [
            {"title": "   "},
            {"title": "가" * 201},
            {"title": "제목", "status": "SECRET"},
            {"title": "제목", "body": [{"type": "script", "text": "x"}]},
            {"title": "제목", "body": [{"type": "p", "text": "x", "html": "<b>"}]},
            {"title": "제목", "body": [{"type": "ul", "items": []}]},
            {"title": "제목", "body": [{"type": "p", "text": "x" * 5001}]},
            {"title": "제목", "body": [{"type": "p", "text": "x"}] * 501},
            {
                "title": "제목",
                "body": [{"type": "image", "src": "javascript:alert(1)", "alt": ""}],
            },
            {
                "title": "제목",
                "body": [{"type": "image", "src": "//evil.example/x.png", "alt": ""}],
            },
            {
                "title": "제목",
                "body": [{"type": "image", "src": "data:image/png;base64,AA"}],
            },
        ],
    )
    async def test_invalid_payload_rejected(
        self, client, auth_headers, notice, payload
    ):
        resp = await client.post(notice["posts"], json=payload, headers=auth_headers)
        assert resp.status_code == 400, resp.text
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    async def test_missing_board_404(self, client, auth_headers, notice):
        resp = await client.post(
            f"{BOARDS}/{uuid.uuid4()}/posts",
            json={"title": "제목"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_delete_and_restore(self, client, auth_headers, notice):
        post = await _write(client, auth_headers, notice)
        url = f"{notice['posts']}/{post['id']}"
        assert (await client.delete(url, headers=auth_headers)).status_code == 200

        listing = (await client.get(notice["posts"], headers=auth_headers)).json()
        assert listing["data"]["total"] == 0
        trash = await client.get(f"{notice['posts']}?trash=true", headers=auth_headers)
        assert trash.json()["data"]["total"] == 1
        # 지운 글은 복원 전에 고칠 수 없다
        blocked = await client.patch(url, json={"title": "x"}, headers=auth_headers)
        assert blocked.status_code == 404

        resp = await client.post(f"{url}/restore", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["data"]["deleted_at"] is None

    async def test_admin_filters(self, client, auth_headers, notice):
        await _write(client, auth_headers, notice, title="100% 할인", status="DRAFT")
        await _write(client, auth_headers, notice, title="운영 안내")
        by_status = await client.get(
            f"{notice['posts']}?status=DRAFT", headers=auth_headers
        )
        assert [p["title"] for p in by_status.json()["data"]["items"]] == ["100% 할인"]
        # % 는 글자 그대로 찾는다
        escaped = await client.get(
            notice["posts"], params={"q": "%"}, headers=auth_headers
        )
        assert escaped.json()["data"]["total"] == 1


class TestSamples:
    async def test_draft_keeps_samples(self, client, auth_headers, notice):
        await _write(client, auth_headers, notice, status="DRAFT")
        value, is_sample = await _items_of(notice["board_section"])
        assert "샘플" in value and is_sample is True

    async def test_first_publish_clears_samples_for_good(
        self, client, auth_headers, notice
    ):
        post = await _write(client, auth_headers, notice)
        for section in (notice["board_section"], notice["latest_section"]):
            assert await _items_of(section) == ("[]", False)

        board = (await client.get(BOARDS, headers=auth_headers)).json()["data"][0]
        assert board["has_samples"] is False

        await client.delete(f"{notice['posts']}/{post['id']}", headers=auth_headers)
        assert await _items_of(notice["board_section"]) == ("[]", False)

    async def test_clear_samples_button(self, client, auth_headers, notice, purged):
        resp = await client.post(f"{BOARDS}/clear-samples", headers=auth_headers)
        assert resp.status_code == 200
        assert await _items_of(notice["latest_section"]) == ("[]", False)
        assert notice["tenant_id"] in purged

    async def test_section_without_items_row_gets_empty_list(
        self, client, auth_headers, notice
    ):
        """칸이 없으면 화면이 템플릿 샘플로 채우므로 빈 목록을 넣어 둔다."""
        await _sql(
            "DELETE FROM section_settings WHERE section_id = :s",
            s=notice["latest_section"],
        )
        await _write(client, auth_headers, notice)
        assert await _items_of(notice["latest_section"]) == ("[]", False)


class TestPublic:
    async def test_only_published_posts(self, client, auth_headers, notice):
        public = await _write(client, auth_headers, notice, title="공개")
        draft = await _write(client, auth_headers, notice, title="임시", status="DRAFT")
        private = await _write(
            client, auth_headers, notice, title="비공개", status="PRIVATE"
        )
        removed = await _write(client, auth_headers, notice, title="삭제")
        await client.delete(f"{notice['posts']}/{removed['id']}", headers=auth_headers)

        data = (await client.get(notice["public"])).json()["data"]
        assert [p["title"] for p in data["items"]] == ["공개"]
        assert data["has_posts"] is True
        assert data["items"][0]["body"] is None

        shown = await client.get(f"{notice['public']}/{public['id']}")
        assert shown.status_code == 200
        for hidden in (draft, private, removed):
            resp = await client.get(f"{notice['public']}/{hidden['id']}")
            assert resp.status_code == 404

    async def test_no_posts_tells_screen_to_use_samples(self, client, notice):
        data = (await client.get(notice["public"])).json()["data"]
        assert data["has_posts"] is False
        assert data["items"] == []

    async def test_pinned_first_but_latest_ignores_pin(
        self, client, auth_headers, notice
    ):
        await _write(client, auth_headers, notice, title="고정", is_pinned=True)
        await _write(client, auth_headers, notice, title="새 글")

        listing = (await client.get(notice["public"])).json()["data"]["items"]
        assert [p["title"] for p in listing] == ["고정", "새 글"]
        latest = await client.get(notice["public"], params={"order": "latest"})
        assert [p["title"] for p in latest.json()["data"]["items"]] == ["새 글", "고정"]

    async def test_search_and_paging(self, client, auth_headers, notice):
        for i in range(3):
            await _write(client, auth_headers, notice, title=f"운영 안내 {i}")
        await _write(client, auth_headers, notice, title="휴진")

        found = await client.get(notice["public"], params={"q": "운영"})
        assert found.json()["data"]["total"] == 3
        page = await client.get(notice["public"], params={"size": 2, "p": 1, "page": 2})
        assert len(page.json()["data"]["items"]) == 2
        # 검색 결과가 없어도 공개 글은 있다 — 샘플로 돌아가면 안 된다
        none = await client.get(notice["public"], params={"q": "없는말"})
        assert none.json()["data"]["total"] == 0
        assert none.json()["data"]["has_posts"] is True

    async def test_detail_neighbors(self, client, auth_headers, notice):
        old = await _write(client, auth_headers, notice, title="오래된 글")
        mid = await _write(client, auth_headers, notice, title="가운데")
        new = await _write(client, auth_headers, notice, title="새 글")
        data = (await client.get(f"{notice['public']}/{mid['id']}")).json()["data"]
        assert data["prev_id"] == old["id"]
        assert data["next_id"] == new["id"]

    async def test_unknown_tenant_or_board_404(self, client, notice):
        assert (
            await client.get("/api/public/site/없는곳/boards/notice/posts")
        ).status_code == 404
        assert (
            await client.get(f"/api/public/site/{notice['slug']}/boards/없음/posts")
        ).status_code == 404

    async def test_inactive_tenant_404(self, client, notice):
        await _sql(
            "UPDATE tenants SET is_active = false WHERE id = :t", t=notice["tenant_id"]
        )
        assert (await client.get(notice["public"])).status_code == 404

    async def test_public_stays_when_feature_off(self, client, auth_headers, notice):
        await _write(client, auth_headers, notice)
        await _set_flag(notice["tenant_id"], False)
        assert (await client.get(notice["public"])).status_code == 200


async def _set_flag(tenant_id: str, on: bool) -> None:
    await _sql(
        "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled)"
        " SELECT gen_random_uuid(), :t, id, :on FROM features"
        " WHERE key = 'BOARD_MANAGER'"
        " ON CONFLICT ON CONSTRAINT uq_tenant_features_pair"
        " DO UPDATE SET is_enabled = :on",
        t=tenant_id,
        on=on,
    )
    await feature_service.invalidate_cache(tenant_id)


@pytest.fixture
async def other_tenant() -> AsyncIterator[dict]:
    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    slug = f"other-{uuid.uuid4().hex[:8]}"
    await _sql(
        "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
        " updated_at) VALUES (:id, :n, :s, 'FREE', true, now(), now())",
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
    yield {
        "id": tenant_id,
        "slug": slug,
        "headers": {"Authorization": f"Bearer {token}"},
    }
    await _sql("DELETE FROM users WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM tenants WHERE id = :t", t=tenant_id)


class TestAccess:
    async def test_other_tenant_cannot_touch_posts(
        self, client, auth_headers, notice, other_tenant
    ):
        post = await _write(client, auth_headers, notice)
        url = f"{notice['posts']}/{post['id']}"
        headers = other_tenant["headers"]
        assert (await client.get(notice["posts"], headers=headers)).status_code == 404
        assert (await client.get(url, headers=headers)).status_code == 404
        assert (
            await client.patch(url, json={"title": "해킹"}, headers=headers)
        ).status_code == 404
        assert (await client.delete(url, headers=headers)).status_code == 404
        assert (
            await client.post(notice["posts"], json={"title": "x"}, headers=headers)
        ).status_code == 404

    async def test_other_tenant_slug_does_not_see_post(
        self, client, auth_headers, notice, other_tenant
    ):
        post = await _write(client, auth_headers, notice)
        other = f"/api/public/site/{other_tenant['slug']}/boards/notice/posts"
        assert (await client.get(f"{other}/{post['id']}")).status_code == 404

    async def test_viewer_reads_but_cannot_write(self, client, notice, test_user):
        token = create_access_token(
            user_id=uuid.UUID(test_user["id"]),
            tenant_id=uuid.UUID(test_user["tenant_id"]),
            role="TENANT_VIEWER",
        )
        await _sql(
            "UPDATE users SET role = 'TENANT_VIEWER' WHERE id = :u", u=test_user["id"]
        )
        headers = {"Authorization": f"Bearer {token}"}
        assert (await client.get(notice["posts"], headers=headers)).status_code == 200
        resp = await client.post(notice["posts"], json={"title": "x"}, headers=headers)
        assert resp.status_code == 403

    async def test_feature_off_blocks_admin_api(self, client, auth_headers, notice):
        await _set_flag(notice["tenant_id"], False)
        assert (await client.get(BOARDS, headers=auth_headers)).status_code == 403
        resp = await client.post(
            notice["posts"], json={"title": "x"}, headers=auth_headers
        )
        assert resp.status_code == 403

    async def test_composite_fk_blocks_cross_tenant_post(self, notice, other_tenant):
        """코드를 거치지 않아도 다른 사업체 게시판에 글이 붙지 못한다."""
        with pytest.raises(Exception, match="fk_board_posts_board_tenant"):
            await _sql(
                "INSERT INTO board_posts (tenant_id, board_id, title)"
                " VALUES (:t, :b, 'x')",
                t=other_tenant["id"],
                b=notice["id"],
            )


class TestUpload:
    async def test_board_context_needs_no_section(
        self, client, auth_headers, notice, monkeypatch
    ):
        from app.services import image as image_service
        from tests.test_upload import _FakeS3Client, _make_jpeg  # type: ignore

        s3 = _FakeS3Client({})
        monkeypatch.setattr(image_service, "_get_s3_client", lambda: s3)
        resp = await client.post(
            "/api/v1/upload/image",
            files={"file": ("a.jpg", _make_jpeg(), "image/jpeg")},
            data={"context": "board"},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        assert f"{notice['tenant_id']}/board/" in resp.json()["data"]["url"]
