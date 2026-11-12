"""T-205 슈퍼 어드민 사업체 목록 — 만료일 · 30일 방문자 · 문의 수 · 정렬 (SA-02)."""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from tests.conftest import _TestSession

URL = "/api/super/v1/tenants"


@pytest.fixture
async def super_headers() -> AsyncIterator[dict]:
    user_id = str(uuid.uuid4())
    await _sql(
        "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
        " created_at, updated_at)"
        " VALUES (:id, NULL, :e, 'x', 'SUPER_ADMIN', true, now(), now())",
        id=user_id,
        e=f"sa-{user_id[:6]}@cms.io",
    )
    token = create_access_token(
        user_id=uuid.UUID(user_id),
        tenant_id=None,
        role="SUPER_ADMIN",
        is_super_admin=True,
    )
    yield {"Authorization": f"Bearer {token}"}
    await _sql("DELETE FROM users WHERE id = :id", id=user_id)


async def _sql(sql: str, **params) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await s.execute(text(sql), params)
        await s.commit()


async def _tenant(prefix: str, name: str, template: str, created: datetime) -> str:
    tid = str(uuid.uuid4())
    await _sql(
        "INSERT INTO tenants (id, name, slug, template_type, plan_type, is_active,"
        " created_at, updated_at)"
        " VALUES (:id, :n, :s, :tt, 'STANDARD', true, :c, :c)",
        id=tid,
        n=f"{name}-{prefix}",
        s=f"{prefix}-{tid[:6]}",
        tt=template,
        c=created,
    )
    return tid


async def _subscription(tid: str, status: str, end: datetime, trial: datetime | None):
    await _sql(
        "INSERT INTO subscriptions (id, tenant_id, plan_type, status, monthly_amount,"
        " trial_ends_at, current_period_start, current_period_end, created_at,"
        " updated_at) VALUES (gen_random_uuid(), :t, 'STANDARD', :st, 29000, :tr,"
        " now() - interval '10 days', :end, now(), now())",
        t=tid,
        st=status,
        tr=trial,
        end=end,
    )


async def _visits(tid: str, days_ago: int, visitors: int) -> None:
    await _sql(
        "INSERT INTO site_analytics (id, tenant_id, date, page_views,"
        " unique_visitors, mobile_views, referrers, created_at, updated_at)"
        " VALUES (gen_random_uuid(), :t, CURRENT_DATE - CAST(:d AS integer),"
        " :v, :v, 0, '{}', now(), now())",
        t=tid,
        d=days_ago,
        v=visitors,
    )


async def _inquiry(tid: str, days_ago: int, deleted: bool = False) -> None:
    await _sql(
        "INSERT INTO inquiries (id, tenant_id, inquiry_type, name, phone, message,"
        " status, is_read, created_at, updated_at, deleted_at)"
        " VALUES (gen_random_uuid(), :t, 'GENERAL', '문의자', '010-1234-5678',"
        " '문의 내용입니다.', 'PENDING', false,"
        " now() - make_interval(days => CAST(:d AS integer)),"
        " now(), CASE WHEN CAST(:gone AS boolean) THEN now() END)",
        t=tid,
        d=days_ago,
        gone=deleted,
    )


@pytest.fixture
async def tenants() -> AsyncIterator[dict]:
    """가: 구독 20일 · 방문 20 · 문의 3 / 나: 체험 5일 · 방문 50 · 문의 1 / 다: 없음."""
    prefix = f"sortt{uuid.uuid4().hex[:6]}"
    now = datetime.now(UTC)
    a = await _tenant(prefix, "가", "HOSPITAL", now - timedelta(days=3))
    b = await _tenant(prefix, "나", "PENSION", now - timedelta(days=2))
    c = await _tenant(prefix, "다", "HOSPITAL", now - timedelta(days=1))

    await _subscription(a, "ACTIVE", now + timedelta(days=20), None)
    await _subscription(b, "TRIAL", now + timedelta(days=60), now + timedelta(days=5))
    await _visits(a, 1, 12)
    await _visits(a, 29, 8)
    await _visits(a, 40, 100)  # 30일 밖
    await _visits(b, 0, 50)
    for days in (0, 3, 20):
        await _inquiry(a, days)
    await _inquiry(a, 45)  # 30일 밖
    await _inquiry(a, 1, deleted=True)
    await _inquiry(b, 2)

    yield {"prefix": prefix, "a": a, "b": b, "c": c}

    ids = {"ids": [a, b, c]}
    for table in ("inquiries", "site_analytics", "subscriptions"):
        await _sql(f"DELETE FROM {table} WHERE tenant_id = ANY(:ids)", **ids)
    await _sql("DELETE FROM tenants WHERE id = ANY(:ids)", **ids)


async def _list(client: AsyncClient, headers: dict, prefix: str, **params) -> list:
    resp = await client.get(URL, headers=headers, params={"q": prefix, **params})
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["items"]


class TestListColumns:
    async def test_expires_visitors_inquiries(
        self,
        client,
        super_headers,
        tenants,
    ):
        items = {
            t["id"]: t for t in await _list(client, super_headers, tenants["prefix"])
        }
        a, b, c = items[tenants["a"]], items[tenants["b"]], items[tenants["c"]]
        assert (a["visitors_30d"], a["inquiries_30d"]) == (20, 3)
        assert (b["visitors_30d"], b["inquiries_30d"]) == (50, 1)
        assert (c["visitors_30d"], c["inquiries_30d"], c["expires_at"]) == (0, 0, None)
        # 체험 중이면 체험 종료일, 아니면 이번 결제 기간 끝
        now = datetime.now(UTC)
        a_end = datetime.fromisoformat(a["expires_at"])
        b_end = datetime.fromisoformat(b["expires_at"])
        assert timedelta(days=19) < a_end - now < timedelta(days=21)
        assert timedelta(days=4) < b_end - now < timedelta(days=6)


class TestSort:
    @pytest.mark.parametrize(
        ("sort", "expected"),
        [
            ("created_desc", ["c", "b", "a"]),
            ("created_asc", ["a", "b", "c"]),
            ("name", ["a", "b", "c"]),
            ("expires_asc", ["b", "a", "c"]),  # 만료 없는 사업체는 뒤로
            ("visitors_desc", ["b", "a", "c"]),
            ("inquiries_desc", ["a", "b", "c"]),
        ],
    )
    async def test_orders(
        self,
        client,
        super_headers,
        tenants,
        sort,
        expected,
    ):
        items = await _list(client, super_headers, tenants["prefix"], sort=sort)
        assert [t["id"] for t in items] == [tenants[k] for k in expected]

    async def test_default_is_newest(
        self,
        client,
        super_headers,
        tenants,
    ):
        items = await _list(client, super_headers, tenants["prefix"])
        assert items[0]["id"] == tenants["c"]

    async def test_bad_sort_400(self, client, super_headers):
        resp = await client.get(URL, headers=super_headers, params={"sort": "drop"})
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    async def test_sort_with_template_filter_and_paging(
        self,
        client,
        super_headers,
        tenants,
    ):
        items = await _list(
            client,
            super_headers,
            tenants["prefix"],
            template_type="HOSPITAL",
            sort="inquiries_desc",
            limit=1,
            page=2,
        )
        assert [t["id"] for t in items] == [tenants["c"]]

    async def test_tenant_admin_forbidden(self, client, auth_headers):
        assert (await client.get(URL, headers=auth_headers)).status_code == 403
