"""T-115 관리자(AD-04) 회원 예약 처리 (기획서 16.7 · AD-04, T-111 연동).

- 회원 예약 상태 변경: 대기 → 확정/취소, 확정 → 완료/취소 (그 외 409)
- 문의 상태 동기화: 확정 → IN_PROGRESS, 완료 · 취소 → DONE (취소는 관리자 메모 기록)
- 확정 · 취소 시 회원 알림 설정(notify_reservation_*)이 켜져 있으면 문자(sms_agree) ·
  메일(email_agree) 발송 — 관리자 알림 월 한도와 별개
"""

from datetime import UTC, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiry import Inquiry
from app.models.site_member import MemberReservation, SiteMember
from app.schemas.inquiry import InquiryMemberInfo, InquiryReservationInfo

TRANSITIONS: dict[str, tuple[str, ...]] = {
    "PENDING": ("CONFIRMED", "CANCELLED"),
    "CONFIRMED": ("COMPLETED", "CANCELLED"),
}
INQUIRY_STATUS = {"CONFIRMED": "IN_PROGRESS", "COMPLETED": "DONE", "CANCELLED": "DONE"}
NOTIFY_STATUSES = ("CONFIRMED", "CANCELLED")
NOT_MEMBER_RESERVATION = "회원 예약이 아닌 문의입니다."
INVALID_TRANSITION = "현재 상태에서 바꿀 수 없는 예약 상태입니다."
_KST = ZoneInfo("Asia/Seoul")


async def _reservation_of(
    db: AsyncSession, inquiry: Inquiry, *, lock: bool = False
) -> MemberReservation | None:
    query = select(MemberReservation).where(
        MemberReservation.inquiry_id == inquiry.id,
        MemberReservation.tenant_id == inquiry.tenant_id,
        MemberReservation.deleted_at.is_(None),
    )
    if lock:
        query = query.with_for_update()
    return (await db.execute(query)).scalar_one_or_none()


async def extras(
    db: AsyncSession, inquiry: Inquiry
) -> tuple[InquiryMemberInfo | None, InquiryReservationInfo | None]:
    """관리자 문의 상세 — 회원 정보 · 회원 예약 상태."""
    if inquiry.member_id is None:
        return None, None
    member = await db.get(SiteMember, inquiry.member_id)
    member_info = (
        InquiryMemberInfo(
            id=member.id,
            name=member.name,
            email=member.email,
            phone=member.phone,
            created_at=member.created_at,
            is_active=member.is_active and member.deleted_at is None,
        )
        if member is not None
        else None
    )
    reservation = await _reservation_of(db, inquiry)
    reservation_info = (
        InquiryReservationInfo(
            id=reservation.id,
            reservation_type=reservation.reservation_type,
            status=reservation.status,
            reserved_at=reservation.reserved_at,
            detail=reservation.detail,
            next_statuses=list(TRANSITIONS.get(reservation.status, ())),
        )
        if reservation is not None
        else None
    )
    return member_info, reservation_info


async def change_status(
    db: AsyncSession, inquiry: Inquiry, new_status: str
) -> MemberReservation:
    reservation = await _reservation_of(db, inquiry, lock=True)
    if reservation is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=NOT_MEMBER_RESERVATION
        )
    if new_status not in TRANSITIONS.get(reservation.status, ()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=INVALID_TRANSITION
        )

    reservation.status = new_status
    inquiry.status = INQUIRY_STATUS[new_status]
    if new_status == "CANCELLED":
        stamp = datetime.now(UTC).astimezone(_KST).strftime("%Y-%m-%d %H:%M")
        note = f"[관리자 취소] {stamp} 관리자가 예약을 취소했습니다."
        inquiry.admin_memo = (
            f"{inquiry.admin_memo}\n{note}" if inquiry.admin_memo else note
        )
    await db.commit()
    await db.refresh(reservation)

    if new_status in NOTIFY_STATUSES:
        _enqueue_notice(inquiry.tenant_id, reservation.id, new_status)
    return reservation


def _enqueue_notice(tenant_id: UUID, reservation_id: UUID, new_status: str) -> None:
    try:
        from app.workers.notification import send_member_reservation_notice

        send_member_reservation_notice.delay(
            str(tenant_id), str(reservation_id), new_status
        )
    except Exception:
        pass  # 브로커 장애 시에도 상태 변경은 성공
