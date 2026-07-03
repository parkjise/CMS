import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.deps import get_db_with_rls, get_super_admin
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.super_tenant import (
    AuditLogItem,
    AuditLogListResponse,
    ImpersonateResponse,
    ResetPasswordResponse,
    TenantCreateRequest,
    TenantCreateResponse,
    TenantDetailResponse,
    TenantListItem,
    TenantListResponse,
    TenantPlanUpdateRequest,
    TenantStatsResponse,
    TenantUpdateRequest,
)
from app.services import super_tenant as svc

router = APIRouter(prefix="/tenants", tags=["super-tenants"])


async def _detail(db: AsyncSession, tenant) -> TenantDetailResponse:
    emails = await svc._admin_emails(db, tenant.id)
    data = TenantDetailResponse.model_validate(tenant)
    data.admin_emails = emails
    return data


@router.get("", response_model=ApiResponse[TenantListResponse])
async def list_tenants(
    q: str | None = Query(None),
    plan_type: str | None = Query(None),
    template_type: str | None = Query(None),
    is_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_with_rls),
    _: User = Depends(get_super_admin),
):
    items, total = await svc.list_tenants(
        db,
        q=q,
        plan_type=plan_type,
        template_type=template_type,
        is_active=is_active,
        page=page,
        limit=limit,
    )
    return ApiResponse.ok(
        TenantListResponse(
            items=[TenantListItem.model_validate(t) for t in items],
            total=total,
            page=page,
            limit=limit,
        )
    )


@router.post("", response_model=ApiResponse[TenantCreateResponse])
async def create_tenant(
    body: TenantCreateRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    tenant = await svc.create_tenant(
        db,
        name=body.name,
        slug=body.slug,
        template_type=body.template_type,
        plan_type=body.plan_type,
        admin_email=body.admin_email,
        admin_password=body.admin_password,
    )
    await log_action(
        db,
        current_user,
        action="TENANT_CREATED",
        target_type="tenant",
        target_id=tenant.id,
        after={"slug": tenant.slug, "name": tenant.name},
    )
    detail = await _detail(db, tenant)
    return ApiResponse.ok(
        TenantCreateResponse(tenant=detail, admin_email=body.admin_email)
    )


@router.get("/{tenant_id}", response_model=ApiResponse[TenantDetailResponse])
async def get_tenant(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    _: User = Depends(get_super_admin),
):
    tenant = await svc._get_tenant(db, tenant_id)
    return ApiResponse.ok(await _detail(db, tenant))


@router.patch("/{tenant_id}", response_model=ApiResponse[TenantDetailResponse])
async def update_tenant(
    tenant_id: uuid.UUID,
    body: TenantUpdateRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    tenant, before, after = await svc.update_tenant(
        db,
        tenant_id,
        name=body.name,
        template_type=body.template_type,
        custom_domain=body.custom_domain,
        is_active=body.is_active,
    )
    await log_action(
        db,
        current_user,
        action="TENANT_UPDATED",
        target_type="tenant",
        target_id=tenant_id,
        before=before,
        after=after,
    )
    return ApiResponse.ok(await _detail(db, tenant))


@router.patch("/{tenant_id}/plan", response_model=ApiResponse[TenantDetailResponse])
async def change_plan(
    tenant_id: uuid.UUID,
    body: TenantPlanUpdateRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    tenant, before, after = await svc.change_plan(
        db, tenant_id, body.plan_type, body.plan_expires_at
    )
    await log_action(
        db,
        current_user,
        action="TENANT_PLAN_CHANGED",
        target_type="tenant",
        target_id=tenant_id,
        before=before,
        after=after,
    )
    return ApiResponse.ok(await _detail(db, tenant))


@router.delete("/{tenant_id}", response_model=ApiResponse[dict])
async def delete_tenant(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    await svc.soft_delete_tenant(db, tenant_id)
    await log_action(
        db,
        current_user,
        action="TENANT_DELETED",
        target_type="tenant",
        target_id=tenant_id,
    )
    return ApiResponse.ok({"deleted": True})


@router.post(
    "/{tenant_id}/reset-password",
    response_model=ApiResponse[ResetPasswordResponse],
)
async def reset_password(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    email, temp_password = await svc.reset_admin_password(db, tenant_id)
    await log_action(
        db,
        current_user,
        action="TENANT_PASSWORD_RESET",
        target_type="tenant",
        target_id=tenant_id,
    )
    return ApiResponse.ok(
        ResetPasswordResponse(admin_email=email, temporary_password=temp_password)
    )


@router.get("/{tenant_id}/stats", response_model=ApiResponse[TenantStatsResponse])
async def get_stats(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    _: User = Depends(get_super_admin),
):
    stats = await svc.get_stats(db, tenant_id)
    return ApiResponse.ok(TenantStatsResponse(**stats))


@router.get("/{tenant_id}/audit-logs", response_model=ApiResponse[AuditLogListResponse])
async def get_audit_logs(
    tenant_id: uuid.UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_with_rls),
    _: User = Depends(get_super_admin),
):
    items, total = await svc.list_audit_logs(db, tenant_id, page=page, limit=limit)
    return ApiResponse.ok(
        AuditLogListResponse(
            items=[AuditLogItem.model_validate(a) for a in items],
            total=total,
            page=page,
            limit=limit,
        )
    )


@router.post(
    "/{tenant_id}/impersonate", response_model=ApiResponse[ImpersonateResponse]
)
async def impersonate(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    token, redirect_url, expires_in = await svc.create_impersonate_token(db, tenant_id)
    await log_action(
        db,
        current_user,
        action="IMPERSONATE_START",
        target_type="tenant",
        target_id=tenant_id,
    )
    return ApiResponse.ok(
        ImpersonateResponse(
            impersonate_token=token,
            redirect_url=redirect_url,
            expires_in=expires_in,
        )
    )
