"""T-096 토스페이먼츠 결제 서비스/API/웹훅 테스트 (payment_mode=test stub)."""

import base64
import hashlib
import hmac
import json
import uuid

import pytest
from sqlalchemy import text

from tests.conftest import _TestSession  # type: ignore


@pytest.fixture
async def bypass_session():
    session = _TestSession()
    await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    yield session
    await session.close()


async def _cleanup(tenant_id: str) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        for table in ("payment_history", "plan_change_history", "subscriptions"):
            await session.execute(
                text(f"DELETE FROM {table} WHERE tenant_id = :t"), {"t": tenant_id}
            )
        await session.commit()


def _register_body() -> dict:
    return {
        "auth_key": "auth_test_123",
        "customer_key": f"cust-{uuid.uuid4().hex[:8]}",
        "billing_email": "pay@test.com",
        "billing_name": "홍길동",
    }


class TestBillingApi:
    async def test_register_card_creates_subscription(
        self, client, auth_headers, test_tenant, test_user
    ):
        try:
            resp = await client.post(
                "/api/v1/billing/register-card",
                headers=auth_headers,
                json=_register_body(),
            )
            assert resp.status_code == 200, resp.text
            data = resp.json()["data"]
            assert data["status"] == "ACTIVE"
            assert data["billing_email"] == "pay@test.com"
        finally:
            await _cleanup(test_tenant["id"])

    async def test_subscription_404_before_register(
        self, client, auth_headers, test_tenant, test_user
    ):
        resp = await client.get("/api/v1/billing/subscription", headers=auth_headers)
        assert resp.status_code == 404

    async def test_change_plan_records_history_and_syncs_tenant(
        self, client, auth_headers, test_tenant, test_user
    ):
        try:
            await client.post(
                "/api/v1/billing/register-card",
                headers=auth_headers,
                json=_register_body(),
            )
            resp = await client.post(
                "/api/v1/billing/change-plan",
                headers=auth_headers,
                json={"to_plan": "PREMIUM", "reason": "업그레이드"},
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["plan_type"] == "PREMIUM"
            assert resp.json()["data"]["monthly_amount"] == 129_000

            # plan_change_history 기록 확인
            async with _TestSession() as s:
                await s.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                cnt = (
                    await s.execute(
                        text(
                            "SELECT count(*) FROM plan_change_history "
                            "WHERE tenant_id = :t AND to_plan = 'PREMIUM'"
                        ),
                        {"t": test_tenant["id"]},
                    )
                ).scalar_one()
            assert cnt == 1
        finally:
            await _cleanup(test_tenant["id"])

    async def test_change_plan_same_conflict(
        self, client, auth_headers, test_tenant, test_user
    ):
        try:
            await client.post(
                "/api/v1/billing/register-card",
                headers=auth_headers,
                json=_register_body(),
            )
            # test_tenant 기본 플랜은 FREE (conftest)
            resp = await client.post(
                "/api/v1/billing/change-plan",
                headers=auth_headers,
                json={"to_plan": "FREE"},
            )
            assert resp.status_code == 409
        finally:
            await _cleanup(test_tenant["id"])

    async def test_cancel_subscription(
        self, client, auth_headers, test_tenant, test_user
    ):
        try:
            await client.post(
                "/api/v1/billing/register-card",
                headers=auth_headers,
                json=_register_body(),
            )
            resp = await client.post(
                "/api/v1/billing/cancel", headers=auth_headers, json={"reason": "해지"}
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["status"] == "CANCELLED"
        finally:
            await _cleanup(test_tenant["id"])

    async def test_requires_auth(self, client):
        resp = await client.get("/api/v1/billing/subscription")
        assert resp.status_code == 401


class TestChargeFlow:
    async def test_manual_charge_then_history(
        self, client, auth_headers, test_tenant, test_user, bypass_session
    ):
        from app.services import payment as svc

        try:
            # 카드 등록
            await client.post(
                "/api/v1/billing/register-card",
                headers=auth_headers,
                json=_register_body(),
            )
            # 수동 결제 (서비스 직접 호출)
            payment = await svc.manual_charge(
                bypass_session, uuid.UUID(test_tenant["id"])
            )
            assert payment.status == "SUCCESS"
            assert payment.paid_at is not None

            # 결제 이력 조회
            hist = await client.get("/api/v1/billing/history", headers=auth_headers)
            assert hist.status_code == 200
            data = hist.json()["data"]
            assert data["total"] >= 1
            assert data["items"][0]["status"] == "SUCCESS"
        finally:
            await _cleanup(test_tenant["id"])


class TestWebhook:
    async def test_webhook_updates_payment_status(
        self, client, auth_headers, test_tenant, test_user, bypass_session
    ):
        from app.services import payment as svc

        try:
            await client.post(
                "/api/v1/billing/register-card",
                headers=auth_headers,
                json=_register_body(),
            )
            payment = await svc.manual_charge(
                bypass_session, uuid.UUID(test_tenant["id"])
            )

            body = json.dumps(
                {
                    "eventType": "PAYMENT_STATUS_CHANGED",
                    "data": {
                        "orderId": payment.order_id,
                        "paymentKey": "pk_webhook_1",
                        "status": "CANCELED",
                    },
                }
            )
            resp = await client.post(
                "/api/webhook/tosspayments",
                content=body,
                headers={"Content-Type": "application/json"},
            )
            assert resp.status_code == 200, resp.text
            assert resp.json()["data"]["matched"] == 1
        finally:
            await _cleanup(test_tenant["id"])

    async def test_webhook_signature_rejected(self, client, monkeypatch):
        from app.core import config

        monkeypatch.setattr(config.settings, "toss_webhook_secret", "whsec_test")
        # webhook 모듈은 settings를 직접 참조
        from app.api.webhook import tosspayments

        monkeypatch.setattr(tosspayments.settings, "toss_webhook_secret", "whsec_test")

        body = json.dumps({"data": {"orderId": "x", "status": "DONE"}})
        resp = await client.post(
            "/api/webhook/tosspayments",
            content=body,
            headers={
                "Content-Type": "application/json",
                "TossPayments-Signature": "wrong",
            },
        )
        assert resp.status_code == 401

    async def test_webhook_valid_signature(self, client, monkeypatch):
        from app.api.webhook import tosspayments

        secret = "whsec_test"
        monkeypatch.setattr(tosspayments.settings, "toss_webhook_secret", secret)

        body = json.dumps({"data": {"orderId": "nomatch", "status": "DONE"}})
        digest = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
        signature = base64.b64encode(digest).decode()

        resp = await client.post(
            "/api/webhook/tosspayments",
            content=body,
            headers={
                "Content-Type": "application/json",
                "TossPayments-Signature": signature,
            },
        )
        assert resp.status_code == 200
        # 매칭되는 결제 없음 → processed True, matched 0
        assert resp.json()["data"]["matched"] == 0
