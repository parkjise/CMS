"""해지 · 정지 사업체 데이터 파기 (T-198, 기획서 10.2 #5 · #6)."""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.services import email as email_service
from app.services import image as image_service
from app.services import site_cache, tenant_purge
from app.workers import billing as billing_worker
from tests.conftest import _TestSession  # type: ignore

NOW = datetime.now(UTC)


async def _sql(sql: str, **params) -> list:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        rows = result.all() if result.returns_rows else []
        await s.commit()
        return rows


async def _count(table: str, tenant_id: str) -> int:
    rows = await _sql(
        f"SELECT count(*) FROM {table} WHERE tenant_id = :t",  # noqa: S608
        t=tenant_id,
    )
    return rows[0][0]


class _FakeS3:
    def __init__(self, keys: list[str]):
        self.keys = set(keys)

    def list_objects_v2(self, Bucket, Prefix, MaxKeys, **_):  # noqa: N803
        found = [{"Key": k} for k in sorted(self.keys) if k.startswith(Prefix)]
        return {"Contents": found[:MaxKeys], "IsTruncated": False}

    def delete_objects(self, Bucket, Delete):  # noqa: N803
        for item in Delete["Objects"]:
            self.keys.discard(item["Key"])


@pytest.fixture(autouse=True)
def outside(monkeypatch) -> dict:
    """메일 · 저장소 · 캐시 대신 기록."""
    sent: dict = {"notice": [], "deleted": [], "purged_slugs": []}

    async def notice(to, *, tenant_name, delete_on):
        sent["notice"].append((to, tenant_name, delete_on))

    async def deleted(to):
        sent["deleted"].append(to)

    async def purge_slugs(slugs, tenant_ids=()):
        sent["purged_slugs"].extend(slugs)
        return True

    monkeypatch.setattr(email_service, "send_data_deletion_notice", notice)
    monkeypatch.setattr(email_service, "send_data_deleted", deleted)
    monkeypatch.setattr(site_cache, "purge_slugs", purge_slugs)
    return sent


async def _make_tenant(status: str, period_end: datetime) -> dict:
    """데이터가 고루 있는 사업체 하나."""
    t, user, sub = (str(uuid.uuid4()) for _ in range(3))
    slug = f"purge-{uuid.uuid4().hex[:8]}"
    email = f"{slug}@example.com"
    await _sql(
        "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
        " updated_at) VALUES (:id, '없어질 병원', :s, 'STANDARD', true, now(), now())",
        id=t,
        s=slug,
    )
    await _sql(
        "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
        " created_at, updated_at) VALUES (:id, :t, :e, 'x', 'TENANT_ADMIN', true,"
        " now(), now())",
        id=user,
        t=t,
        e=email,
    )
    await _sql(
        "INSERT INTO subscriptions (id, tenant_id, plan_type, status, billing_key,"
        " billing_email, billing_name, monthly_amount, current_period_start,"
        " current_period_end, created_at, updated_at) VALUES (:id, :t, 'STANDARD',"
        " :st, 'bk_secret', :e, '홍길동', 39000, :start, :end, now(), now())",
        id=sub,
        t=t,
        st=status,
        e=email,
        start=period_end - timedelta(days=30),
        end=period_end,
    )
    await _sql(
        "INSERT INTO payment_history (id, tenant_id, subscription_id, amount, status,"
        " order_id, created_at) VALUES (gen_random_uuid(), :t, :s, 39000,"
        " 'DONE', :o, now())",
        t=t,
        s=sub,
        o=f"order-{uuid.uuid4().hex[:10]}",
    )
    await _sql(
        "INSERT INTO plan_change_history (id, tenant_id, from_plan, to_plan,"
        " changed_by, effective_at, created_at) VALUES (gen_random_uuid(),"
        " :t, 'BASIC', 'STANDARD', :u, now(), now())",
        t=t,
        u=user,
    )
    board, post, file_id = (str(uuid.uuid4()) for _ in range(3))
    await _sql(
        "INSERT INTO boards (id, tenant_id, name, slug, board_type, status, settings,"
        " created_at, updated_at) VALUES (:id, :t, '소식', 'news', 'LIST', 'ACTIVE',"
        " '{}', now(), now())",
        id=board,
        t=t,
    )
    await _sql(
        "INSERT INTO board_posts (id, tenant_id, board_id, title, body, status,"
        " is_pinned, is_secret, custom_data, created_at, updated_at) VALUES (:id, :t,"
        " :b, '글', '[]', 'PUBLISHED', false, false, '{}', now(), now())",
        id=post,
        t=t,
        b=board,
    )
    await _sql(
        "INSERT INTO uploaded_files (id, tenant_id, file_name, file_url, file_size,"
        " mime_type, uploaded_by, created_at, updated_at) VALUES (:id, :t, 'a.pdf',"
        " :url, 10, 'application/pdf', :u, now(), now())",
        id=file_id,
        t=t,
        url=f"http://cdn/{t}/attachments/{file_id}.pdf",
        u=user,
    )
    await _sql(
        "INSERT INTO board_post_attachments (tenant_id, post_id, file_id) VALUES"
        " (:t, :p, :f)",
        t=t,
        p=post,
        f=file_id,
    )
    await _sql(
        "INSERT INTO inquiries (id, tenant_id, name, phone, message, created_at,"
        " updated_at) VALUES (gen_random_uuid(), :t, '방문자', '010-0000-0000',"
        " '문의', now(), now())",
        t=t,
    )
    member = str(uuid.uuid4())
    await _sql(
        "INSERT INTO site_members (id, tenant_id, email, name, created_at, updated_at)"
        " VALUES (:id, :t, 'visitor@example.com', '방문자', now(), now())",
        id=member,
        t=t,
    )
    await _sql(
        "INSERT INTO member_reservations (id, tenant_id, member_id, reservation_type,"
        " created_at, updated_at) VALUES (gen_random_uuid(), :t, :m, 'VISIT', now(),"
        " now())",
        t=t,
        m=member,
    )
    section = str(uuid.uuid4())
    await _sql(
        "INSERT INTO sections (id, tenant_id, section_type, label, created_at,"
        " updated_at) VALUES (:id, :t, 'HERO_BANNER', '메인', now(), now())",
        id=section,
        t=t,
    )
    await _sql(
        "INSERT INTO section_settings (id, tenant_id, section_id, field_key,"
        " field_value, created_at, updated_at) VALUES (gen_random_uuid(), :t, :s,"
        " 'title', '안녕하세요', now(), now())",
        t=t,
        s=section,
    )
    await _sql(
        "INSERT INTO site_settings (id, tenant_id, created_at, updated_at) VALUES"
        " (gen_random_uuid(), :t, now(), now())",
        t=t,
    )
    await _sql(
        "INSERT INTO tenant_domains (id, tenant_id, domain, domain_type, created_at,"
        " status) VALUES (gen_random_uuid(), :t, :d, 'CUSTOM', now(), 'ACTIVE')",
        t=t,
        d=f"{slug}.example.com",
    )
    await _sql(
        "INSERT INTO audit_logs (id, tenant_id, actor_id, actor_role, action,"
        " target_type, created_at) VALUES (gen_random_uuid(), :t, :u, 'TENANT_ADMIN',"
        " 'BOARD_CREATED', 'board', now())",
        t=t,
        u=user,
    )
    return {"id": t, "slug": slug, "email": email, "user": user}


async def _cleanup(tenant: dict) -> None:
    t = tenant["id"]
    for table in ("plan_change_history", "payment_history", "subscriptions"):
        await _sql(f"DELETE FROM {table} WHERE tenant_id = :t", t=t)  # noqa: S608
    for table in tenant_purge.PURGE_TABLES:
        await _sql(f"DELETE FROM {table} WHERE tenant_id = :t", t=t)  # noqa: S608
    await _sql("DELETE FROM audit_logs WHERE target_id = :t", t=t)
    await _sql("DELETE FROM tenants WHERE id = :t", t=t)


@pytest.fixture
async def tenants() -> AsyncIterator[list[dict]]:
    made: list[dict] = []
    yield made
    for tenant in made:
        await _cleanup(tenant)


async def _make(tenants: list, status: str, ended_days_ago: int) -> dict:
    tenant = await _make_tenant(status, NOW - timedelta(days=ended_days_ago))
    tenants.append(tenant)
    return tenant


async def _run(now: datetime) -> dict:
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        await billing_worker._bypass(db)
        notified = await tenant_purge.notify_upcoming(db, now)
        purged = await tenant_purge.purge_due(db, now)
    return {"notified": notified, "purged": purged}


async def _notified_at(tenant: dict, days_ago: int) -> None:
    await _sql(
        "UPDATE tenants SET purge_notified_at = :at WHERE id = :t",
        at=NOW - timedelta(days=days_ago),
        t=tenant["id"],
    )


class TestSchedule:
    def test_purge_dates(self):
        from app.models.billing import Subscription

        end = datetime(2026, 1, 1, tzinfo=UTC)
        sub = Subscription(status="CANCELLED", current_period_end=end)
        assert tenant_purge.purge_at(sub) == end + timedelta(days=30)
        sub.status = "SUSPENDED"
        assert tenant_purge.purge_at(sub) == end + timedelta(days=90)
        sub.status = "PAST_DUE"
        assert tenant_purge.purge_at(sub) == end + timedelta(days=90)
        for status in ("ACTIVE", "TRIAL"):
            sub.status = status
            assert tenant_purge.purge_at(sub) is None

    async def test_notice_once_then_purge_after_seven_days(self, tenants, outside):
        tenant = await _make(tenants, "CANCELLED", 25)  # 파기일 5일 뒤

        first = await _run(NOW)
        assert first["notified"] >= 1
        mine = [n for n in outside["notice"] if n[0] == tenant["email"]]
        assert len(mine) == 1
        # 예고는 한 번만
        await _run(NOW + timedelta(days=1))
        assert [n[0] for n in outside["notice"]].count(tenant["email"]) == 1
        # 파기일은 지났어도 예고 뒤 7일 전에는 지우지 않는다
        await _run(NOW + timedelta(days=6))
        assert await _count("users", tenant["id"]) == 1
        await _run(NOW + timedelta(days=8))
        assert await _count("users", tenant["id"]) == 0

    async def test_late_notice_moves_delete_date(self, tenants, outside):
        tenant = await _make(tenants, "CANCELLED", 60)  # 파기일 이미 지남
        await _run(NOW)
        (_to, _name, delete_on) = next(
            n for n in outside["notice"] if n[0] == tenant["email"]
        )
        assert delete_on >= NOW + timedelta(days=7) - timedelta(seconds=1)
        assert await _count("boards", tenant["id"]) == 1

    async def test_suspended_waits_ninety_days(self, tenants, outside):
        young = await _make(tenants, "SUSPENDED", 60)
        old = await _make(tenants, "PAST_DUE", 100)
        await _notified_at(young, 10)
        await _notified_at(old, 10)
        await _run(NOW)
        assert await _count("boards", young["id"]) == 1
        assert await _count("boards", old["id"]) == 0

    async def test_active_again_is_skipped(self, tenants, outside):
        tenant = await _make(tenants, "CANCELLED", 60)
        await _notified_at(tenant, 10)
        await _sql(
            "UPDATE subscriptions SET status = 'ACTIVE' WHERE tenant_id = :t",
            t=tenant["id"],
        )
        await _run(NOW)
        assert await _count("boards", tenant["id"]) == 1
        assert tenant["email"] not in outside["deleted"]


class TestPurge:
    async def test_deletes_data_keeps_payment_records(
        self, tenants, outside, monkeypatch
    ):
        tenant = await _make(tenants, "CANCELLED", 60)
        other = await _make(tenants, "ACTIVE", -10)
        await _notified_at(tenant, 10)
        s3 = _FakeS3(
            [
                f"{tenant['id']}/board/a.webp",
                f"{tenant['id']}/attachments/b.pdf",
                f"{other['id']}/board/c.webp",
            ]
        )
        monkeypatch.setattr(image_service, "_get_s3_client", lambda: s3)

        result = await _run(NOW)
        assert result["purged"] >= 1

        t = tenant["id"]
        for table in tenant_purge.PURGE_TABLES:
            assert await _count(table, t) == 0, table
        # 결제 기록은 남고, 결제 수단(빌링키)은 지운다
        assert await _count("payment_history", t) == 1
        assert await _count("plan_change_history", t) == 1
        sub = await _sql(
            "SELECT billing_key, billing_name FROM subscriptions WHERE tenant_id = :t",
            t=t,
        )
        assert sub == [(None, "홍길동")]
        row = await _sql(
            "SELECT name, slug, is_active, data_purged_at IS NOT NULL, deleted_at"
            " IS NOT NULL, custom_domain FROM tenants WHERE id = :t",
            t=t,
        )
        assert row[0][0] == "없어질 병원"
        assert row[0][1].startswith("deleted-")
        assert row[0][2:] == (False, True, True, None)
        # 저장소 — 이 사업체 폴더만
        assert s3.keys == {f"{other['id']}/board/c.webp"}
        assert tenant["email"] in outside["deleted"]
        assert tenant["slug"] in outside["purged_slugs"]
        # 다른 사업체는 그대로
        assert await _count("boards", other["id"]) == 1
        assert await _count("users", other["id"]) == 1
        # 운영사 쪽 기록
        log = await _sql(
            "SELECT tenant_id, actor_role, after_value->>'slug' FROM audit_logs"
            " WHERE action = 'TENANT_DATA_PURGED' AND target_id = :t",
            t=t,
        )
        assert log == [(None, "SYSTEM", tenant["slug"])]

    async def test_runs_once(self, tenants, outside, monkeypatch):
        tenant = await _make(tenants, "CANCELLED", 60)
        await _notified_at(tenant, 10)
        monkeypatch.setattr(image_service, "_get_s3_client", lambda: _FakeS3([]))
        await _run(NOW)
        await _run(NOW + timedelta(days=1))
        assert outside["deleted"].count(tenant["email"]) == 1

    async def test_every_tenant_table_is_purged_or_kept(self):
        """새 표가 생기면 여기서 걸린다 — 파기할지 남길지 정해야 한다."""
        rows = await _sql(
            "SELECT table_name FROM information_schema.columns"
            " WHERE table_schema = 'public' AND column_name = 'tenant_id'"
        )
        tables = {row[0] for row in rows}
        decided = set(tenant_purge.PURGE_TABLES) | set(tenant_purge.KEPT_TABLES)
        assert tables - decided == set()
