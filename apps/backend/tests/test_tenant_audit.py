"""사업체 변경 기록 조회 (T-186)."""

import json
import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text

from app.core.security import create_access_token
from app.services import feature as feature_service
from app.services import site_cache
from tests.conftest import _TestSession  # type: ignore

URL = "/api/v1/audit-logs"


async def _sql(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await s.execute(text(sql), params)
        await s.commit()


async def _log(
    tenant_id: str | None,
    actor_id: str,
    action: str,
    target_type: str,
    *,
    target_id: str | None = None,
    before: dict | None = None,
    after: dict | None = None,
    role: str = "TENANT_ADMIN",
    minutes_ago: int = 0,
) -> None:
    await _sql(
        "INSERT INTO audit_logs (id, tenant_id, actor_id, actor_role, action,"
        " target_type, target_id, before_value, after_value, ip_address, created_at)"
        " VALUES (:id, :t, :a, :r, :action, :tt, :tid, CAST(:b AS jsonb),"
        " CAST(:af AS jsonb), '10.0.0.1',"
        " now() - make_interval(mins => :m))",
        id=str(uuid.uuid4()),
        t=tenant_id,
        a=actor_id,
        r=role,
        action=action,
        tt=target_type,
        tid=target_id,
        b=json.dumps(before) if before is not None else None,
        af=json.dumps(after) if after is not None else None,
        m=minutes_ago,
    )


@pytest.fixture(autouse=True)
def no_purge(monkeypatch) -> None:
    async def fake_purge(_db, _tenant_id):
        return True

    monkeypatch.setattr(site_cache, "purge_site", fake_purge)


@pytest.fixture
async def tenant(test_tenant, test_user) -> AsyncIterator[dict]:
    await feature_service.invalidate_cache(test_tenant["id"])
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t", t=test_tenant["id"]
    )
    yield test_tenant
    await _sql("DELETE FROM audit_logs WHERE tenant_id = :t", t=test_tenant["id"])
    await _sql(
        "DELETE FROM audit_logs WHERE tenant_id IS NULL AND target_id = :t",
        t=test_tenant["id"],
    )
    await _sql("DELETE FROM tenant_features WHERE tenant_id = :t", t=test_tenant["id"])
    await feature_service.invalidate_cache(test_tenant["id"])


@pytest.fixture
async def other_tenant() -> AsyncIterator[str]:
    tenant_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
        " updated_at) VALUES (:id, '다른 곳', :slug, 'FREE', true, now(), now())",
        id=tenant_id,
        slug=f"other-{tenant_id[:8]}",
    )
    yield tenant_id
    await _sql("DELETE FROM audit_logs WHERE tenant_id = :t", t=tenant_id)
    await _sql("DELETE FROM tenants WHERE id = :t", t=tenant_id)


async def _items(client, headers, **params) -> dict:
    resp = await client.get(URL, params=params, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


@pytest.mark.asyncio
async def test_requires_login(client):
    assert (await client.get(URL)).status_code == 401


@pytest.mark.asyncio
async def test_records_real_board_change(client, auth_headers, tenant, test_user):
    resp = await client.post(
        "/api/v1/boards",
        json={"name": "자유 게시판", "slug": "free-talk"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text

    data = await _items(client, auth_headers)
    assert data["total"] == 1
    item = data["items"][0]
    assert item["action"] == "BOARD_CREATED"
    assert item["target_type"] == "board"
    assert item["board_name"] == "자유 게시판"
    assert item["actor"] == test_user["email"]


@pytest.mark.asyncio
async def test_hides_ip_and_raw_values(client, auth_headers, tenant, test_user):
    await _log(
        tenant["id"],
        test_user["id"],
        "BOARD_UPDATED",
        "board",
        before={"name": "이전", "permissions": {"read": "ALL"}},
        after={"name": "이후", "permissions": {"read": "MEMBER"}},
    )
    item = (await _items(client, auth_headers))["items"][0]
    assert item["board_name"] == "이후"
    for key in ("ip_address", "before_value", "after_value", "actor_id"):
        assert key not in item


@pytest.mark.asyncio
async def test_only_own_tenant(client, auth_headers, tenant, test_user, other_tenant):
    await _log(tenant["id"], test_user["id"], "POST_DELETED", "board_post")
    await _log(other_tenant, str(uuid.uuid4()), "POST_DELETED", "board_post")
    # 운영사가 사업체에 한 조치는 사업체 기록이 아니다
    await _log(
        None,
        str(uuid.uuid4()),
        "TENANT_PLAN_CHANGED",
        "tenant",
        target_id=tenant["id"],
        role="SUPER_ADMIN",
    )
    data = await _items(client, auth_headers)
    assert data["total"] == 1
    assert [i["action"] for i in data["items"]] == ["POST_DELETED"]


@pytest.mark.asyncio
async def test_post_summary_and_count(client, auth_headers, tenant, test_user):
    await _log(
        tenant["id"],
        test_user["id"],
        "POST_BULK_PUBLISH",
        "board_post",
        after={"post_ids": [str(uuid.uuid4()) for _ in range(3)]},
        minutes_ago=2,
    )
    await _log(
        tenant["id"],
        test_user["id"],
        "POST_DELETED",
        "board_post",
        after={"title": "공지 글", "status": "PUBLISHED"},
        minutes_ago=1,
    )
    items = (await _items(client, auth_headers))["items"]
    assert items[0]["target_name"] == "공지 글"
    assert items[0]["count"] is None
    assert items[1]["count"] == 3


@pytest.mark.asyncio
async def test_board_name_from_board_id(client, auth_headers, tenant, test_user):
    resp = await client.post(
        "/api/v1/boards",
        json={"name": "후기", "slug": "reviews"},
        headers=auth_headers,
    )
    board_id = resp.json()["data"]["id"]
    await _log(
        tenant["id"],
        test_user["id"],
        "POST_MOVED",
        "board_post",
        after={"board_id": board_id, "moved": 2, "values_dropped": 0},
    )
    item = (await _items(client, auth_headers, kind="post"))["items"][0]
    assert item["board_name"] == "후기"
    assert item["count"] == 2


@pytest.mark.asyncio
async def test_kind_filter(client, auth_headers, tenant, test_user):
    for action, target_type in (
        ("BOARD_CREATED", "board"),
        ("POST_DELETED", "board_post"),
        ("BOARD_FIELD_CREATED", "board_field"),
        ("BOARD_CATEGORY_CREATED", "board_category"),
    ):
        await _log(tenant["id"], test_user["id"], action, target_type)
    assert (await _items(client, auth_headers, kind="board"))["total"] == 1
    assert (await _items(client, auth_headers, kind="post"))["total"] == 1
    setup = await _items(client, auth_headers, kind="setup")
    assert {i["target_type"] for i in setup["items"]} == {
        "board_field",
        "board_category",
    }


@pytest.mark.asyncio
async def test_bad_kind(client, auth_headers, tenant):
    resp = await client.get(URL, params={"kind": "tenant"}, headers=auth_headers)
    assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_paging_latest_first(client, auth_headers, tenant, test_user):
    for i in range(5):
        await _log(
            tenant["id"],
            test_user["id"],
            "POST_DELETED",
            "board_post",
            after={"title": f"글 {i}"},
            minutes_ago=i,
        )
    first = await _items(client, auth_headers, page=1, limit=2)
    assert first["total"] == 5
    assert [i["target_name"] for i in first["items"]] == ["글 0", "글 1"]
    last = await _items(client, auth_headers, page=3, limit=2)
    assert [i["target_name"] for i in last["items"]] == ["글 4"]


@pytest.mark.asyncio
async def test_actor_labels(client, auth_headers, tenant, test_user):
    await _log(
        tenant["id"], str(uuid.uuid4()), "BOARD_CREATED", "board", role="SUPER_ADMIN"
    )
    await _log(tenant["id"], str(uuid.uuid4()), "BOARD_DELETED", "board")
    actors = {
        i["action"]: i["actor"] for i in (await _items(client, auth_headers))["items"]
    }
    assert actors == {"BOARD_CREATED": "운영사", "BOARD_DELETED": "삭제된 계정"}


@pytest.mark.asyncio
async def test_viewer_can_read(client, tenant, test_user):
    await _log(tenant["id"], test_user["id"], "POST_DELETED", "board_post")
    token = create_access_token(
        user_id=uuid.UUID(test_user["id"]),
        tenant_id=uuid.UUID(tenant["id"]),
        role="TENANT_VIEWER",
    )
    data = await _items(client, {"Authorization": f"Bearer {token}"})
    assert data["total"] == 1
