"""사업체 변경 기록 조회 (T-186) — 자기 사업체 것만, 보기 전용 계정도 읽는다."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls, get_tenant_id
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.tenant_audit import TenantAuditItem, TenantAuditListResponse
from app.services import tenant_audit as svc

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("", response_model=ApiResponse[TenantAuditListResponse])
async def list_audit_logs(
    kind: Literal["board", "post", "setup"] | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_with_rls),
    _: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    entries, total = await svc.list_entries(
        db, tenant_id, kind=kind, page=page, limit=limit
    )
    return ApiResponse.ok(
        TenantAuditListResponse(
            items=[TenantAuditItem.model_validate(e) for e in entries],
            total=total,
            page=page,
            limit=limit,
        )
    )
