"""T-103 슈퍼 어드민 결제 현황 집계 + 수동 결제/환불."""

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import PaymentHistory, Subscription
from app.models.tenant import Tenant
from app.services import payment as payment_service


async def get_overview(db: AsyncSession) -> dict:
    """결제 현황: MRR·연체·해지·신규 수 + 연체 테넌트 목록."""
    now = datetime.now(UTC)
    month_first = datetime(now.year, now.month, 1, tzinfo=UTC)

    # MRR = ACTIVE 구독 월요금 합
    mrr = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(Subscription.monthly_amount), 0)).where(
                    Subscription.status == "ACTIVE"
                )
            )
        ).scalar_one()
    )

    async def _count(*conditions) -> int:
        return int(
            (
                await db.execute(
                    select(func.count()).select_from(Subscription).where(*conditions)
                )
            ).scalar_one()
        )

    past_due_count = await _count(Subscription.status == "PAST_DUE")
    cancelled_count = await _count(Subscription.status == "CANCELLED")
    new_this_month = await _count(Subscription.created_at >= month_first)

    # 연체 테넌트 목록 (tenant 조인)
    rows = (
        await db.execute(
            select(
                Subscription.id,
                Subscription.tenant_id,
                Subscription.plan_type,
                Subscription.monthly_amount,
                Tenant.name,
            )
            .join(Tenant, Tenant.id == Subscription.tenant_id)
            .where(Subscription.status == "PAST_DUE")
            .order_by(Subscription.current_period_end)
        )
    ).all()
    past_due_tenants = [
        {
            "subscription_id": sid,
            "tenant_id": tid,
            "name": name,
            "plan_type": plan,
            "amount": amount,
        }
        for sid, tid, plan, amount, name in rows
    ]

    return {
        "mrr": mrr,
        "past_due_count": past_due_count,
        "cancelled_count": cancelled_count,
        "new_this_month": new_this_month,
        "past_due_tenants": past_due_tenants,
    }


async def manual_charge(db: AsyncSession, tenant_id: uuid.UUID) -> PaymentHistory:
    """연체 테넌트 즉시 결제."""
    return await payment_service.manual_charge(db, tenant_id)


async def refund(
    db: AsyncSession, payment_id: uuid.UUID, reason: str | None = None
) -> PaymentHistory:
    """결제 환불: 토스 취소 + payment_history.status=REFUNDED."""
    payment = await db.get(PaymentHistory, payment_id)
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="결제 내역을 찾을 수 없습니다.",
        )
    if payment.status != "SUCCESS":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="성공한 결제만 환불할 수 있습니다.",
        )
    if payment.payment_key:
        await payment_service.cancel_payment(
            payment.payment_key, reason or "관리자 환불"
        )
    payment.status = "REFUNDED"
    payment.failure_reason = reason
    await db.commit()
    await db.refresh(payment)
    return payment
