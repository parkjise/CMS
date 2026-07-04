"""T-085 슈퍼 어드민 테넌트 관리 서비스."""

import secrets
import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.models.ai import AiUsageLog
from app.models.analytics import SiteAnalytics
from app.models.audit import AuditLog
from app.models.file import UploadedFile
from app.models.inquiry import Inquiry
from app.models.section import Section
from app.models.tenant import Tenant
from app.models.user import User

# 신규 테넌트 기본 섹션 (section_type, label)
DEFAULT_SECTIONS: list[tuple[str, str]] = [
    ("HERO_BANNER", "메인 배너"),
    ("INTRO", "소개"),
    ("SERVICES", "서비스"),
    ("CONTACT", "문의"),
]

IMPERSONATE_EXPIRE_MINUTES = 30


async def _get_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> Tenant:
    tenant = await db.get(Tenant, tenant_id)
    if not tenant or tenant.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="테넌트를 찾을 수 없습니다."
        )
    return tenant


async def _admin_emails(db: AsyncSession, tenant_id: uuid.UUID) -> list[str]:
    rows = await db.execute(
        select(User.email).where(
            User.tenant_id == tenant_id,
            User.role == "TENANT_ADMIN",
            User.deleted_at.is_(None),
        )
    )
    return [r[0] for r in rows.all()]


async def _primary_admin(db: AsyncSession, tenant_id: uuid.UUID) -> User | None:
    result = await db.execute(
        select(User)
        .where(
            User.tenant_id == tenant_id,
            User.role == "TENANT_ADMIN",
            User.deleted_at.is_(None),
        )
        .order_by(User.created_at)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def list_tenants(
    db: AsyncSession,
    *,
    q: str | None = None,
    plan_type: str | None = None,
    template_type: str | None = None,
    is_active: bool | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[Tenant], int]:
    conditions = [Tenant.deleted_at.is_(None)]
    if q:
        like = f"%{q}%"
        conditions.append(Tenant.name.ilike(like) | Tenant.slug.ilike(like))
    if plan_type:
        conditions.append(Tenant.plan_type == plan_type)
    if template_type:
        conditions.append(Tenant.template_type == template_type)
    if is_active is not None:
        conditions.append(Tenant.is_active.is_(is_active))

    total = int(
        (
            await db.execute(
                select(func.count()).select_from(Tenant).where(*conditions)
            )
        ).scalar_one()
    )
    rows = await db.execute(
        select(Tenant)
        .where(*conditions)
        .order_by(Tenant.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    return list(rows.scalars().all()), total


async def create_tenant(
    db: AsyncSession,
    *,
    name: str,
    slug: str,
    template_type: str,
    plan_type: str,
    admin_email: str,
    admin_password: str,
) -> Tenant:
    existing = await db.execute(select(Tenant).where(Tenant.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 사용 중인 slug입니다.",
        )

    tenant = Tenant(
        id=uuid.uuid4(),
        name=name,
        slug=slug,
        template_type=template_type,
        plan_type=plan_type,
        is_active=True,
    )
    db.add(tenant)
    await db.flush()

    db.add(
        User(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            email=admin_email,
            password_hash=hash_password(admin_password),
            role="TENANT_ADMIN",
            is_active=True,
        )
    )
    for order, (section_type, label) in enumerate(DEFAULT_SECTIONS):
        db.add(
            Section(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                section_type=section_type,
                label=label,
                display_order=order,
                is_active=True,
            )
        )

    await db.commit()
    await db.refresh(tenant)

    # 환영 메일 발송 (T-098) — 브로커 미가용 시에도 생성 흐름을 막지 않는다.
    _enqueue_email(
        to=admin_email,
        subject=f"[CMS] {name}님, 환영합니다 🎉",
        template="welcome",
        variables={
            "tenant_name": name,
            "admin_url": settings.admin_base_url,
            "admin_email": admin_email,
            "temp_password": admin_password,
            "plan_type": plan_type,
        },
    )
    return tenant


def _enqueue_email(*, to: str, subject: str, template: str, variables: dict) -> None:
    try:
        from app.workers.email import send_email_async

        send_email_async.delay(to, subject, template, variables)
    except Exception:
        pass


async def update_tenant(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    name: str | None,
    template_type: str | None,
    custom_domain: str | None,
    is_active: bool | None,
) -> tuple[Tenant, dict, dict]:
    """(tenant, before, after) 반환 — audit 기록용."""
    tenant = await _get_tenant(db, tenant_id)
    before = {
        "name": tenant.name,
        "template_type": tenant.template_type,
        "custom_domain": tenant.custom_domain,
        "is_active": tenant.is_active,
    }
    if name is not None:
        tenant.name = name
    if template_type is not None:
        tenant.template_type = template_type
    if custom_domain is not None:
        tenant.custom_domain = custom_domain
    if is_active is not None:
        tenant.is_active = is_active
    await db.commit()
    await db.refresh(tenant)
    after = {
        "name": tenant.name,
        "template_type": tenant.template_type,
        "custom_domain": tenant.custom_domain,
        "is_active": tenant.is_active,
    }
    return tenant, before, after


async def change_plan(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    plan_type: str,
    plan_expires_at: datetime | None,
) -> tuple[Tenant, dict, dict]:
    tenant = await _get_tenant(db, tenant_id)
    before = {"plan_type": tenant.plan_type}
    tenant.plan_type = plan_type
    tenant.plan_expires_at = plan_expires_at
    await db.commit()
    await db.refresh(tenant)
    return tenant, before, {"plan_type": plan_type}


async def soft_delete_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> Tenant:
    tenant = await _get_tenant(db, tenant_id)
    tenant.deleted_at = datetime.now()
    tenant.is_active = False
    await db.commit()
    await db.refresh(tenant)
    return tenant


async def reset_admin_password(
    db: AsyncSession, tenant_id: uuid.UUID
) -> tuple[str, str]:
    """(admin_email, temporary_password) 반환."""
    await _get_tenant(db, tenant_id)
    admin = await _primary_admin(db, tenant_id)
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="테넌트 관리자 계정이 없습니다.",
        )
    temp_password = secrets.token_urlsafe(9)
    admin.password_hash = hash_password(temp_password)
    await db.commit()
    return admin.email, temp_password


async def get_stats(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    await _get_tenant(db, tenant_id)

    pv, uv = (
        await db.execute(
            select(
                func.coalesce(func.sum(SiteAnalytics.page_views), 0),
                func.coalesce(func.sum(SiteAnalytics.unique_visitors), 0),
            ).where(SiteAnalytics.tenant_id == tenant_id)
        )
    ).one()

    inquiries = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Inquiry)
                .where(Inquiry.tenant_id == tenant_id, Inquiry.deleted_at.is_(None))
            )
        ).scalar_one()
    )
    ai_usage = int(
        (
            await db.execute(
                select(func.count())
                .select_from(AiUsageLog)
                .where(AiUsageLog.tenant_id == tenant_id)
            )
        ).scalar_one()
    )
    storage = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(UploadedFile.file_size), 0)).where(
                    UploadedFile.tenant_id == tenant_id
                )
            )
        ).scalar_one()
    )

    return {
        "page_views": int(pv),
        "unique_visitors": int(uv),
        "inquiries": inquiries,
        "ai_usage": ai_usage,
        "storage_bytes": storage,
    }


async def create_impersonate_token(
    db: AsyncSession, tenant_id: uuid.UUID
) -> tuple[str, str, int]:
    """(token, redirect_url, expires_in_seconds) 반환."""
    tenant = await _get_tenant(db, tenant_id)
    admin = await _primary_admin(db, tenant_id)
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="테넌트 관리자 계정이 없습니다.",
        )
    jti = str(uuid.uuid4())
    token = create_access_token(
        user_id=admin.id,
        tenant_id=tenant_id,
        role="TENANT_ADMIN",
        expires_minutes=IMPERSONATE_EXPIRE_MINUTES,
        extra_claims={"impersonated": True, "jti": jti},
    )
    # 대리 접속 토큰을 Redis에 30분 TTL로 등록 (만료 후 자동 무효화 / 추적)
    await _register_impersonate_token(jti, tenant_id)

    base = settings.admin_base_url.rstrip("/")
    redirect_url = f"{base}/login?impersonate={token}&tenant={tenant.slug}"
    return token, redirect_url, IMPERSONATE_EXPIRE_MINUTES * 60


async def _register_impersonate_token(jti: str, tenant_id: uuid.UUID) -> None:
    try:
        from app.core.redis import get_redis

        redis = await get_redis()
        await redis.setex(
            f"impersonate:{jti}", IMPERSONATE_EXPIRE_MINUTES * 60, str(tenant_id)
        )
    except Exception:
        # Redis 미가용은 대리 접속 자체(JWT exp 기반)를 막지 않는다.
        pass


async def list_audit_logs(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[AuditLog], int]:
    """해당 테넌트를 대상으로 한 감사 로그 (기능/플랜 변경 등). 최신순."""
    await _get_tenant(db, tenant_id)
    target = str(tenant_id)
    total = int(
        (
            await db.execute(
                select(func.count())
                .select_from(AuditLog)
                .where(AuditLog.target_id == target)
            )
        ).scalar_one()
    )
    rows = await db.execute(
        select(AuditLog)
        .where(AuditLog.target_id == target)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    return list(rows.scalars().all()), total


async def list_all_audit_logs(
    db: AsyncSession,
    *,
    action: str | None = None,
    page: int = 1,
    limit: int = 50,
) -> tuple[list[AuditLog], int]:
    """전체 감사 로그 (액션 필터 옵션). 최신순. T-094 슈퍼 어드민 감사 조회."""
    conditions = []
    if action:
        conditions.append(AuditLog.action == action)

    total = int(
        (
            await db.execute(
                select(func.count()).select_from(AuditLog).where(*conditions)
            )
        ).scalar_one()
    )
    rows = await db.execute(
        select(AuditLog)
        .where(*conditions)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    return list(rows.scalars().all()), total
