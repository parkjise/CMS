"""T-086 기능 플래그 서비스.

- 테넌트별 활성 기능 조회 (Redis 5분 캐시)
- 개별 토글 / 배포(GLOBAL·PLAN_BASED·SELECTIVE·GRADUAL) / 롤백
- 쓰기 작업 시 영향 테넌트 캐시 무효화 (CLAUDE.md 섹션 8.3)
"""

import json
import math
import random
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.models.feature import Feature, FeatureDeployment, TenantFeature
from app.models.tenant import Tenant

CACHE_TTL = 300  # 5분


@dataclass
class TenantFeatureItemRow:
    """슈퍼 어드민 테넌트별 기능 조회 결과 행."""

    feature: Feature
    is_enabled: bool
    enabled_at: datetime | None


def _cache_key(tenant_id: uuid.UUID | str) -> str:
    return f"features:{tenant_id}"


async def invalidate_cache(*tenant_ids: uuid.UUID | str) -> None:
    if not tenant_ids:
        return
    redis = await get_redis()
    await redis.delete(*[_cache_key(tid) for tid in tenant_ids])


# ── 테넌트용 조회 (캐시) ─────────────────────────────────────────────────
async def get_tenant_features(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    """활성 기능 목록 + flags 맵 반환. Redis 5분 캐시.

    반환 형태: {"features": [...메뉴 메타...], "flags": {key: bool, ...}}
    """
    redis = await get_redis()
    cached = await redis.get(_cache_key(tenant_id))
    if cached:
        return json.loads(cached)

    rows = (
        await db.execute(
            select(Feature, TenantFeature.is_enabled)
            .outerjoin(
                TenantFeature,
                and_(
                    TenantFeature.feature_id == Feature.id,
                    TenantFeature.tenant_id == tenant_id,
                ),
            )
            .where(Feature.is_active.is_(True))
            .order_by(Feature.menu_position, Feature.created_at)
        )
    ).all()

    flags: dict[str, bool] = {}
    features: list[dict] = []
    for feature, is_enabled in rows:
        enabled = bool(is_enabled)
        flags[feature.key] = enabled
        if enabled:
            features.append(
                {
                    "key": feature.key,
                    "name": feature.name,
                    "menu_path": feature.menu_path,
                    "menu_icon": feature.menu_icon,
                    "menu_label": feature.menu_label,
                    "menu_position": feature.menu_position,
                    "is_beta": feature.is_beta,
                    "release_note": feature.release_note,
                    "released_at": (
                        feature.released_at.isoformat() if feature.released_at else None
                    ),
                }
            )

    payload = {"features": features, "flags": flags}
    await redis.setex(_cache_key(tenant_id), CACHE_TTL, json.dumps(payload))
    return payload


async def is_enabled(db: AsyncSession, tenant_id: uuid.UUID, feature_key: str) -> bool:
    data = await get_tenant_features(db, tenant_id)
    return bool(data["flags"].get(feature_key, False))


# ── 기능 마스터 CRUD (슈퍼 어드민) ───────────────────────────────────────
async def _get_feature(db: AsyncSession, feature_id: uuid.UUID) -> Feature:
    feature = await db.get(Feature, feature_id)
    if not feature:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="기능을 찾을 수 없습니다."
        )
    return feature


async def list_features(db: AsyncSession) -> tuple[list[tuple[Feature, int]], int]:
    """(feature, enabled_tenant_count) 목록 반환."""
    counts = dict(
        (
            await db.execute(
                select(TenantFeature.feature_id, func.count())
                .where(TenantFeature.is_enabled.is_(True))
                .group_by(TenantFeature.feature_id)
            )
        ).all()
    )
    features = list(
        (
            await db.execute(
                select(Feature).order_by(Feature.menu_position, Feature.created_at)
            )
        )
        .scalars()
        .all()
    )
    items = [(f, int(counts.get(f.id, 0))) for f in features]
    return items, len(features)


async def create_feature(db: AsyncSession, **data) -> Feature:
    existing = await db.execute(select(Feature).where(Feature.key == data["key"]))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="이미 존재하는 기능 key입니다."
        )
    feature = Feature(id=uuid.uuid4(), **data)
    db.add(feature)
    await db.commit()
    await db.refresh(feature)
    return feature


async def update_feature(
    db: AsyncSession, feature_id: uuid.UUID, changes: dict
) -> tuple[Feature, dict, dict]:
    feature = await _get_feature(db, feature_id)
    before = {k: getattr(feature, k) for k in changes}
    for key, value in changes.items():
        setattr(feature, key, value)
    await db.commit()
    await db.refresh(feature)
    after = {k: getattr(feature, k) for k in changes}
    # 마스터 변경은 모든 테넌트 캐시에 영향 → 전체 무효화
    await _invalidate_all(db)
    return feature, before, after


# ── 개별 토글 ────────────────────────────────────────────────────────────
async def toggle_feature(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    feature_id: uuid.UUID,
    enabled: bool,
    *,
    actor_id: uuid.UUID | None = None,
    reason: str | None = None,
) -> TenantFeature:
    await _get_feature(db, feature_id)
    await _ensure_tenant(db, tenant_id)

    tf = (
        await db.execute(
            select(TenantFeature).where(
                TenantFeature.tenant_id == tenant_id,
                TenantFeature.feature_id == feature_id,
            )
        )
    ).scalar_one_or_none()

    now = datetime.now(UTC)
    if tf is None:
        tf = TenantFeature(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            feature_id=feature_id,
            is_enabled=enabled,
            enabled_at=now if enabled else None,
            enabled_by=actor_id if enabled else None,
            override_reason=reason,
        )
        db.add(tf)
    else:
        tf.is_enabled = enabled
        tf.enabled_at = now if enabled else None
        tf.enabled_by = actor_id if enabled else None
        tf.override_reason = reason

    await db.commit()
    await db.refresh(tf)
    await invalidate_cache(tenant_id)
    return tf


async def list_tenant_features(
    db: AsyncSession, tenant_id: uuid.UUID
) -> list[TenantFeatureItemRow]:
    """슈퍼 어드민이 특정 테넌트의 전체 기능 상태 조회."""
    await _ensure_tenant(db, tenant_id)
    rows = (
        await db.execute(
            select(Feature, TenantFeature.is_enabled, TenantFeature.enabled_at)
            .outerjoin(
                TenantFeature,
                and_(
                    TenantFeature.feature_id == Feature.id,
                    TenantFeature.tenant_id == tenant_id,
                ),
            )
            .order_by(Feature.menu_position, Feature.created_at)
        )
    ).all()
    return [
        TenantFeatureItemRow(
            feature=feature,
            is_enabled=bool(is_enabled),
            enabled_at=enabled_at,
        )
        for feature, is_enabled, enabled_at in rows
    ]


# ── 배포 ─────────────────────────────────────────────────────────────────
async def deploy_feature(
    db: AsyncSession,
    feature_id: uuid.UUID,
    *,
    deployment_type: str,
    target_plan: str | None = None,
    target_tenants: list[uuid.UUID] | None = None,
    rollout_percent: int | None = None,
    actor_id: uuid.UUID | None = None,
    notes: str | None = None,
) -> tuple[FeatureDeployment, int]:
    await _get_feature(db, feature_id)

    target_ids = await _resolve_deploy_targets(
        db,
        deployment_type=deployment_type,
        target_plan=target_plan,
        target_tenants=target_tenants,
        rollout_percent=rollout_percent,
    )

    await _set_enabled_bulk(db, feature_id, target_ids, enabled=True, actor_id=actor_id)

    deployment = FeatureDeployment(
        id=uuid.uuid4(),
        feature_id=feature_id,
        deployment_type=deployment_type,
        target_plan=target_plan,
        target_tenants=target_ids or None,
        rollout_percent=rollout_percent,
        affected_count=len(target_ids),
        deployed_by=actor_id,
    )
    db.add(deployment)
    await db.commit()
    await db.refresh(deployment)
    await invalidate_cache(*target_ids)
    return deployment, len(target_ids)


async def rollback_deployment(
    db: AsyncSession, deployment_id: uuid.UUID
) -> tuple[FeatureDeployment, int]:
    deployment = await db.get(FeatureDeployment, deployment_id)
    if not deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="배포 이력을 찾을 수 없습니다.",
        )
    if deployment.rollback_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="이미 롤백된 배포입니다."
        )

    # 배포 대상이 기록된 경우 그 대상만, 아니면 해당 기능이 켜진 전체 테넌트를 비활성화
    if deployment.target_tenants:
        target_ids = list(deployment.target_tenants)
    else:
        target_ids = [
            row[0]
            for row in (
                await db.execute(
                    select(TenantFeature.tenant_id).where(
                        TenantFeature.feature_id == deployment.feature_id,
                        TenantFeature.is_enabled.is_(True),
                    )
                )
            ).all()
        ]

    await _set_enabled_bulk(db, deployment.feature_id, target_ids, enabled=False)
    deployment.rollback_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(deployment)
    await invalidate_cache(*target_ids)
    return deployment, len(target_ids)


async def list_deployments(
    db: AsyncSession, feature_id: uuid.UUID
) -> tuple[list[FeatureDeployment], int]:
    """기능의 배포 이력 (최신순)."""
    await _get_feature(db, feature_id)
    rows = (
        (
            await db.execute(
                select(FeatureDeployment)
                .where(FeatureDeployment.feature_id == feature_id)
                .order_by(FeatureDeployment.deployed_at.desc())
            )
        )
        .scalars()
        .all()
    )
    items = list(rows)
    return items, len(items)


# ── 내부 헬퍼 ────────────────────────────────────────────────────────────
async def _ensure_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    tenant = await db.get(Tenant, tenant_id)
    if not tenant or tenant.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="테넌트를 찾을 수 없습니다."
        )


async def _active_tenant_ids(db: AsyncSession) -> list[uuid.UUID]:
    return [
        row[0]
        for row in (
            await db.execute(
                select(Tenant.id).where(
                    Tenant.is_active.is_(True), Tenant.deleted_at.is_(None)
                )
            )
        ).all()
    ]


async def _resolve_deploy_targets(
    db: AsyncSession,
    *,
    deployment_type: str,
    target_plan: str | None,
    target_tenants: list[uuid.UUID] | None,
    rollout_percent: int | None,
) -> list[uuid.UUID]:
    if deployment_type == "GLOBAL":
        return await _active_tenant_ids(db)

    if deployment_type == "PLAN_BASED":
        if not target_plan:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="PLAN_BASED 배포에는 target_plan이 필요합니다.",
            )
        return [
            row[0]
            for row in (
                await db.execute(
                    select(Tenant.id).where(
                        Tenant.plan_type == target_plan,
                        Tenant.is_active.is_(True),
                        Tenant.deleted_at.is_(None),
                    )
                )
            ).all()
        ]

    if deployment_type == "SELECTIVE":
        if not target_tenants:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="SELECTIVE 배포에는 target_tenants가 필요합니다.",
            )
        return list(target_tenants)

    if deployment_type == "GRADUAL":
        if not rollout_percent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="GRADUAL 배포에는 rollout_percent가 필요합니다.",
            )
        all_ids = await _active_tenant_ids(db)
        count = math.ceil(len(all_ids) * rollout_percent / 100)
        return random.sample(all_ids, min(count, len(all_ids)))

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="알 수 없는 배포 방식입니다.",
    )


async def _set_enabled_bulk(
    db: AsyncSession,
    feature_id: uuid.UUID,
    tenant_ids: list[uuid.UUID],
    *,
    enabled: bool,
    actor_id: uuid.UUID | None = None,
) -> None:
    if not tenant_ids:
        return
    existing = {
        tf.tenant_id: tf
        for tf in (
            await db.execute(
                select(TenantFeature).where(
                    TenantFeature.feature_id == feature_id,
                    TenantFeature.tenant_id.in_(tenant_ids),
                )
            )
        )
        .scalars()
        .all()
    }
    now = datetime.now(UTC)
    for tid in tenant_ids:
        tf = existing.get(tid)
        if tf is None:
            db.add(
                TenantFeature(
                    id=uuid.uuid4(),
                    tenant_id=tid,
                    feature_id=feature_id,
                    is_enabled=enabled,
                    enabled_at=now if enabled else None,
                    enabled_by=actor_id if enabled else None,
                )
            )
        else:
            tf.is_enabled = enabled
            tf.enabled_at = now if enabled else None
            tf.enabled_by = actor_id if enabled else None


async def _invalidate_all(db: AsyncSession) -> None:
    ids = [row[0] for row in (await db.execute(select(Tenant.id))).all()]
    await invalidate_cache(*ids)
