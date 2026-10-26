"""T-111 방문자 내 예약 · 문의 내역 (기획서 16.7, AD-04 연동).

- 로그인한 회원이 문의 · 상담 · 예약을 남기면 inquiries.member_id 를 기록하고,
  예약이면 member_reservations 도 만든다 (업종별 예약 유형).
  비회원 접수는 그대로 (#23 옵션 A)
- 예약 취소: 대기 · 확정이면서 예약 시각이 지나지 않은 경우만.
  연결된 문의 관리자 메모에 취소 사실을 남기고 관리자 실시간 알림을 보낸다
"""

import json
from datetime import UTC, date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import member_errors as errors
from app.core.member_errors import MemberAuthError
from app.core.redis import get_redis
from app.models.inquiry import Inquiry
from app.models.site_member import MemberReservation, SiteMember
from app.models.tenant import Tenant

CANCELLABLE_STATUSES = ("PENDING", "CONFIRMED")
# 업종(테넌트 template_type) → 예약 유형 (기획서 16.2)
RESERVATION_TYPE_BY_INDUSTRY = {"HOSPITAL": "MEDICAL", "PENSION": "LODGING"}
_KST = ZoneInfo("Asia/Seoul")


def _now() -> datetime:
    return datetime.now(UTC)


def reservation_type_for(tenant: Tenant) -> str:
    return RESERVATION_TYPE_BY_INDUSTRY.get(tenant.template_type, "GENERAL")


def _reserved_at(
    reserved_date: date | None, reserved_time: str | None
) -> datetime | None:
    """희망 날짜 · 시각(한국 시간) → TIMESTAMPTZ. 시각이 없으면 그날 0시."""
    if reserved_date is None:
        return None
    hour, minute = (int(p) for p in (reserved_time or "00:00").split(":"))
    local = datetime(
        reserved_date.year,
        reserved_date.month,
        reserved_date.day,
        hour,
        minute,
        tzinfo=_KST,
    )
    return local.astimezone(UTC)


def add_member_reservation(
    db: AsyncSession, tenant: Tenant, member_id: UUID, inquiry: Inquiry
) -> MemberReservation:
    """회원 예약 접수 → 내 예약 내역 (inquiry 와 같은 트랜잭션에서 호출)."""
    reservation = MemberReservation(
        tenant_id=tenant.id,
        member_id=member_id,
        inquiry_id=inquiry.id,
        reservation_type=reservation_type_for(tenant),
        status="PENDING",
        reserved_at=_reserved_at(inquiry.reserved_date, inquiry.reserved_time),
        memo=inquiry.message,
        detail={
            "subject": inquiry.subject,
            "reserved_date": (
                inquiry.reserved_date.isoformat() if inquiry.reserved_date else None
            ),
            "reserved_time": inquiry.reserved_time,
        },
    )
    db.add(reservation)
    return reservation


async def active_member_id(
    db: AsyncSession, tenant: Tenant, payload: dict | None
) -> UUID | None:
    """선택적 방문자 토큰 → 이 테넌트의 활성 회원 id (아니면 비회원 취급)."""
    if not payload or payload.get("tenant_id") != str(tenant.id):
        return None
    from app.core.security import issued_before

    member = (
        await db.execute(
            select(SiteMember).where(
                SiteMember.id == UUID(payload["sub"]),
                SiteMember.tenant_id == tenant.id,
                SiteMember.deleted_at.is_(None),
                SiteMember.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if member is None or issued_before(payload, member.password_changed_at):
        return None
    return member.id


# ── 내 예약 ────────────────────────────────────────────────────────────────


async def list_reservations(
    db: AsyncSession,
    member: SiteMember,
    status: str | None = None,
    months: int | None = None,
) -> list[MemberReservation]:
    query = select(MemberReservation).where(
        MemberReservation.member_id == member.id,
        MemberReservation.deleted_at.is_(None),
    )
    if status:
        query = query.where(MemberReservation.status == status)
    if months:
        since = _now() - timedelta(days=30 * months)
        query = query.where(
            func.coalesce(MemberReservation.reserved_at, MemberReservation.created_at)
            >= since
        )
    query = query.order_by(
        func.coalesce(
            MemberReservation.reserved_at, MemberReservation.created_at
        ).desc()
    )
    return list((await db.execute(query)).scalars().all())


async def cancel_reservation(
    db: AsyncSession, member: SiteMember, reservation_id: UUID
) -> MemberReservation:
    reservation = (
        await db.execute(
            select(MemberReservation)
            .where(
                MemberReservation.id == reservation_id,
                MemberReservation.member_id == member.id,
                MemberReservation.deleted_at.is_(None),
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if reservation is None:
        raise MemberAuthError(404, "NOT_FOUND", errors.RESERVATION_NOT_FOUND)
    now = _now()
    past = reservation.reserved_at is not None and reservation.reserved_at <= now
    if reservation.status not in CANCELLABLE_STATUSES or past:
        raise MemberAuthError(
            409, "RESERVATION_NOT_CANCELLABLE", errors.RESERVATION_NOT_CANCELLABLE
        )

    reservation.status = "CANCELLED"
    if reservation.inquiry_id:
        inquiry = await db.get(Inquiry, reservation.inquiry_id)
        if inquiry is not None:
            stamp = now.astimezone(_KST).strftime("%Y-%m-%d %H:%M")
            note = f"[회원 취소] {stamp} 방문자가 마이페이지에서 예약을 취소했습니다."
            inquiry.admin_memo = (
                f"{inquiry.admin_memo}\n{note}" if inquiry.admin_memo else note
            )
    await db.commit()
    await db.refresh(reservation)
    await _publish_cancelled(member, reservation)
    return reservation


async def _publish_cancelled(
    member: SiteMember, reservation: MemberReservation
) -> None:
    """관리자 실시간 알림 (AD-04 SSE 채널)."""
    try:
        redis = await get_redis()
        await redis.publish(
            f"inquiry:new:{member.tenant_id}",
            json.dumps(
                {
                    "type": "reservation_cancelled",
                    "id": str(reservation.inquiry_id or reservation.id),
                    "name": member.name,
                    "inquiry_type": "RESERVATION",
                }
            ),
        )
    except Exception:  # noqa: BLE001
        pass


# ── 내 문의 ────────────────────────────────────────────────────────────────


async def list_inquiries(db: AsyncSession, member: SiteMember) -> list[Inquiry]:
    rows = await db.execute(
        select(Inquiry)
        .where(
            Inquiry.member_id == member.id,
            Inquiry.tenant_id == member.tenant_id,
            Inquiry.deleted_at.is_(None),
            Inquiry.status != "SPAM",
        )
        .order_by(Inquiry.created_at.desc())
    )
    return list(rows.scalars().all())


async def get_inquiry(
    db: AsyncSession, member: SiteMember, inquiry_id: UUID
) -> Inquiry:
    inquiry = (
        await db.execute(
            select(Inquiry).where(
                Inquiry.id == inquiry_id,
                Inquiry.member_id == member.id,
                Inquiry.tenant_id == member.tenant_id,
                Inquiry.deleted_at.is_(None),
                Inquiry.status != "SPAM",
            )
        )
    ).scalar_one_or_none()
    if inquiry is None:
        raise MemberAuthError(404, "NOT_FOUND", errors.INQUIRY_NOT_FOUND)
    return inquiry


def is_answered(inquiry: Inquiry) -> bool:
    return bool(inquiry.answer) or inquiry.status == "DONE"


# ── 관리자 대시보드 (T-115) ─────────────────────────────────────────────────


async def member_counts(
    db: AsyncSession, tenant_id: UUID, week_start: date
) -> dict[str, int]:
    """AD-01 신규 회원 카드 — 이번 주 가입 · 전체 회원 (탈퇴 제외)."""
    base = select(func.count(SiteMember.id)).where(
        SiteMember.tenant_id == tenant_id, SiteMember.deleted_at.is_(None)
    )
    total = (await db.execute(base)).scalar_one()
    week = (
        await db.execute(base.where(func.date(SiteMember.created_at) >= week_start))
    ).scalar_one()
    return {"new_members_week": week, "total_members": total}
