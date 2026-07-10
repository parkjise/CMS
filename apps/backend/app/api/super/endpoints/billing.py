"""T-103 슈퍼 어드민 결제 현황 API (SA-06)."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.deps import get_db_with_rls, get_super_admin
from app.models.user import User
from app.schemas.billing import (
    BillingOverviewResponse,
    PaymentHistoryItem,
    RefundRequest,
)
from app.schemas.common import ApiResponse
from app.services import super_billing as svc

router = APIRouter(prefix="/billing", tags=["super-billing"])


@router.get("/overview", response_model=ApiResponse[BillingOverviewResponse])
async def get_overview(
    db: AsyncSession = Depends(get_db_with_rls),
    _: User = Depends(get_super_admin),
):
    data = await svc.get_overview(db)
    return ApiResponse.ok(BillingOverviewResponse.model_validate(data))


@router.post(
    "/manual-charge/{tenant_id}", response_model=ApiResponse[PaymentHistoryItem]
)
async def manual_charge(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    payment = await svc.manual_charge(db, tenant_id)
    await log_action(
        db,
        current_user,
        action="MANUAL_CHARGE",
        target_type="tenant",
        target_id=tenant_id,
        after={"status": payment.status, "amount": payment.amount},
    )
    return ApiResponse.ok(PaymentHistoryItem.model_validate(payment))


@router.post("/refund/{payment_id}", response_model=ApiResponse[PaymentHistoryItem])
async def refund(
    payment_id: uuid.UUID,
    body: RefundRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    payment = await svc.refund(db, payment_id, body.reason)
    await log_action(
        db,
        current_user,
        action="REFUND",
        target_type="payment",
        target_id=payment_id,
        after={"amount": payment.amount},
    )
    return ApiResponse.ok(PaymentHistoryItem.model_validate(payment))
