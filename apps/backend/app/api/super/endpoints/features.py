"""T-086 슈퍼 어드민 기능 플래그 API."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.deps import get_db_with_rls, get_super_admin
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.feature import (
    DeployRequest,
    DeployResponse,
    FeatureCreateRequest,
    FeatureListItem,
    FeatureListResponse,
    FeatureResponse,
    FeatureUpdateRequest,
    RollbackResponse,
    TenantFeatureItem,
    TenantFeatureListResponse,
    TenantFeatureToggleRequest,
)
from app.services import feature as svc

router = APIRouter(prefix="/features", tags=["super-features"])
# 테넌트별 기능 엔드포인트는 /tenants 하위 경로 (기획서 URL 규격 유지)
tenant_router = APIRouter(prefix="/tenants", tags=["super-features"])


@router.get("", response_model=ApiResponse[FeatureListResponse])
async def list_features(
    db: AsyncSession = Depends(get_db_with_rls),
    _: User = Depends(get_super_admin),
):
    items, total = await svc.list_features(db)
    return ApiResponse.ok(
        FeatureListResponse(
            items=[
                FeatureListItem(
                    **FeatureResponse.model_validate(f).model_dump(),
                    enabled_tenant_count=count,
                )
                for f, count in items
            ],
            total=total,
        )
    )


@router.post("", response_model=ApiResponse[FeatureResponse])
async def create_feature(
    body: FeatureCreateRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    feature = await svc.create_feature(db, **body.model_dump())
    await log_action(
        db,
        current_user,
        action="FEATURE_CREATED",
        target_type="feature",
        target_id=feature.id,
        after={"key": feature.key, "name": feature.name},
    )
    return ApiResponse.ok(FeatureResponse.model_validate(feature))


@router.patch("/{feature_id}", response_model=ApiResponse[FeatureResponse])
async def update_feature(
    feature_id: uuid.UUID,
    body: FeatureUpdateRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    changes = body.model_dump(exclude_unset=True)
    feature, before, after = await svc.update_feature(db, feature_id, changes)
    await log_action(
        db,
        current_user,
        action="FEATURE_UPDATED",
        target_type="feature",
        target_id=feature_id,
        before=_jsonable(before),
        after=_jsonable(after),
    )
    return ApiResponse.ok(FeatureResponse.model_validate(feature))


@router.post("/{feature_id}/deploy", response_model=ApiResponse[DeployResponse])
async def deploy_feature(
    feature_id: uuid.UUID,
    body: DeployRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    deployment, affected = await svc.deploy_feature(
        db,
        feature_id,
        deployment_type=body.deployment_type,
        target_plan=body.target_plan,
        target_tenants=body.target_tenants,
        rollout_percent=body.rollout_percent,
        actor_id=current_user.id,
        notes=body.notes,
    )
    await log_action(
        db,
        current_user,
        action="FEATURE_DEPLOYED",
        target_type="feature",
        target_id=feature_id,
        after={
            "deployment_type": body.deployment_type,
            "affected_count": affected,
        },
    )
    return ApiResponse.ok(
        DeployResponse(
            deployment_id=deployment.id,
            feature_id=feature_id,
            deployment_type=deployment.deployment_type,
            affected_count=affected,
        )
    )


@router.post(
    "/{feature_id}/rollback/{deployment_id}",
    response_model=ApiResponse[RollbackResponse],
)
async def rollback_deployment(
    feature_id: uuid.UUID,
    deployment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    deployment, affected = await svc.rollback_deployment(db, deployment_id)
    await log_action(
        db,
        current_user,
        action="DEPLOYMENT_ROLLBACK",
        target_type="feature_deployment",
        target_id=deployment_id,
        after={"affected_count": affected},
    )
    return ApiResponse.ok(
        RollbackResponse(deployment_id=deployment.id, affected_count=affected)
    )


@tenant_router.get(
    "/{tenant_id}/features", response_model=ApiResponse[TenantFeatureListResponse]
)
async def list_tenant_features(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    _: User = Depends(get_super_admin),
):
    rows = await svc.list_tenant_features(db, tenant_id)
    return ApiResponse.ok(
        TenantFeatureListResponse(
            tenant_id=tenant_id,
            items=[
                TenantFeatureItem(
                    feature_id=row.feature.id,
                    key=row.feature.key,
                    name=row.feature.name,
                    category=row.feature.category,
                    required_plan=row.feature.required_plan,
                    is_beta=row.feature.is_beta,
                    is_active=row.feature.is_active,
                    is_enabled=row.is_enabled,
                    enabled_at=row.enabled_at,
                )
                for row in rows
            ],
        )
    )


@tenant_router.patch(
    "/{tenant_id}/features/{feature_id}",
    response_model=ApiResponse[TenantFeatureItem],
)
async def toggle_tenant_feature(
    tenant_id: uuid.UUID,
    feature_id: uuid.UUID,
    body: TenantFeatureToggleRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    tf = await svc.toggle_feature(
        db,
        tenant_id,
        feature_id,
        body.is_enabled,
        actor_id=current_user.id,
        reason=body.override_reason,
    )
    await log_action(
        db,
        current_user,
        action="FEATURE_TOGGLED",
        target_type="tenant_feature",
        target_id=tenant_id,
        after={"feature_id": str(feature_id), "is_enabled": body.is_enabled},
    )
    feature = await svc._get_feature(db, feature_id)
    return ApiResponse.ok(
        TenantFeatureItem(
            feature_id=feature.id,
            key=feature.key,
            name=feature.name,
            category=feature.category,
            required_plan=feature.required_plan,
            is_beta=feature.is_beta,
            is_active=feature.is_active,
            is_enabled=tf.is_enabled,
            enabled_at=tf.enabled_at,
        )
    )


def _jsonable(d: dict) -> dict:
    """audit 로그 저장용 — datetime 등을 문자열로 직렬화."""
    out: dict = {}
    for k, v in d.items():
        out[k] = v.isoformat() if hasattr(v, "isoformat") else v
    return out
