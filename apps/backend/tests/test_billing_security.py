"""T-106 결제 보안 강화 테스트 (암호화·중복차단·rate limit·PCI)."""

import uuid

from sqlalchemy import text

from tests.conftest import _TestSession  # type: ignore


async def _cleanup(tenant_id: str) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        for tbl in ("payment_history", "subscriptions"):
            await s.execute(
                text(f"DELETE FROM {tbl} WHERE tenant_id = :t"), {"t": tenant_id}
            )
        await s.commit()


class TestEncryption:
    def test_encrypt_decrypt_roundtrip(self):
        from app.core.crypto import decrypt_secret, encrypt_secret, is_encrypted

        enc = encrypt_secret("billing_key_secret_123")
        assert is_encrypted(enc)
        assert enc != "billing_key_secret_123"
        assert decrypt_secret(enc) == "billing_key_secret_123"

    def test_plaintext_passthrough(self):
        from app.core.crypto import decrypt_secret, is_encrypted

        # 프리픽스 없는 값은 평문으로 간주(하위호환)
        assert not is_encrypted("plain_billing_key")
        assert decrypt_secret("plain_billing_key") == "plain_billing_key"


class TestBillingKeyStorage:
    async def test_register_card_stores_encrypted(
        self, client, auth_headers, test_tenant, test_user
    ):
        try:
            resp = await client.post(
                "/api/v1/billing/register-card",
                headers=auth_headers,
                json={"auth_key": "ak", "customer_key": "ck"},
            )
            assert resp.status_code == 200
            async with _TestSession() as s:
                await s.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                stored = (
                    await s.execute(
                        text(
                            "SELECT billing_key FROM subscriptions WHERE tenant_id = :t"
                        ),
                        {"t": test_tenant["id"]},
                    )
                ).scalar_one()
            assert stored.startswith("enc:v1:")  # 평문 미저장
        finally:
            await _cleanup(test_tenant["id"])


class TestDuplicateCharge:
    async def test_second_charge_blocked(self, test_tenant, test_user):
        import pytest
        from fastapi import HTTPException

        from app.services import payment as svc

        session = _TestSession()
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        try:
            # 결제 수단 등록(빌링키 STANDARD 금액)
            await svc.register_card(
                session,
                uuid.UUID(test_tenant["id"]),
                auth_key="ak",
                customer_key="ck",
                billing_email=None,
                billing_name=None,
            )
            await svc.change_plan(session, uuid.UUID(test_tenant["id"]), "STANDARD")
            first = await svc.manual_charge(session, uuid.UUID(test_tenant["id"]))
            assert first.status == "SUCCESS"

            with pytest.raises(HTTPException) as exc:
                await svc.manual_charge(session, uuid.UUID(test_tenant["id"]))
            assert exc.value.status_code == 429
        finally:
            await session.close()
            async with _TestSession() as s:
                await s.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                for tbl in ("payment_history", "plan_change_history", "subscriptions"):
                    await s.execute(
                        text(f"DELETE FROM {tbl} WHERE tenant_id = :t"),
                        {"t": test_tenant["id"]},
                    )
                await s.commit()


class TestRateLimit:
    async def test_register_card_rate_limited(
        self, client, auth_headers, test_tenant, test_user
    ):
        from app.api.v1.endpoints.billing import _limiter

        _limiter.enabled = True
        try:
            statuses = []
            for _ in range(6):
                r = await client.post(
                    "/api/v1/billing/register-card",
                    headers=auth_headers,
                    json={"auth_key": "ak", "customer_key": "ck"},
                )
                statuses.append(r.status_code)
            assert 429 in statuses  # 분당 5회 초과 → 차단
        finally:
            _limiter.enabled = False
            _limiter.reset()
            await _cleanup(test_tenant["id"])


class TestPciCompliance:
    def test_no_card_fields_in_models(self):
        from app.models.billing import PaymentHistory, Subscription

        sensitive = {"card_number", "cvv", "card_cvc", "card_pan", "pan"}
        for model in (Subscription, PaymentHistory):
            cols = {c.name for c in model.__table__.columns}
            assert sensitive.isdisjoint(cols), f"{model.__name__}에 카드정보 컬럼 존재"

    def test_register_card_schema_has_no_card_fields(self):
        from app.schemas.billing import RegisterCardRequest

        fields = set(RegisterCardRequest.model_fields.keys())
        assert "card_number" not in fields
        assert "cvv" not in fields
        # 토스 빌링키 발급용 토큰만 수신
        assert "auth_key" in fields and "customer_key" in fields
