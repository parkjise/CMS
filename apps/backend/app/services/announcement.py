"""T-088 공지 서비스.

- 슈퍼 어드민: CRUD + 발행/발송 트리거
- 테넌트: 대상 공지 목록/읽음 처리/미읽음 조회 (배너용)
- 타겟팅: announcements는 tenant_id가 없고 target_type/plan/tenants로 대상 결정
"""

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.announcement import Announcement, AnnouncementRead
from app.models.tenant import Tenant


async def _get(db: AsyncSession, announcement_id: uuid.UUID) -> Announcement:
    ann = await db.get(Announcement, announcement_id)
    if not ann:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="공지를 찾을 수 없습니다."
        )
    return ann


# ── 슈퍼 어드민 CRUD ─────────────────────────────────────────────────────
async def list_announcements(
    db: AsyncSession, *, page: int = 1, limit: int = 20
) -> tuple[list[tuple[Announcement, int]], int]:
    total = int(
        (await db.execute(select(func.count()).select_from(Announcement))).scalar_one()
    )
    read_counts = dict(
        (
            await db.execute(
                select(AnnouncementRead.announcement_id, func.count()).group_by(
                    AnnouncementRead.announcement_id
                )
            )
        ).all()
    )
    rows = (
        (
            await db.execute(
                select(Announcement)
                .order_by(Announcement.created_at.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    items = [(a, int(read_counts.get(a.id, 0))) for a in rows]
    return items, total


async def create_announcement(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    title: str,
    content: str,
    type: str,
    target_type: str,
    target_plan: str | None,
    target_tenants: list[uuid.UUID] | None,
    show_in_admin: bool,
    send_email: bool,
    send_kakao: bool,
    publish_now: bool,
    published_at: datetime | None,
    expires_at: datetime | None,
) -> Announcement:
    if target_type == "PLAN_BASED" and not target_plan:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PLAN_BASED 공지에는 target_plan이 필요합니다.",
        )
    if target_type == "SELECTIVE" and not target_tenants:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SELECTIVE 공지에는 target_tenants가 필요합니다.",
        )

    now = datetime.now(UTC)
    published = published_at
    is_published = False
    if publish_now:
        is_published = True
        published = published or now
    elif published_at is not None and published_at <= now:
        is_published = True

    ann = Announcement(
        id=uuid.uuid4(),
        title=title,
        content=content,
        type=type,
        target_type=target_type,
        target_plan=target_plan,
        target_tenants=target_tenants or None,
        is_published=is_published,
        show_in_admin=show_in_admin,
        send_email=send_email,
        send_kakao=send_kakao,
        published_at=published,
        expires_at=expires_at,
        created_by=actor_id,
    )
    db.add(ann)
    await db.commit()
    await db.refresh(ann)
    return ann


async def update_announcement(
    db: AsyncSession, announcement_id: uuid.UUID, changes: dict
) -> Announcement:
    ann = await _get(db, announcement_id)
    for key, value in changes.items():
        setattr(ann, key, value)
    await db.commit()
    await db.refresh(ann)
    return ann


async def delete_announcement(db: AsyncSession, announcement_id: uuid.UUID) -> None:
    ann = await _get(db, announcement_id)
    await db.delete(ann)
    await db.commit()


async def publish(db: AsyncSession, announcement_id: uuid.UUID) -> Announcement:
    """예약 공지를 즉시 발행 상태로 전환."""
    ann = await _get(db, announcement_id)
    if not ann.is_published:
        ann.is_published = True
        ann.published_at = ann.published_at or datetime.now(UTC)
        await db.commit()
        await db.refresh(ann)
    return ann


# ── 타겟팅 ───────────────────────────────────────────────────────────────
async def resolve_target_tenant_ids(
    db: AsyncSession, ann: Announcement
) -> list[uuid.UUID]:
    """공지 대상 테넌트 id 목록 (활성 테넌트 기준)."""
    conditions = [Tenant.is_active.is_(True), Tenant.deleted_at.is_(None)]
    if ann.target_type == "PLAN_BASED":
        conditions.append(Tenant.plan_type == ann.target_plan)
    elif ann.target_type == "SELECTIVE":
        if not ann.target_tenants:
            return []
        conditions.append(Tenant.id.in_(ann.target_tenants))
    rows = await db.execute(select(Tenant.id).where(*conditions))
    return [r[0] for r in rows.all()]


# ── 테넌트용 ──────────────────────────────────────────────────────────────
def _visible_conditions(plan_type: str, tenant_id: uuid.UUID):
    """테넌트에게 노출되는 발행 공지 조건."""
    now = datetime.now(UTC)
    return [
        Announcement.is_published.is_(True),
        Announcement.show_in_admin.is_(True),
        or_(
            Announcement.published_at.is_(None),
            Announcement.published_at <= now,
        ),
        or_(
            Announcement.expires_at.is_(None),
            Announcement.expires_at > now,
        ),
        or_(
            Announcement.target_type == "ALL",
            and_(
                Announcement.target_type == "PLAN_BASED",
                Announcement.target_plan == plan_type,
            ),
            and_(
                Announcement.target_type == "SELECTIVE",
                Announcement.target_tenants.any(tenant_id),
            ),
        ),
    ]


async def _tenant_plan(db: AsyncSession, tenant_id: uuid.UUID) -> str:
    plan = (
        await db.execute(select(Tenant.plan_type).where(Tenant.id == tenant_id))
    ).scalar_one_or_none()
    return plan or "BASIC"


async def list_for_tenant(
    db: AsyncSession, tenant_id: uuid.UUID
) -> list[tuple[Announcement, bool]]:
    """(announcement, is_read) 목록. 최신순."""
    plan = await _tenant_plan(db, tenant_id)
    rows = (
        await db.execute(
            select(Announcement, AnnouncementRead.tenant_id)
            .outerjoin(
                AnnouncementRead,
                and_(
                    AnnouncementRead.announcement_id == Announcement.id,
                    AnnouncementRead.tenant_id == tenant_id,
                ),
            )
            .where(*_visible_conditions(plan, tenant_id))
            .order_by(Announcement.published_at.desc().nullslast())
        )
    ).all()
    return [(ann, read_tid is not None) for ann, read_tid in rows]


async def list_unread(db: AsyncSession, tenant_id: uuid.UUID) -> list[Announcement]:
    """미읽은 공지만 (배너용)."""
    return [ann for ann, is_read in await list_for_tenant(db, tenant_id) if not is_read]


async def mark_read(
    db: AsyncSession, tenant_id: uuid.UUID, announcement_id: uuid.UUID
) -> None:
    await _get(db, announcement_id)
    existing = (
        await db.execute(
            select(AnnouncementRead).where(
                AnnouncementRead.tenant_id == tenant_id,
                AnnouncementRead.announcement_id == announcement_id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(AnnouncementRead(tenant_id=tenant_id, announcement_id=announcement_id))
        await db.commit()
