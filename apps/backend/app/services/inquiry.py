import io
import json
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.redis import get_redis
from app.models.inquiry import Inquiry
from app.models.tenant import Tenant
from app.schemas.inquiry import (
    InquiryCreate,
    InquiryListItem,
    InquiryListResponse,
    InquiryUpdate,
)
from app.services import notification as notification_service
from app.services.inquiry_fields import clean_detail

KST = ZoneInfo("Asia/Seoul")
# 상태 탭 순서 (T-202)
INQUIRY_STATUSES = ("PENDING", "IN_PROGRESS", "DONE", "SPAM")
_VALID_STATUSES = set(INQUIRY_STATUSES)


async def create_inquiry(
    db: AsyncSession,
    tenant_id: UUID,
    data: InquiryCreate,
    member_id: UUID | None = None,
    tenant: Tenant | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> Inquiry:
    """문의 · 예약 접수.

    member_id 가 있으면 회원 문의 — 예약이면 내 예약에도 추가 (T-111).
    detail 은 업종(tenant.template_type) 칸 정의로 검사한다 — 틀리면 InquiryFieldError.
    """
    detail = clean_detail(tenant.template_type if tenant else None, data.detail)
    inquiry = Inquiry(
        tenant_id=tenant_id,
        inquiry_type=data.inquiry_type,
        name=data.name,
        phone=data.phone,
        email=str(data.email) if data.email else None,
        message=data.message,
        subject=data.subject,
        reserved_date=data.reserved_date,
        reserved_time=data.reserved_time,
        detail=detail,
        ip_address=ip_address,
        user_agent=user_agent,
        status="PENDING",
        is_read=False,
        member_id=member_id,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(inquiry)
    if (
        member_id is not None
        and tenant is not None
        and data.inquiry_type == ("RESERVATION")
    ):
        from app.services.member_activity import add_member_reservation

        await db.flush()
        add_member_reservation(db, tenant, member_id, inquiry)
    await db.commit()
    await db.refresh(inquiry)

    try:
        redis = await get_redis()
        payload = json.dumps(
            {
                "type": "new_inquiry",
                "id": str(inquiry.id),
                "name": inquiry.name,
                "inquiry_type": inquiry.inquiry_type,
            }
        )
        await redis.publish(f"inquiry:new:{tenant_id}", payload)
    except Exception:
        pass  # Redis publish failure must not block inquiry creation

    # T-032: Celery 비동기 알림 발송 트리거
    try:
        from app.workers.notification import send_inquiry_alert

        send_inquiry_alert.delay(str(tenant_id), str(inquiry.id))
    except Exception:
        pass  # 브로커 장애 시에도 문의 접수 자체는 성공

    return inquiry


def _in_period(from_date: date | None, to_date: date | None) -> list:
    """접수일 기간 조건 — 고객이 보는 한국 날짜 기준, 종료일 하루 전체 포함 (T-127)."""
    conditions = []
    if from_date:
        conditions.append(
            Inquiry.created_at >= datetime.combine(from_date, time.min, KST)
        )
    if to_date:
        next_day = to_date + timedelta(days=1)
        conditions.append(
            Inquiry.created_at < datetime.combine(next_day, time.min, KST)
        )
    return conditions


async def get_inquiries(
    db: AsyncSession,
    tenant_id: UUID,
    page: int = 1,
    limit: int = 20,
    status: str | None = None,
    inquiry_type: str | None = None,
    is_read: bool | None = None,
    search: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> InquiryListResponse:
    base = select(Inquiry).where(
        Inquiry.tenant_id == tenant_id,
        Inquiry.deleted_at.is_(None),
        *_in_period(from_date, to_date),
    )

    if inquiry_type:
        base = base.where(Inquiry.inquiry_type == inquiry_type)
    if is_read is not None:
        base = base.where(Inquiry.is_read == is_read)
    if search:
        pattern = f"%{search}%"
        base = base.where(
            or_(
                Inquiry.name.ilike(pattern),
                Inquiry.phone.ilike(pattern),
                Inquiry.message.ilike(pattern),
            )
        )

    # 상태 탭의 건수 — 상태 조건을 걸기 전 (T-202)
    count_rows = await db.execute(
        select(Inquiry.status, func.count())
        .where(Inquiry.id.in_(base.with_only_columns(Inquiry.id)))
        .group_by(Inquiry.status)
    )
    counted = {row_status: count for row_status, count in count_rows.all()}
    status_counts = {name: counted.get(name, 0) for name in INQUIRY_STATUSES}
    if status:
        base = base.where(Inquiry.status == status)

    total_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = total_result.scalar_one()

    rows = await db.execute(
        base.order_by(Inquiry.created_at.desc()).offset((page - 1) * limit).limit(limit)
    )
    items = [InquiryListItem.model_validate(i) for i in rows.scalars().all()]

    return InquiryListResponse(
        total=total, page=page, limit=limit, items=items, status_counts=status_counts
    )


async def get_inquiry_by_id(
    db: AsyncSession, inquiry_id: UUID, tenant_id: UUID
) -> Inquiry | None:
    result = await db.execute(
        select(Inquiry)
        .where(
            Inquiry.id == inquiry_id,
            Inquiry.tenant_id == tenant_id,
            Inquiry.deleted_at.is_(None),
        )
        .options(selectinload(Inquiry.attachments))
    )
    return result.scalar_one_or_none()


async def update_inquiry(
    db: AsyncSession,
    inquiry_id: UUID,
    tenant_id: UUID,
    data: InquiryUpdate,
) -> Inquiry | None:
    inquiry = await get_inquiry_by_id(db, inquiry_id, tenant_id)
    if not inquiry:
        return None

    if data.status is not None:
        if data.status not in _VALID_STATUSES:
            raise ValueError(f"유효하지 않은 상태값입니다: {data.status}")
        inquiry.status = data.status
    if data.is_read is not None:
        inquiry.is_read = data.is_read
    if data.admin_memo is not None:
        inquiry.admin_memo = data.admin_memo
    if data.answer is not None:
        answer = data.answer.strip()
        inquiry.answer = answer or None
        inquiry.answered_at = datetime.now(UTC) if answer else None
        # 답변하면 처리 완료로 (이미 다른 상태로 바꾼 경우는 유지)
        if answer and inquiry.status in ("PENDING", "IN_PROGRESS"):
            inquiry.status = "DONE"

    inquiry.updated_at = datetime.now(UTC)
    await db.commit()
    db.expire_all()
    return await get_inquiry_by_id(db, inquiry_id, tenant_id)


class ReplyFailed(RuntimeError):
    """알림톡 · 문자 모두 실패"""


async def reply_inquiry(db: AsyncSession, inquiry: Inquiry, message: str) -> str:
    """문의자에게 알림톡으로 답장하고 기록한다 (T-203). 보낸 채널을 돌려준다.

    한도 초과는 notification.MonthlyLimitExceeded, 발송 실패는 ReplyFailed.
    """
    tenant = await db.get(Tenant, inquiry.tenant_id)
    channel = await notification_service.send_inquiry_reply(
        db,
        inquiry.tenant_id,
        to=inquiry.phone,
        customer_name=inquiry.name,
        message=message,
        tenant_name=tenant.name if tenant else "사이트",
    )
    if channel is None:
        raise ReplyFailed("답장을 보내지 못했습니다. 잠시 후 다시 시도해주세요.")

    now = datetime.now(UTC)
    inquiry.reply_message = message
    inquiry.reply_channel = channel
    inquiry.replied_at = now
    # 답장하면 처리 완료로 (스팸 · 완료는 그대로)
    if inquiry.status in ("PENDING", "IN_PROGRESS"):
        inquiry.status = "DONE"
    inquiry.is_read = True
    inquiry.updated_at = now
    await db.commit()
    return channel


async def delete_inquiry(db: AsyncSession, inquiry_id: UUID, tenant_id: UUID) -> bool:
    result = await db.execute(
        update(Inquiry)
        .where(
            Inquiry.id == inquiry_id,
            Inquiry.tenant_id == tenant_id,
            Inquiry.deleted_at.is_(None),
        )
        .values(deleted_at=datetime.now(UTC))
        .returning(Inquiry.id)
    )
    await db.commit()
    return result.scalar_one_or_none() is not None


async def get_pending_count(db: AsyncSession, tenant_id: UUID) -> int:
    result = await db.execute(
        select(func.count()).where(
            Inquiry.tenant_id == tenant_id,
            Inquiry.status == "PENDING",
            Inquiry.deleted_at.is_(None),
        )
    )
    return result.scalar_one()


def export_to_excel(inquiries: list[Inquiry]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "문의 목록"
    ws.append(["ID", "유형", "이름", "연락처", "이메일", "상태", "메모", "접수일시"])

    for inq in inquiries:
        ws.append(
            [
                str(inq.id),
                inq.inquiry_type,
                inq.name,
                inq.phone,
                inq.email or "",
                inq.status,
                inq.admin_memo or "",
                inq.created_at.strftime("%Y-%m-%d %H:%M") if inq.created_at else "",
            ]
        )

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


async def get_all_for_export(
    db: AsyncSession,
    tenant_id: UUID,
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[Inquiry]:
    result = await db.execute(
        select(Inquiry)
        .where(
            Inquiry.tenant_id == tenant_id,
            Inquiry.deleted_at.is_(None),
            *_in_period(from_date, to_date),
        )
        .order_by(Inquiry.created_at.desc())
    )
    return list(result.scalars().all())
