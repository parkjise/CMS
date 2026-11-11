"""게시글 예약 공개 (T-189, 게시판 모듈 기획서 BM-05)."""

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.services import feature as feature_service
from app.services import site_cache
from app.workers import scheduled as worker
from tests.conftest import _TestSession  # type: ignore

BOARDS = "/api/v1/boards"
BODY = [{"type": "p", "text": "본문"}]


async def _sql(sql: str, **params) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await s.execute(text(sql), params)
        await s.commit()


def _later(**delta) -> str:
    return (datetime.now(UTC) + timedelta(**delta)).isoformat()


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
    await feature_service.invalidate_cache(test_tenant["id"])


@pytest.fixture
async def board(client, auth_headers, tenant) -> dict:
    resp = await client.post(
        BOARDS, json={"name": "소식", "slug": "news"}, headers=auth_headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _post(client, headers, board: dict, **fields):
    return await client.post(
        f"{BOARDS}/{board['id']}/posts",
        json={"title": "예약 글", "body": BODY, "status": "PUBLISHED", **fields},
        headers=headers,
    )


async def _public_titles(client, slug: str) -> list[str]:
    resp = await client.get(f"/api/public/site/{slug}/boards/news/posts")
    assert resp.status_code == 200, resp.text
    return [item["title"] for item in resp.json()["data"]["items"]]


async def _make_due(post_id: str) -> None:
    await _sql(
        "UPDATE board_posts SET published_at = now() - interval '1 minute'"
        " WHERE id = :p",
        p=post_id,
    )


class TestScheduledPost:
    async def test_hidden_everywhere_until_due(
        self, client, auth_headers, tenant, board
    ):
        resp = await _post(client, auth_headers, board, published_at=_later(days=1))
        assert resp.status_code == 201, resp.text
        post = resp.json()["data"]
        slug = tenant["slug"]

        assert await _public_titles(client, slug) == []
        detail = await client.get(
            f"/api/public/site/{slug}/boards/news/posts/{post['id']}"
        )
        assert detail.status_code == 404
        location = await client.get(
            f"/api/public/site/{slug}/posts/{post['id']}/location"
        )
        assert location.status_code == 404
        sitemap = await client.get(f"/api/public/site/{slug}/sitemap-posts")
        assert post["id"] not in {p["id"] for p in sitemap.json()["data"]}

        # 관리자 목록에는 공개 시각과 함께 보인다
        admin = await client.get(f"{BOARDS}/{board['id']}/posts", headers=auth_headers)
        assert [p["id"] for p in admin.json()["data"]["items"]] == [post["id"]]
        assert admin.json()["data"]["items"][0]["published_at"] is not None

        await _make_due(post["id"])
        assert await _public_titles(client, slug) == ["예약 글"]

    @pytest.mark.parametrize(
        ("fields", "message"),
        [
            ({"published_at": _later(minutes=-5)}, "지금보다 뒤"),
            ({"published_at": _later(days=400)}, "1년 안"),
            ({"published_at": _later(days=1), "status": "DRAFT"}, "공개 상태"),
        ],
    )
    async def test_invalid_schedule_rejected(
        self, client, auth_headers, board, fields, message
    ):
        resp = await _post(client, auth_headers, board, **fields)
        assert resp.status_code == 400
        assert message in resp.json()["error"]["message"]

    async def test_naive_time_rejected(self, client, auth_headers, board):
        naive = (datetime.now() + timedelta(days=1)).replace(microsecond=0)
        resp = await _post(client, auth_headers, board, published_at=naive.isoformat())
        assert resp.status_code in (400, 422)

    async def test_publish_now_clears_schedule(
        self, client, auth_headers, tenant, board
    ):
        post = (
            await _post(client, auth_headers, board, published_at=_later(days=1))
        ).json()["data"]

        resp = await client.patch(
            f"{BOARDS}/{board['id']}/posts/{post['id']}",
            json={"published_at": None},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        published = datetime.fromisoformat(resp.json()["data"]["published_at"])
        assert published <= datetime.now(UTC)
        assert await _public_titles(client, tenant["slug"]) == ["예약 글"]

    async def test_reschedule_and_unpublish(self, client, auth_headers, board):
        post = (
            await _post(client, auth_headers, board, published_at=_later(days=1))
        ).json()["data"]
        url = f"{BOARDS}/{board['id']}/posts/{post['id']}"

        moved = await client.patch(
            url, json={"published_at": _later(days=3)}, headers=auth_headers
        )
        assert moved.status_code == 200, moved.text
        assert datetime.fromisoformat(
            moved.json()["data"]["published_at"]
        ) > datetime.now(UTC) + timedelta(days=2)

        # 공개를 거두면 예약도 풀린다
        hidden = await client.patch(url, json={"status": "DRAFT"}, headers=auth_headers)
        assert hidden.json()["data"]["published_at"] is None

    async def test_bulk_publish_keeps_schedule(self, client, auth_headers, board):
        post = (
            await _post(client, auth_headers, board, published_at=_later(days=1))
        ).json()["data"]

        resp = await client.post(
            "/api/v1/posts/bulk",
            json={"post_ids": [post["id"]], "action": "PUBLISH"},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        stored = await client.get(
            f"{BOARDS}/{board['id']}/posts/{post['id']}", headers=auth_headers
        )
        assert datetime.fromisoformat(
            stored.json()["data"]["published_at"]
        ) > datetime.now(UTC)


class TestReleaseScheduledPosts:
    async def test_purges_only_tenants_with_due_posts(
        self, client, auth_headers, tenant, board, purged
    ):
        post = (
            await _post(client, auth_headers, board, published_at=_later(days=1))
        ).json()["data"]
        purged.clear()

        await worker._release_scheduled_posts()
        assert tenant["id"] not in purged

        await _make_due(post["id"])
        await worker._release_scheduled_posts()
        assert tenant["id"] in purged
