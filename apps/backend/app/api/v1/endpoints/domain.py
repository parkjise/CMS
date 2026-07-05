"""T-100 테넌트 커스텀 도메인 API."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user, get_db_with_rls
from app.models.user import User
from app.schemas.billing import (
    DomainStatusResponse,
    RegisterDomainRequest,
    TenantDomainResponse,
)
from app.schemas.common import ApiResponse
from app.services import domain as svc

router = APIRouter(prefix="/domain", tags=["domain"])


def _with_guide(row) -> DomainStatusResponse:
    data = TenantDomainResponse.model_validate(row).model_dump()
    return DomainStatusResponse(**data, cname_target=settings.domain_cname_target)


@router.post("/register", response_model=ApiResponse[DomainStatusResponse])
async def register_domain(
    body: RegisterDomainRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    row = await svc.register_domain(
        db,
        current_user.tenant_id,
        domain=body.domain,
        domain_type=body.domain_type,
    )
    # 등록 직후 DNS 폴링 태스크 큐잉 (test 모드는 즉시 성공)
    _enqueue_dns_poll(row.id)
    return ApiResponse.ok(_with_guide(row))


@router.get("/status", response_model=ApiResponse[DomainStatusResponse])
async def get_domain_status(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    row = await svc.get_status(db, current_user.tenant_id)
    return ApiResponse.ok(_with_guide(row))


@router.post("/verify", response_model=ApiResponse[DomainStatusResponse])
async def verify_domain(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    row = await svc.verify_domain(db, current_user.tenant_id)
    return ApiResponse.ok(_with_guide(row))


@router.delete("", response_model=ApiResponse[dict])
async def remove_domain(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    await svc.remove_domain(db, current_user.tenant_id)
    return ApiResponse.ok({"removed": True})


def _enqueue_dns_poll(domain_id) -> None:
    try:
        from app.workers.domain import poll_domain_dns

        poll_domain_dns.delay(str(domain_id))
    except Exception:
        pass
