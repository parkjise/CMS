"""T-207 결제 수단 표시 · 삭제 (AD-08 카드 [삭제])."""

import uuid

import httpx
import pytest
from sqlalchemy import text

from app.core.security import create_access_token
from app.models.billing import Subscription
from app.services import payment
from tests.conftest import _TestSession

CARD = "/api/v1/billing/card"
SUB = "/api/v1/billing/subscription"


async def _sql(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        row = result.first() if result.returns_rows else None
        await s.commit()
    return row


@pytest.fixture
async def registered(client, auth_headers, test_tenant, test_user):
    """test 모드로 카드 등록 → 구독 ACTIVE + 테스트카드 ****1234."""
    resp = await client.post(
        "/api/v1/billing/register-card",
        headers=auth_headers,
        json={"auth_key": "ak", "customer_key": f"ck-{uuid.uuid4().hex[:6]}"},
    )
    assert resp.status_code == 200, resp.text
    yield test_tenant
    for table in ("payment_history", "plan_change_history", "subscriptions"):
        await _sql(f"DELETE FROM {table} WHERE tenant_id = :t", t=test_tenant["id"])


async def _status(tenant_id: str, status: str) -> None:
    await _sql(
        "UPDATE subscriptions SET status = :s WHERE tenant_id = :t",
        s=status,
        t=tenant_id,
    )


class TestCardDisplay:
    async def test_register_saves_company_and_last4(
        self, client, auth_headers, registered
    ):
        data = (await client.get(SUB, headers=auth_headers)).json()["data"]
        assert data["has_card"] is True
        assert (data["card_company"], data["card_last4"]) == ("테스트카드", "1234")
        # 빌링키는 응답에 싣지 않는다
        assert "billing_key" not in data

    async def test_live_response_parsed(self, monkeypatch):
        """토스 응답의 cardCompany · 가려진 cardNumber 에서 끝 4자리만."""

        class _Resp:
            status_code = 200

            def json(self):
                return {
                    "billingKey": "bk_live",
                    "cardCompany": "신한",
                    "cardNumber": "433012******5678",
                }

        class _Client:
            def __init__(self, *a, **k):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def post(self, *a, **k):
                return _Resp()

        monkeypatch.setattr(payment.settings, "payment_mode", "live")
        monkeypatch.setattr(httpx, "AsyncClient", _Client)
        issued = await payment.issue_billing_key("ck", "ak")
        assert issued == payment.BillingKey("bk_live", "신한", "5678")

    def test_last4_needs_four_digits(self):
        assert payment._last4("****12") is None
        assert payment._last4(None) is None

    def test_no_full_card_number_column(self):
        cols = {c.name: c for c in Subscription.__table__.columns}
        assert cols["card_last4"].type.length == 4


class TestDeleteCard:
    async def test_active_subscription_409(self, client, auth_headers, registered):
        resp = await client.delete(CARD, headers=auth_headers)
        assert resp.status_code == 409
        assert "해지" in resp.json()["error"]["message"]
        data = (await client.get(SUB, headers=auth_headers)).json()["data"]
        assert data["has_card"] is True

    async def test_past_due_409(self, client, auth_headers, registered):
        await _status(registered["id"], "PAST_DUE")
        assert (await client.delete(CARD, headers=auth_headers)).status_code == 409

    @pytest.mark.parametrize("status", ["CANCELLED", "TRIAL", "SUSPENDED"])
    async def test_deletes_when_not_auto_paying(
        self, client, auth_headers, registered, status
    ):
        await _sql(
            "INSERT INTO payment_history (id, tenant_id, subscription_id, order_id,"
            " amount, status, created_at)"
            " SELECT gen_random_uuid(), tenant_id, id, :o, 29000, 'SUCCESS', now()"
            " FROM subscriptions WHERE tenant_id = :t",
            o=f"ORD-{uuid.uuid4().hex[:8]}",
            t=registered["id"],
        )
        await _status(registered["id"], status)
        resp = await client.delete(CARD, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["has_card"] is False
        assert (data["card_company"], data["card_last4"]) == (None, None)
        assert data["status"] == status  # 구독 상태는 그대로
        row = await _sql(
            "SELECT billing_key, (SELECT count(*) FROM payment_history p"
            " WHERE p.tenant_id = s.tenant_id) FROM subscriptions s"
            " WHERE tenant_id = :t",
            t=registered["id"],
        )
        assert row == (None, 1)  # 결제 기록은 남는다

    async def test_no_card_404(self, client, auth_headers, registered):
        await _status(registered["id"], "CANCELLED")
        assert (await client.delete(CARD, headers=auth_headers)).status_code == 200
        assert (await client.delete(CARD, headers=auth_headers)).status_code == 404

    async def test_no_subscription_404(self, client, auth_headers, test_tenant):
        assert (await client.delete(CARD, headers=auth_headers)).status_code == 404

    async def test_unauthenticated_401(self, client):
        assert (await client.delete(CARD)).status_code == 401

    async def test_viewer_403(self, client, registered):
        await _status(registered["id"], "CANCELLED")
        user_id = uuid.uuid4()
        await _sql(
            "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
            " created_at, updated_at)"
            " VALUES (:id, :t, :e, 'x', 'TENANT_VIEWER', true, now(), now())",
            id=str(user_id),
            t=registered["id"],
            e=f"{user_id.hex[:8]}@example.com",
        )
        token = create_access_token(
            user_id=user_id, tenant_id=uuid.UUID(registered["id"]), role="TENANT_VIEWER"
        )
        resp = await client.delete(CARD, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    async def test_other_tenant_cannot_delete(self, client, registered):
        """다른 사업체 관리자가 지워도 이 사업체 카드는 그대로 (RLS)."""
        await _status(registered["id"], "CANCELLED")
        tenant_id, user_id = uuid.uuid4(), uuid.uuid4()
        await _sql(
            "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
            " updated_at) VALUES (:id, 'other', :s, 'STANDARD', true, now(), now())",
            id=str(tenant_id),
            s=f"other-{tenant_id.hex[:8]}",
        )
        await _sql(
            "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
            " created_at, updated_at)"
            " VALUES (:id, :t, :e, 'x', 'TENANT_ADMIN', true, now(), now())",
            id=str(user_id),
            t=str(tenant_id),
            e=f"{user_id.hex[:8]}@example.com",
        )
        token = create_access_token(
            user_id=user_id, tenant_id=tenant_id, role="TENANT_ADMIN"
        )
        try:
            resp = await client.delete(
                CARD, headers={"Authorization": f"Bearer {token}"}
            )
            assert resp.status_code == 404
            row = await _sql(
                "SELECT billing_key FROM subscriptions WHERE tenant_id = :t",
                t=registered["id"],
            )
            assert row[0] is not None
        finally:
            await _sql("DELETE FROM users WHERE tenant_id = :t", t=str(tenant_id))
            await _sql("DELETE FROM tenants WHERE id = :t", t=str(tenant_id))

    async def test_register_again_after_delete(self, client, auth_headers, registered):
        await _status(registered["id"], "TRIAL")
        await client.delete(CARD, headers=auth_headers)
        resp = await client.post(
            "/api/v1/billing/register-card",
            headers=auth_headers,
            json={"auth_key": "ak", "customer_key": "ck2"},
        )
        assert resp.json()["data"]["has_card"] is True
