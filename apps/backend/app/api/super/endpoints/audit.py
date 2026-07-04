"""T-094 슈퍼 어드민 전체 감사 로그 조회 API."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_with_rls, get_super_admin
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.super_tenant import AuditLogItem, AuditLogListResponse
from app.services import super_tenant as svc

router = APIRouter(prefix="/audit-logs", tags=["super-audit"])


@router.get("", response_model=ApiResponse[AuditLogListResponse])
async def list_audit_logs(
    action: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_with_rls),
    _: User = Depends(get_super_admin),
):
    items, total = await svc.list_all_audit_logs(
        db, action=action, page=page, limit=limit
    )
    return ApiResponse.ok(
        AuditLogListResponse(
            items=[AuditLogItem.model_validate(a) for a in items],
            total=total,
            page=page,
            limit=limit,
        )
    )
