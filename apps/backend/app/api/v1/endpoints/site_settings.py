from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls, get_tenant_id
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.site import (
    MenuResponse,
    MenuTreeUpdate,
    PolicyAdminDocument,
    PolicyAdminResponse,
    PolicyDraftUpdate,
    PolicyKind,
    PolicyPublish,
    PolicyVersionDocument,
    SiteSettingsResponse,
    SiteSettingsUpdate,
)
from app.services import site_policy as policy_service
from app.services import site_settings as site_settings_service

# 사업체 공통 정보 (T-036-A, 기획서 AD-02-A 공통 설정)
router = APIRouter(prefix="/site-settings", tags=["site-settings"])


@router.get("", response_model=ApiResponse[SiteSettingsResponse | None])
async def get_site_settings(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    setting = await site_settings_service.get_site_settings(db)
    return ApiResponse.ok(
        SiteSettingsResponse.model_validate(setting) if setting else None
    )


@router.put("", response_model=ApiResponse[SiteSettingsResponse])
async def update_site_settings(
    body: SiteSettingsUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    setting = await site_settings_service.update_site_settings(db, tenant_id, body)
    return ApiResponse.ok(SiteSettingsResponse.model_validate(setting))


# ── 상단 메뉴 (T-036-B) ────────────────────────────────────────────────


@router.get("/menu", response_model=ApiResponse[MenuResponse])
async def get_menu(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return ApiResponse.ok(await site_settings_service.get_menu(db, tenant_id))


@router.put("/menu", response_model=ApiResponse[MenuResponse])
async def update_menu(
    body: MenuTreeUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    try:
        menu = await site_settings_service.update_menu(db, tenant_id, body)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return ApiResponse.ok(menu)


@router.delete("/menu", response_model=ApiResponse[MenuResponse])
async def reset_menu(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """지금 템플릿의 메뉴를 기본값으로 되돌린다 (T-223)"""
    return ApiResponse.ok(await site_settings_service.reset_menu(db, tenant_id))


# ── 이용약관 · 개인정보처리방침 (T-200) ─────────────────────────────────────


async def _tenant(db: AsyncSession, tenant_id: UUID) -> Tenant:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    return tenant


def _policy_error(e: policy_service.PolicyError) -> HTTPException:
    codes = {404: "NOT_FOUND", 409: "CONFLICT"}
    if e.status in codes:
        return HTTPException(status_code=e.status, detail=e.message)
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)


@router.get("/policies", response_model=ApiResponse[PolicyAdminResponse])
async def get_policies(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """두 문서 — 공개본(없으면 기본 문안) · 작업 중 버전 · 버전 이력 (T-224)."""
    tenant = await _tenant(db, tenant_id)
    return ApiResponse.ok(await policy_service.get_policies(db, tenant))


@router.post("/policies/{kind}/draft", response_model=ApiResponse[PolicyAdminDocument])
async def create_policy_draft(
    kind: PolicyKind,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """새 버전 — 공개본(없으면 기본 문안)을 복사한 초안."""
    tenant = await _tenant(db, tenant_id)
    try:
        doc = await policy_service.create_draft(db, tenant, kind, current_user.id)
    except policy_service.PolicyError as e:
        raise _policy_error(e) from e
    return ApiResponse.ok(doc)


@router.put("/policies/{kind}/draft", response_model=ApiResponse[PolicyAdminDocument])
async def update_policy_draft(
    kind: PolicyKind,
    data: PolicyDraftUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    tenant = await _tenant(db, tenant_id)
    try:
        doc = await policy_service.update_draft(
            db, tenant, kind, data.body, data.summary
        )
    except policy_service.PolicyError as e:
        raise _policy_error(e) from e
    return ApiResponse.ok(doc)


@router.post(
    "/policies/{kind}/publish", response_model=ApiResponse[PolicyAdminDocument]
)
async def publish_policy(
    kind: PolicyKind,
    data: PolicyPublish,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """바로 공개 또는 시행일 예약."""
    tenant = await _tenant(db, tenant_id)
    try:
        doc = await policy_service.publish(db, tenant, kind, data.effective_at)
    except policy_service.PolicyError as e:
        raise _policy_error(e) from e
    return ApiResponse.ok(doc)


@router.post(
    "/policies/{kind}/cancel-schedule",
    response_model=ApiResponse[PolicyAdminDocument],
)
async def cancel_policy_schedule(
    kind: PolicyKind,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """예약 취소 — 초안으로 돌아간다."""
    tenant = await _tenant(db, tenant_id)
    try:
        doc = await policy_service.cancel_schedule(db, tenant, kind)
    except policy_service.PolicyError as e:
        raise _policy_error(e) from e
    return ApiResponse.ok(doc)


@router.get(
    "/policies/{kind}/versions/{version}",
    response_model=ApiResponse[PolicyVersionDocument],
)
async def get_policy_version(
    kind: PolicyKind,
    version: int,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """버전 이력에서 본문 보기 — 초안 · 예약 포함."""
    tenant = await _tenant(db, tenant_id)
    doc = await policy_service.get_version(db, tenant, kind, version, public=False)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    return ApiResponse.ok(doc)
