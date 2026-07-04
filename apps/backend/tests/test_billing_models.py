"""T-095 결제/도메인 모델 스키마 검증 (삽입 + RLS 격리)."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from tests.conftest import _TestSession  # type: ignore


async def _bypass():
    session = _TestSession()
    await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    return session




class TestBillingModels:
    async def test_subscription_insert_and_query(self, test_tenant: dict):
        from app.models.billing import Subscription

        session = await _bypass()
        try:
            now = datetime.now(UTC)
            sub = Subscription(
                tenant_id=uuid.UUID(test_tenant["id"]),
                plan_type="STANDARD",
                status="ACTIVE",
                monthly_amount=89_000,
                current_period_start=now,
                current_period_end=now + timedelta(days=30),
            )
            session.add(sub)
            await session.commit()
            fetched = await session.get(Subscription, sub.id)
            assert fetched is not None
            assert fetched.status == "ACTIVE"
            assert fetched.monthly_amount == 89_000
        finally:
            await session.execute(
                text("DELETE FROM subscriptions WHERE tenant_id = :t"),
                {"t": test_tenant["id"]},
            )
            await session.commit()
            await session.close()

    async def test_payment_history_and_domain_insert(self, test_tenant: dict):
        from app.models.billing import PaymentHistory, Subscription
        from app.models.domain import TenantDomain

        session = await _bypass()
        try:
            now = datetime.now(UTC)
            sub = Subscription(
                tenant_id=uuid.UUID(test_tenant["id"]),
                plan_type="BASIC",
                monthly_amount=39_000,
                current_period_start=now,
                current_period_end=now + timedelta(days=30),
            )
            session.add(sub)
            await session.flush()

            session.add(
                PaymentHistory(
                    tenant_id=uuid.UUID(test_tenant["id"]),
                    subscription_id=sub.id,
                    order_id=f"order-{uuid.uuid4().hex[:10]}",
                    amount=39_000,
                    status="SUCCESS",
                )
            )
            session.add(
                TenantDomain(
                    tenant_id=uuid.UUID(test_tenant["id"]),
                    domain=f"{uuid.uuid4().hex[:8]}.example.com",
                    domain_type="CUSTOM",
                    status="PENDING",
                )
            )
            await session.commit()
        finally:
            await session.execute(
                text("DELETE FROM payment_history WHERE tenant_id = :t"),
                {"t": test_tenant["id"]},
            )
            await session.execute(
                text("DELETE FROM tenant_domains WHERE tenant_id = :t"),
                {"t": test_tenant["id"]},
            )
            await session.execute(
                text("DELETE FROM subscriptions WHERE tenant_id = :t"),
                {"t": test_tenant["id"]},
            )
            await session.commit()
            await session.close()

    async def test_rls_policies_exist(self):
        """4개 테이블 모두 tenant_isolation RLS 정책이 적용돼야 한다."""
        session = await _bypass()
        try:
            rows = await session.execute(
                text(
                    "SELECT tablename FROM pg_policies "
                    "WHERE tablename IN ('subscriptions', 'payment_history', "
                    "'plan_change_history', 'tenant_domains')"
                )
            )
            covered = {r[0] for r in rows.all()}
            assert covered == {
                "subscriptions",
                "payment_history",
                "plan_change_history",
                "tenant_domains",
            }
        finally:
            await session.close()
