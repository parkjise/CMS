"""T-089 슈퍼 어드민 대시보드 API (SA-01)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_with_rls, get_super_admin
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.super_dashboard import DashboardResponse
from app.services import super_dashboard as svc

router = APIRouter(prefix="/dashboard", tags=["super-dashboard"])


@router.get("", response_model=ApiResponse[DashboardResponse])
async def get_dashboard(
    db: AsyncSession = Depends(get_db_with_rls),
    _: User = Depends(get_super_admin),
):
    data = await svc.get_dashboard(db)
    return ApiResponse.ok(DashboardResponse.model_validate(data))
