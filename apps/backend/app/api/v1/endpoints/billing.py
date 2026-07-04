"""T-096 테넌트 결제 API."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls
from app.models.user import User
from app.schemas.billing import (
    CancelSubscriptionRequest,
    ChangePlanRequest,
    PaymentHistoryItem,
    PaymentHistoryListResponse,
    RegisterCardRequest,
    SubscriptionResponse,
)
from app.schemas.common import ApiResponse
from app.services import payment as svc

router = APIRouter(prefix="/billing", tags=["billing"])


@router.post("/register-card", response_model=ApiResponse[SubscriptionResponse])
async def register_card(
    body: RegisterCardRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    sub = await svc.register_card(
        db,
        current_user.tenant_id,
        auth_key=body.auth_key,
        customer_key=body.customer_key,
        billing_email=body.billing_email,
        billing_name=body.billing_name,
    )
    return ApiResponse.ok(SubscriptionResponse.model_validate(sub))


@router.get("/subscription", response_model=ApiResponse[SubscriptionResponse])
async def get_subscription(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    sub = await svc.get_subscription(db, current_user.tenant_id)
    return ApiResponse.ok(SubscriptionResponse.model_validate(sub))


@router.get("/history", response_model=ApiResponse[PaymentHistoryListResponse])
async def get_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    items, total = await svc.list_payments(
        db, current_user.tenant_id, page=page, limit=limit
    )
    return ApiResponse.ok(
        PaymentHistoryListResponse(
            items=[PaymentHistoryItem.model_validate(p) for p in items],
            total=total,
        )
    )


@router.post("/cancel", response_model=ApiResponse[SubscriptionResponse])
async def cancel_subscription(
    body: CancelSubscriptionRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    sub = await svc.cancel_subscription(db, current_user.tenant_id, body.reason)
    return ApiResponse.ok(SubscriptionResponse.model_validate(sub))


@router.post("/change-plan", response_model=ApiResponse[SubscriptionResponse])
async def change_plan(
    body: ChangePlanRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    sub = await svc.change_plan(
        db,
        current_user.tenant_id,
        body.to_plan,
        reason=body.reason,
        changed_by=current_user.id,
    )
    return ApiResponse.ok(SubscriptionResponse.model_validate(sub))
