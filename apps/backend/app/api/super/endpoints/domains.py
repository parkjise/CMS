"""T-100 슈퍼 어드민 도메인 관리 API."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.deps import get_db_with_rls, get_super_admin
from app.models.user import User
from app.schemas.billing import DomainListResponse, TenantDomainResponse
from app.schemas.common import ApiResponse
from app.services import domain as svc

router = APIRouter(prefix="/domains", tags=["super-domains"])


@router.get("", response_model=ApiResponse[DomainListResponse])
async def list_domains(
    db: AsyncSession = Depends(get_db_with_rls),
    _: User = Depends(get_super_admin),
):
    rows = await svc.list_domains(db)
    return ApiResponse.ok(
        DomainListResponse(
            items=[TenantDomainResponse.model_validate(r) for r in rows],
            total=len(rows),
        )
    )


@router.post("/{domain_id}/ssl-renew", response_model=ApiResponse[TenantDomainResponse])
async def renew_ssl(
    domain_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    row = await svc.renew_ssl(db, domain_id)
    await log_action(
        db,
        current_user,
        action="DOMAIN_SSL_RENEWED",
        target_type="tenant_domain",
        target_id=domain_id,
    )
    return ApiResponse.ok(TenantDomainResponse.model_validate(row))
