"""T-096 토스페이먼츠 정기결제 서비스.

test 모드(`settings.payment_mode != "live"`)에서는 외부 API 호출 없이 결정적
stub을 반환한다. 실제 결제는 live 모드에서만 일어난다.

토스 래퍼 + 구독/결제 오케스트레이션(빌링키 등록·자동결제·해지·플랜변경)을 제공한다.
정기결제 Celery 태스크(T-097)와 웹훅에서 재사용한다.
"""

import uuid
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.models.billing import PaymentHistory, PlanChangeHistory, Subscription
from app.models.tenant import Tenant

TOSS_BASE_URL = "https://api.tosspayments.com/v1"

# 동일 테넌트 중복 결제 차단 창(초) — 수동 결제 더블클릭/재요청 방지
DUPLICATE_CHARGE_WINDOW_SECONDS = 60

# 플랜별 월 요금 (원)
PLAN_MONTHLY_PRICE: dict[str, int] = {
    "FREE": 0,
    "BASIC": 39_000,
    "STANDARD": 89_000,
    "PREMIUM": 129_000,
}

PERIOD_DAYS = 30


class PaymentError(RuntimeError):
    """결제 관련 일반 에러."""


def _is_live() -> bool:
    return settings.payment_mode == "live"


# ── 토스 API 래퍼 ─────────────────────────────────────────────────────────
async def issue_billing_key(customer_key: str, auth_key: str) -> str:
    """빌링키 발급 (카드 등록)."""
    if not _is_live():
        return f"billing_test_{customer_key}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{TOSS_BASE_URL}/billing/authorizations/issue",
            auth=(settings.toss_secret_key, ""),
            json={"authKey": auth_key, "customerKey": customer_key},
        )
    data = resp.json()
    if resp.status_code not in (200, 201) or "billingKey" not in data:
        raise PaymentError(data.get("message", "빌링키 발급 실패"))
    return data["billingKey"]


async def charge_billing(
    billing_key: str,
    customer_key: str,
    amount: int,
    order_id: str,
    order_name: str,
) -> dict:
    """빌링키로 자동 결제 실행. 성공 시 status=DONE."""
    if not _is_live():
        return {
            "paymentKey": f"pay_test_{order_id}",
            "orderId": order_id,
            "status": "DONE",
            "totalAmount": amount,
            "approvedAt": datetime.now(UTC).isoformat(),
            "receipt": {
                "url": f"https://dashboard.tosspayments.com/receipt/{order_id}"
            },
        }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{TOSS_BASE_URL}/billing/{billing_key}",
            auth=(settings.toss_secret_key, ""),
            json={
                "customerKey": customer_key,
                "amount": amount,
                "orderId": order_id,
                "orderName": order_name,
            },
        )
    return resp.json()


async def cancel_payment(payment_key: str, reason: str) -> dict:
    """결제 취소(환불)."""
    if not _is_live():
        return {"paymentKey": payment_key, "status": "CANCELED", "cancelReason": reason}

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{TOSS_BASE_URL}/payments/{payment_key}/cancel",
            auth=(settings.toss_secret_key, ""),
            json={"cancelReason": reason},
        )
    return resp.json()


async def get_payment_status(payment_key: str) -> dict:
    """결제 상태 조회."""
    if not _is_live():
        return {"paymentKey": payment_key, "status": "DONE"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/payments/{payment_key}",
            auth=(settings.toss_secret_key, ""),
        )
    return resp.json()


# ── 구독/결제 오케스트레이션 ───────────────────────────────────────────────
async def _get_subscription(
    db: AsyncSession, tenant_id: uuid.UUID
) -> Subscription | None:
    return (
        await db.execute(
            select(Subscription).where(Subscription.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()


async def _tenant_plan(db: AsyncSession, tenant_id: uuid.UUID) -> str:
    plan = (
        await db.execute(select(Tenant.plan_type).where(Tenant.id == tenant_id))
    ).scalar_one_or_none()
    return plan or "BASIC"


async def register_card(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    auth_key: str,
    customer_key: str,
    billing_email: str | None,
    billing_name: str | None,
) -> Subscription:
    """빌링키 발급 후 구독에 저장(없으면 생성)."""
    billing_key = await issue_billing_key(customer_key, auth_key)
    now = datetime.now(UTC)
    sub = await _get_subscription(db, tenant_id)
    plan = await _tenant_plan(db, tenant_id)
    amount = PLAN_MONTHLY_PRICE.get(plan, 0)

    if sub is None:
        sub = Subscription(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            plan_type=plan,
            status="ACTIVE",
            monthly_amount=amount,
            current_period_start=now,
            current_period_end=now + timedelta(days=PERIOD_DAYS),
        )
        db.add(sub)

    # 빌링키는 암호화하여 저장 (T-106)
    sub.billing_key = encrypt_secret(billing_key)
    sub.billing_email = billing_email
    sub.billing_name = billing_name
    if sub.status in ("CANCELLED", "SUSPENDED", "PAST_DUE"):
        sub.status = "ACTIVE"
    await db.commit()
    await db.refresh(sub)
    return sub


async def start_trial(
    db: AsyncSession, tenant_id: uuid.UUID, plan_type: str = "STANDARD"
) -> Subscription:
    """신규 테넌트 무료 체험 구독 생성 (카드 없이 전 기능, 14일)."""
    if await _get_subscription(db, tenant_id) is not None:
        return await get_subscription(db, tenant_id)
    now = datetime.now(UTC)
    trial_ends = now + timedelta(days=settings.trial_days)
    sub = Subscription(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        plan_type=plan_type,
        status="TRIAL",
        monthly_amount=PLAN_MONTHLY_PRICE.get(plan_type, 0),
        trial_ends_at=trial_ends,
        current_period_start=now,
        current_period_end=trial_ends,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


async def get_subscription(db: AsyncSession, tenant_id: uuid.UUID) -> Subscription:
    sub = await _get_subscription(db, tenant_id)
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="구독 정보가 없습니다."
        )
    return sub


async def list_payments(
    db: AsyncSession, tenant_id: uuid.UUID, *, page: int = 1, limit: int = 20
) -> tuple[list[PaymentHistory], int]:
    total = int(
        (
            await db.execute(
                select(func.count())
                .select_from(PaymentHistory)
                .where(PaymentHistory.tenant_id == tenant_id)
            )
        ).scalar_one()
    )
    rows = (
        (
            await db.execute(
                select(PaymentHistory)
                .where(PaymentHistory.tenant_id == tenant_id)
                .order_by(PaymentHistory.created_at.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return list(rows), total


async def cancel_subscription(
    db: AsyncSession, tenant_id: uuid.UUID, reason: str | None = None
) -> Subscription:
    sub = await get_subscription(db, tenant_id)
    sub.status = "CANCELLED"
    sub.cancelled_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(sub)
    return sub


async def change_plan(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    to_plan: str,
    *,
    reason: str | None = None,
    changed_by: uuid.UUID | None = None,
) -> Subscription:
    if to_plan not in PLAN_MONTHLY_PRICE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="알 수 없는 플랜입니다."
        )
    sub = await get_subscription(db, tenant_id)
    from_plan = sub.plan_type
    if from_plan == to_plan:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="이미 해당 플랜입니다."
        )

    sub.plan_type = to_plan
    sub.monthly_amount = PLAN_MONTHLY_PRICE[to_plan]
    db.add(
        PlanChangeHistory(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            from_plan=from_plan,
            to_plan=to_plan,
            changed_by=changed_by,
            reason=reason,
            effective_at=datetime.now(UTC),
        )
    )
    # 테넌트 플랜도 동기화
    await db.execute(
        Tenant.__table__.update()
        .where(Tenant.id == tenant_id)
        .values(plan_type=to_plan)
    )
    await db.commit()
    await db.refresh(sub)
    return sub


async def charge_subscription(
    db: AsyncSession, sub: Subscription, *, order_id: str | None = None
) -> PaymentHistory:
    """구독 자동 결제 실행 + 이력 기록. 정기결제/수동결제 공용."""
    now = datetime.now(UTC)
    oid = order_id or f"SUB-{sub.tenant_id}-{now.strftime('%Y%m%d%H%M%S')}"
    order_name = f"CMS {sub.plan_type} 플랜 월 구독"

    payment = PaymentHistory(
        id=uuid.uuid4(),
        tenant_id=sub.tenant_id,
        subscription_id=sub.id,
        order_id=oid,
        amount=sub.monthly_amount,
        status="FAILED",
    )
    try:
        if not sub.billing_key:
            raise PaymentError("등록된 결제 수단이 없습니다.")
        result = await charge_billing(
            billing_key=decrypt_secret(sub.billing_key),
            customer_key=str(sub.tenant_id),
            amount=sub.monthly_amount,
            order_id=oid,
            order_name=order_name,
        )
        if result.get("status") == "DONE":
            payment.status = "SUCCESS"
            payment.payment_key = result.get("paymentKey")
            payment.receipt_url = (result.get("receipt") or {}).get("url")
            payment.paid_at = now
            # 다음 결제 주기로 이동
            sub.current_period_start = now
            sub.current_period_end = now + timedelta(days=PERIOD_DAYS)
            if sub.status == "PAST_DUE":
                sub.status = "ACTIVE"
        else:
            payment.status = "FAILED"
            payment.failure_reason = result.get("message", "결제 실패")
            sub.status = "PAST_DUE"
    except (PaymentError, httpx.HTTPError) as exc:
        payment.status = "FAILED"
        payment.failure_reason = str(exc)
        sub.status = "PAST_DUE"

    db.add(payment)
    await db.commit()
    await db.refresh(payment)

    # 결제 성공 시 영수증 이메일 발송 (T-098). 브로커 미가용 시에도 결제를 막지 않는다.
    if payment.status == "SUCCESS" and sub.billing_email:
        _enqueue_email(
            to=sub.billing_email,
            subject="[CMS] 결제 영수증",
            template="payment_receipt",
            variables={
                "tenant_name": sub.billing_name or sub.plan_type,
                "plan_type": sub.plan_type,
                "order_id": payment.order_id,
                "amount": f"{payment.amount:,}",
                "paid_at": now.isoformat(),
                "receipt_url": payment.receipt_url,
            },
        )
    return payment


def _enqueue_email(*, to: str, subject: str, template: str, variables: dict) -> None:
    try:
        from app.workers.email import send_email_async

        send_email_async.delay(to, subject, template, variables)
    except Exception:
        pass


async def manual_charge(db: AsyncSession, tenant_id: uuid.UUID) -> PaymentHistory:
    sub = await get_subscription(db, tenant_id)
    await _guard_duplicate_charge(db, tenant_id)
    return await charge_subscription(db, sub)


async def _guard_duplicate_charge(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    """단기간(60초) 내 동일 테넌트 성공 결제가 있으면 중복으로 차단한다 (T-106)."""
    since = datetime.now(UTC) - timedelta(seconds=DUPLICATE_CHARGE_WINDOW_SECONDS)
    recent = (
        await db.execute(
            select(func.count())
            .select_from(PaymentHistory)
            .where(
                PaymentHistory.tenant_id == tenant_id,
                PaymentHistory.status == "SUCCESS",
                PaymentHistory.paid_at.isnot(None),
                PaymentHistory.paid_at >= since,
            )
        )
    ).scalar_one()
    if recent:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="단기간 내 중복 결제가 감지되어 차단되었습니다.",
        )
