"""T-104 온보딩 자동화 통합 테스트 (6개 시나리오, test 모드 stub).

가입→환영메일 / 카드→결제→영수증 / 결제 3회 실패→중단 /
Trial 만료→카드→ACTIVE / 도메인 등록→활성화 / 해지→만료→삭제
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.core.security import create_access_token
from tests.conftest import _TestSession  # type: ignore


@pytest.fixture
async def super_headers() -> dict:
    user_id = uuid.uuid4()
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text(
                "INSERT INTO users "
                "(id, tenant_id, email, password_hash, role, is_active, "
                " created_at, updated_at) "
                "VALUES (:id, NULL, :email, 'x', 'SUPER_ADMIN', true, now(), now())"
            ),
            {"id": str(user_id), "email": f"sa-{uuid.uuid4().hex[:6]}@cms.io"},
        )
        await session.commit()
    token = create_access_token(
        user_id=user_id, tenant_id=None, role="SUPER_ADMIN", is_super_admin=True
    )
    yield {"Authorization": f"Bearer {token}"}
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("DELETE FROM users WHERE id = :id"), {"id": str(user_id)}
        )
        await session.commit()


@pytest.fixture
async def bypass_session():
    session = _TestSession()
    await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    yield session
    await session.close()


@pytest.fixture
def email_spy(monkeypatch):
    """환영/영수증 메일 enqueue(send_email_async.delay) 호출을 캡처한다."""
    calls: list[dict] = []
    from app.workers import email as email_worker

    def _fake_delay(to, subject, template, variables):
        calls.append({"to": to, "subject": subject, "template": template})

    monkeypatch.setattr(email_worker.send_email_async, "delay", _fake_delay)
    return calls


async def _cleanup_by_slug(slug: str) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await s.execute(
            text(
                "DELETE FROM subscriptions WHERE tenant_id IN "
                "(SELECT id FROM tenants WHERE slug = :s)"
            ),
            {"s": slug},
        )
        for tbl in ("sections", "users"):
            await s.execute(
                text(
                    f"DELETE FROM {tbl} WHERE tenant_id IN "
                    "(SELECT id FROM tenants WHERE slug = :s)"
                ),
                {"s": slug},
            )
        await s.execute(text("DELETE FROM tenants WHERE slug = :s"), {"s": slug})
        await s.commit()


async def _cleanup_by_tenant(tenant_id: str) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        for tbl in (
            "payment_history",
            "plan_change_history",
            "subscriptions",
            "tenant_domains",
        ):
            await s.execute(
                text(f"DELETE FROM {tbl} WHERE tenant_id = :t"), {"t": tenant_id}
            )
        await s.execute(
            text("UPDATE tenants SET custom_domain = NULL WHERE id = :t"),
            {"t": tenant_id},
        )
        await s.commit()


async def _trial_sub(session, tenant_id: str, **over):
    from app.models.billing import Subscription

    now = datetime.now(UTC)
    defaults = dict(
        id=uuid.uuid4(),
        tenant_id=uuid.UUID(tenant_id),
        plan_type="STANDARD",
        status="TRIAL",
        monthly_amount=89_000,
        trial_ends_at=now + timedelta(days=14),
        current_period_start=now,
        current_period_end=now + timedelta(days=14),
    )
    defaults.update(over)
    sub = Subscription(**defaults)
    session.add(sub)
    await session.commit()
    return sub


# ── S1: 가입 → 환영 메일 + Trial ───────────────────────────────────────────
async def test_s1_signup_welcome_and_trial(client, super_headers, email_spy):
    slug = f"onb-{uuid.uuid4().hex[:6]}"
    try:
        resp = await client.post(
            "/api/super/v1/tenants",
            headers=super_headers,
            json={
                "name": "온보딩샵",
                "slug": slug,
                "template_type": "GENERAL",
                "plan_type": "STANDARD",
                "admin_email": f"owner-{slug}@x.com",
                "admin_password": "password123",
            },
        )
        assert resp.status_code == 200
        tenant_id = resp.json()["data"]["tenant"]["id"]

        # Trial 구독 자동 생성
        async with _TestSession() as s:
            await s.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            status = (
                await s.execute(
                    text("SELECT status FROM subscriptions WHERE tenant_id = :t"),
                    {"t": tenant_id},
                )
            ).scalar_one()
        assert status == "TRIAL"

        # 환영 메일 enqueue
        assert any(c["template"] == "welcome" for c in email_spy)
    finally:
        await _cleanup_by_slug(slug)


# ── S2: 카드 등록 → 자동 결제 → 영수증 ──────────────────────────────────────
async def test_s2_card_charge_receipt(
    client, auth_headers, test_tenant, test_user, bypass_session, email_spy
):
    from app.services import payment as pay

    try:
        reg = await client.post(
            "/api/v1/billing/register-card",
            headers=auth_headers,
            json={
                "auth_key": "ak",
                "customer_key": "ck",
                "billing_email": "pay@x.com",
                "billing_name": "홍길동",
            },
        )
        assert reg.status_code == 200
        # STANDARD로 변경(금액 > 0)하여 결제 진행
        await client.post(
            "/api/v1/billing/change-plan",
            headers=auth_headers,
            json={"to_plan": "STANDARD"},
        )
        payment = await pay.manual_charge(bypass_session, uuid.UUID(test_tenant["id"]))
        assert payment.status == "SUCCESS"

        hist = await client.get("/api/v1/billing/history", headers=auth_headers)
        assert hist.json()["data"]["items"][0]["status"] == "SUCCESS"
        assert any(c["template"] == "payment_receipt" for c in email_spy)
    finally:
        await _cleanup_by_tenant(test_tenant["id"])


# ── S3: 결제 3회 실패 → 서비스 중단 ─────────────────────────────────────────
async def test_s3_three_failures_suspend(test_tenant, bypass_session):
    from app.models.billing import PaymentHistory, Subscription
    from app.workers import billing as worker

    try:
        sub = await _trial_sub(
            bypass_session,
            test_tenant["id"],
            status="PAST_DUE",
            billing_key=None,
        )
        for _ in range(3):
            bypass_session.add(
                PaymentHistory(
                    id=uuid.uuid4(),
                    tenant_id=uuid.UUID(test_tenant["id"]),
                    subscription_id=sub.id,
                    order_id=f"f-{uuid.uuid4().hex[:8]}",
                    amount=89_000,
                    status="FAILED",
                )
            )
        await bypass_session.commit()

        result = await worker._retry_billing()
        assert result["suspended"] >= 1
        async with _TestSession() as s:
            await s.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            fresh = await s.get(Subscription, sub.id)
            assert fresh.status == "SUSPENDED"
    finally:
        await _cleanup_by_tenant(test_tenant["id"])


# ── S4: Trial 만료 → 카드 없음 SUSPENDED → 카드 등록 ACTIVE ──────────────────
async def test_s4_trial_expire_then_reactivate(
    client, auth_headers, test_tenant, test_user, bypass_session
):
    from app.models.billing import Subscription
    from app.workers import billing as worker

    try:
        sub = await _trial_sub(
            bypass_session,
            test_tenant["id"],
            billing_key=None,
            trial_ends_at=datetime.now(UTC) - timedelta(hours=1),
        )
        # 만료 처리 → 카드 없음 → SUSPENDED
        await worker._process_trial_expirations()
        async with _TestSession() as s:
            await s.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            fresh = await s.get(Subscription, sub.id)
            assert fresh.status == "SUSPENDED"

        # 카드 등록 → ACTIVE 복귀
        reg = await client.post(
            "/api/v1/billing/register-card",
            headers=auth_headers,
            json={"auth_key": "ak", "customer_key": "ck"},
        )
        assert reg.status_code == 200
        assert reg.json()["data"]["status"] == "ACTIVE"
    finally:
        await _cleanup_by_tenant(test_tenant["id"])


# ── S5: 도메인 등록 → 검증 → ACTIVE ─────────────────────────────────────────
async def test_s5_domain_activation(client, auth_headers, test_tenant, test_user):
    try:
        dom = f"www.{uuid.uuid4().hex[:8]}.com"
        await client.post(
            "/api/v1/domain/register",
            headers=auth_headers,
            json={"domain": dom, "domain_type": "CUSTOM"},
        )
        verify = await client.post("/api/v1/domain/verify", headers=auth_headers)
        assert verify.status_code == 200
        assert verify.json()["data"]["status"] == "ACTIVE"

        async with _TestSession() as s:
            await s.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            cd = (
                await s.execute(
                    text("SELECT custom_domain FROM tenants WHERE id = :t"),
                    {"t": test_tenant["id"]},
                )
            ).scalar_one()
        assert cd == dom
    finally:
        await _cleanup_by_tenant(test_tenant["id"])


# ── S6: 해지 → 만료(30일 경과) → 데이터 삭제 ────────────────────────────────
async def test_s6_cancel_then_delete(
    client, auth_headers, test_tenant, test_user, bypass_session
):
    from app.workers import billing as worker

    try:
        await _trial_sub(bypass_session, test_tenant["id"], status="ACTIVE")
        # 해지
        cancel = await client.post(
            "/api/v1/billing/cancel", headers=auth_headers, json={"reason": "종료"}
        )
        assert cancel.json()["data"]["status"] == "CANCELLED"

        # 해지 31일 경과로 조정
        async with _TestSession() as s:
            await s.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await s.execute(
                text("UPDATE subscriptions SET cancelled_at = :c WHERE tenant_id = :t"),
                {
                    "c": datetime.now(UTC) - timedelta(days=31),
                    "t": test_tenant["id"],
                },
            )
            await s.commit()

        deleted = await worker._delete_cancelled_tenant_data()
        assert deleted >= 1
        async with _TestSession() as s:
            await s.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            del_at = (
                await s.execute(
                    text("SELECT deleted_at FROM tenants WHERE id = :t"),
                    {"t": test_tenant["id"]},
                )
            ).scalar_one()
        assert del_at is not None
    finally:
        await _cleanup_by_tenant(test_tenant["id"])
