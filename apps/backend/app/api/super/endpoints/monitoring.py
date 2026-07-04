"""T-093 슈퍼 어드민 모니터링/수익 API."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_with_rls, get_super_admin
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.super_monitoring import MonitoringResponse, RevenueResponse
from app.services import super_monitoring as svc

router = APIRouter(tags=["super-monitoring"])


@router.get("/monitoring", response_model=ApiResponse[MonitoringResponse])
async def get_monitoring(
    db: AsyncSession = Depends(get_db_with_rls),
    _: User = Depends(get_super_admin),
):
    data = await svc.get_monitoring(db)
    return ApiResponse.ok(MonitoringResponse.model_validate(data))


@router.get("/revenue", response_model=ApiResponse[RevenueResponse])
async def get_revenue(
    months: int = Query(6, ge=3, le=12),
    db: AsyncSession = Depends(get_db_with_rls),
    _: User = Depends(get_super_admin),
):
    data = await svc.get_revenue(db, months=months)
    return ApiResponse.ok(RevenueResponse.model_validate(data))
