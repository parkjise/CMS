"""구독 중단 · 재구독 · 해지 수명 · 안내 메일 (T-134, 기획서 15.2 · 15.4 · 15.7)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.services import email as email_service
from app.services import payment as payment_service
from app.workers import billing as worker
from tests.conftest import _TestSession  # type: ignore


async def _exec(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        row = result.first() if result.returns_rows else None
        await s.commit()
    return row


async def _make_sub(tenant_id: str, **overrides):
    from app.models.billing import Subscription

    now = datetime.now(UTC)
    values = dict(
        id=uuid.uuid4(),
        tenant_id=uuid.UUID(tenant_id),
        plan_type="STANDARD",
        status="ACTIVE",
        billing_key="billing_test_x",
        monthly_amount=89_000,
        current_period_start=now - timedelta(days=30),
        current_period_end=now + timedelta(days=10),
    )
    values.update(overrides)
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        sub = Subscription(**values)
        s.add(sub)
        await s.commit()
    return sub


async def _add_payment(tenant_id: str, sub, status: str, created_at: datetime) -> None:
    await _exec(
        "INSERT INTO payment_history "
        "(id, tenant_id, subscription_id, order_id, amount, status, created_at) "
        "VALUES (:id, :t, :s, :o, 1000, :st, :c)",
        id=uuid.uuid4(),
        t=tenant_id,
        s=sub.id,
        o=f"o-{uuid.uuid4().hex[:12]}",
        st=status,
        c=created_at,
    )


async def _status(tenant_id: str) -> tuple:
    row = await _exec(
        "SELECT s.status, t.is_active, t.deleted_at FROM subscriptions s "
        "JOIN tenants t ON t.id = s.tenant_id WHERE s.tenant_id = :t",
        t=tenant_id,
    )
    return tuple(row)


@pytest.fixture
async def tenant(test_tenant, test_user):
    yield {
        **test_tenant,
        "admin_email": test_user["email"],
        "admin_password": test_user["password"],
    }
    await _exec(
        "DELETE FROM announcements WHERE target_tenants @> ARRAY[:t]::uuid[]",
        t=test_tenant["id"],
    )
    for table in ("payment_history", "plan_change_history", "subscriptions"):
        await _exec(f"DELETE FROM {table} WHERE tenant_id = :t", t=test_tenant["id"])
    await _exec(
        "UPDATE tenants SET is_active = true, deleted_at = NULL WHERE id = :t",
        t=test_tenant["id"],
    )


@pytest.fixture
def mails(monkeypatch):
    sent: list[str] = []

    async def fake_send(to, subject, template, variables):
        sent.append(template)
        return {"sent": True}

    monkeypatch.setattr(email_service, "send_email", fake_send)
    return sent


def _card_body() -> dict:
    return {
        "customer_key": "c",
        "auth_key": "a",
        "billing_email": "pay@example.com",
        "billing_name": "홍길동",
    }


async def _block(tenant_id: str) -> None:
    await _exec("UPDATE tenants SET is_active = false WHERE id = :t", t=tenant_id)


class TestResume:
    async def test_suspended_can_log_in_and_pay_to_recover(self, client, tenant, mails):
        await _make_sub(
            tenant["id"],
            status="SUSPENDED",
            current_period_end=datetime.now(UTC) - timedelta(days=5),
        )
        await _block(tenant["id"])

        login = await client.post(
            "/api/v1/auth/login",
            json={
                "email": tenant["admin_email"],
                "password": tenant["admin_password"],
                "tenant_slug": tenant["slug"],
            },
        )
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['data']['access_token']}"}

        # 결제 외 API 는 막히고 결제는 열려 있다
        assert (
            await client.get("/api/v1/sections", headers=headers)
        ).status_code == 403
        assert (
            await client.get("/api/v1/billing/subscription", headers=headers)
        ).status_code == 200

        res = await client.post(
            "/api/v1/billing/register-card", json=_card_body(), headers=headers
        )
        assert res.status_code == 200
        assert res.json()["data"]["status"] == "ACTIVE"
        # 기간이 새로 시작돼 다음 00:10 작업이 다시 중단시키지 않는다
        end = datetime.fromisoformat(res.json()["data"]["current_period_end"])
        assert end > datetime.now(UTC)
        status_, active, _ = await _status(tenant["id"])
        assert (status_, active) == ("ACTIVE", True)
        assert (
            await client.get("/api/v1/sections", headers=headers)
        ).status_code == 200
        assert await worker._suspend_expired_subscriptions() == 0

    async def test_failed_payment_keeps_suspended(
        self, client, tenant, auth_headers, mails, monkeypatch
    ):
        await _make_sub(
            tenant["id"],
            status="SUSPENDED",
            current_period_end=datetime.now(UTC) - timedelta(days=5),
        )
        await _block(tenant["id"])

        async def declined(**_):
            return {"status": "ABORTED", "message": "한도 초과"}

        monkeypatch.setattr(payment_service, "charge_billing", declined)
        res = await client.post(
            "/api/v1/billing/register-card", json=_card_body(), headers=auth_headers
        )
        assert res.status_code == 402
        assert res.json()["error"]["code"] == "PAYMENT_FAILED"
        status_, active, _ = await _status(tenant["id"])
        assert (status_, active) == ("SUSPENDED", False)
        assert "payment_failed" not in mails  # 화면에서 바로 안내한다

    async def test_cancelled_with_time_left_resumes_without_charge(
        self, client, tenant, auth_headers, mails
    ):
        await _make_sub(
            tenant["id"], status="CANCELLED", cancelled_at=datetime.now(UTC)
        )
        res = await client.post(
            "/api/v1/billing/register-card", json=_card_body(), headers=auth_headers
        )
        assert res.json()["data"]["status"] == "ACTIVE"
        assert res.json()["data"]["cancelled_at"] is None
        row = await _exec(
            "SELECT count(*) FROM payment_history WHERE tenant_id = :t", t=tenant["id"]
        )
        assert row[0] == 0

    async def test_deactivated_by_operator_cannot_log_in(self, client, tenant):
        await _make_sub(tenant["id"])  # 구독은 정상인데 운영사가 끈 사업체
        await _block(tenant["id"])
        login = await client.post(
            "/api/v1/auth/login",
            json={
                "email": tenant["admin_email"],
                "password": tenant["admin_password"],
                "tenant_slug": tenant["slug"],
            },
        )
        assert login.status_code == 401


class TestCancelLifecycle:
    async def test_cancel_stores_reason_and_mails(
        self, client, tenant, auth_headers, mails
    ):
        await _make_sub(tenant["id"])
        res = await client.post(
            "/api/v1/billing/cancel",
            json={"reason": "가격이 비쌈"},
            headers=auth_headers,
        )
        assert res.status_code == 200
        row = await _exec(
            "SELECT cancel_reason FROM subscriptions WHERE tenant_id = :t",
            t=tenant["id"],
        )
        assert row[0] == "가격이 비쌈"
        assert "cancellation_confirmed" in mails
        # 기간이 남아 있으면 사이트 유지
        assert (await _status(tenant["id"]))[1] is True

    async def test_cancel_twice_keeps_first(self, client, tenant, auth_headers, mails):
        await _make_sub(tenant["id"])
        for reason in ("첫 번째", "두 번째"):
            await client.post(
                "/api/v1/billing/cancel", json={"reason": reason}, headers=auth_headers
            )
        row = await _exec(
            "SELECT cancel_reason FROM subscriptions WHERE tenant_id = :t",
            t=tenant["id"],
        )
        assert row[0] == "첫 번째"
        assert mails.count("cancellation_confirmed") == 1

    async def test_blocks_when_period_ends(self, tenant, mails):
        await _make_sub(
            tenant["id"],
            status="CANCELLED",
            cancelled_at=datetime.now(UTC) - timedelta(days=20),
            current_period_end=datetime.now(UTC) - timedelta(hours=1),
        )
        assert await worker._suspend_expired_subscriptions() >= 1
        status_, active, deleted_at = await _status(tenant["id"])
        assert (status_, active, deleted_at) == ("CANCELLED", False, None)
        assert "service_suspended" in mails
        # 이미 막힌 사업체에 메일을 또 보내지 않는다
        mails.clear()
        await worker._suspend_expired_subscriptions()
        assert "service_suspended" not in mails

    async def test_keeps_data_30_days_after_period_end(self, tenant):
        now = datetime.now(UTC)
        await _make_sub(
            tenant["id"],
            status="CANCELLED",
            cancelled_at=now - timedelta(days=40),  # 해지는 40일 전이어도
            current_period_end=now - timedelta(days=10),  # 기간이 끝난 지 10일이면
        )
        await worker._delete_cancelled_tenant_data()
        assert (await _status(tenant["id"]))[2] is None

        await _exec(
            "UPDATE subscriptions SET current_period_end = :e WHERE tenant_id = :t",
            e=now - timedelta(days=31),
            t=tenant["id"],
        )
        await worker._delete_cancelled_tenant_data()
        assert (await _status(tenant["id"]))[2] is not None


class TestRetry:
    async def test_past_due_not_suspended_before_retries_end(self, tenant, mails):
        await _make_sub(
            tenant["id"],
            status="PAST_DUE",
            current_period_end=datetime.now(UTC) - timedelta(days=1),
        )
        await worker._suspend_expired_subscriptions()
        status_, active, _ = await _status(tenant["id"])
        assert (status_, active) == ("PAST_DUE", True)

    async def test_old_failures_do_not_count(self, tenant, mails):
        now = datetime.now(UTC)
        sub = await _make_sub(tenant["id"], status="PAST_DUE", billing_key=None)
        for days in (300, 200, 100):
            await _add_payment(tenant["id"], sub, "FAILED", now - timedelta(days=days))
        await _add_payment(tenant["id"], sub, "SUCCESS", now - timedelta(days=30))

        result = await worker._retry_billing()  # 이번 실패 1회째
        assert result["suspended"] == 0
        assert (await _status(tenant["id"]))[0] == "PAST_DUE"
        assert "payment_failed" in mails

    async def test_third_failure_blocks_site(self, tenant, mails):
        now = datetime.now(UTC)
        sub = await _make_sub(tenant["id"], status="PAST_DUE", billing_key=None)
        for days in (2, 1):
            await _add_payment(tenant["id"], sub, "FAILED", now - timedelta(days=days))

        result = await worker._retry_billing()
        assert result["suspended"] == 1
        status_, active, _ = await _status(tenant["id"])
        assert (status_, active) == ("SUSPENDED", False)
        assert "service_suspended" in mails


class TestNotices:
    async def test_expiring_mail(self, tenant, mails):
        await _make_sub(
            tenant["id"], current_period_end=datetime.now(UTC) + timedelta(days=7)
        )
        await worker._check_expiring_subscriptions()
        assert "expiring_notice" in mails

    async def test_mail_failure_does_not_stop_charge(self, tenant, monkeypatch):
        async def broken(*_, **__):
            raise RuntimeError("SES down")

        monkeypatch.setattr(email_service, "send_email", broken)
        await _make_sub(tenant["id"], status="PAST_DUE", billing_key=None)
        result = await worker._retry_billing()
        assert result["retried"] >= 1

    def test_cancel_template_renders_period(self):
        html = email_service.render_email(
            "cancellation_confirmed",
            {"tenant_name": "OO의원", "period_end": "2026년 12월 01일"},
        )
        assert "2026년 12월 01일" in html

    def test_suspended_template_links_billing(self):
        html = email_service.render_email(
            "service_suspended", {"tenant_name": "OO의원", "billing_url": "http://x/y"}
        )
        assert "http://x/y" in html


class TestWebhookSecret:
    def test_empty_secret_rejected_in_production(self, monkeypatch):
        from app.api.webhook import tosspayments as hook
        from app.core.config import settings

        monkeypatch.setattr(settings, "toss_webhook_secret", "")
        monkeypatch.setattr(settings, "app_env", "production")
        assert hook._verify_signature(b"{}", None) is False

    def test_empty_secret_skipped_locally(self, monkeypatch):
        from app.api.webhook import tosspayments as hook
        from app.core.config import settings

        monkeypatch.setattr(settings, "toss_webhook_secret", "")
        monkeypatch.setattr(settings, "app_env", "development")
        assert hook._verify_signature(b"{}", None) is True
