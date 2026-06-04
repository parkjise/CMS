import io
from datetime import UTC, datetime
from uuid import UUID

from openpyxl import Workbook
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.inquiry import Inquiry
from app.schemas.inquiry import InquiryCreate, InquiryListResponse, InquiryUpdate

_VALID_STATUSES = {"PENDING", "IN_PROGRESS", "DONE", "SPAM"}


async def create_inquiry(
    db: AsyncSession,
    tenant_id: UUID,
    data: InquiryCreate,
) -> Inquiry:
    inquiry = Inquiry(
        tenant_id=tenant_id,
        inquiry_type=data.inquiry_type,
        name=data.name,
        phone=data.phone,
        email=str(data.email) if data.email else None,
        message=data.message,
        status="PENDING",
        is_read=False,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(inquiry)
    await db.commit()
    await db.refresh(inquiry)
    return inquiry


async def get_inquiries(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    status: str | None = None,
    inquiry_type: str | None = None,
    is_read: bool | None = None,
    search: str | None = None,
) -> InquiryListResponse:
    base = select(Inquiry).where(Inquiry.deleted_at.is_(None))

    if status:
        base = base.where(Inquiry.status == status)
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

    total_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = total_result.scalar_one()

    rows = await db.execute(
        base.order_by(Inquiry.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    items = list(rows.scalars().all())

    return InquiryListResponse(total=total, page=page, limit=limit, items=items)


async def get_inquiry_by_id(db: AsyncSession, inquiry_id: UUID) -> Inquiry | None:
    result = await db.execute(
        select(Inquiry)
        .where(Inquiry.id == inquiry_id, Inquiry.deleted_at.is_(None))
        .options(selectinload(Inquiry.attachments))
    )
    return result.scalar_one_or_none()


async def update_inquiry(
    db: AsyncSession,
    inquiry_id: UUID,
    data: InquiryUpdate,
) -> Inquiry | None:
    inquiry = await get_inquiry_by_id(db, inquiry_id)
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

    inquiry.updated_at = datetime.now(UTC)
    await db.commit()
    db.expire_all()
    return await get_inquiry_by_id(db, inquiry_id)


async def delete_inquiry(db: AsyncSession, inquiry_id: UUID) -> bool:
    result = await db.execute(
        update(Inquiry)
        .where(Inquiry.id == inquiry_id, Inquiry.deleted_at.is_(None))
        .values(deleted_at=datetime.now(UTC))
        .returning(Inquiry.id)
    )
    await db.commit()
    return result.scalar_one_or_none() is not None


async def get_pending_count(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count()).where(
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
        ws.append([
            str(inq.id),
            inq.inquiry_type,
            inq.name,
            inq.phone,
            inq.email or "",
            inq.status,
            inq.admin_memo or "",
            inq.created_at.strftime("%Y-%m-%d %H:%M") if inq.created_at else "",
        ])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


async def get_all_for_export(db: AsyncSession) -> list[Inquiry]:
    result = await db.execute(
        select(Inquiry)
        .where(Inquiry.deleted_at.is_(None))
        .order_by(Inquiry.created_at.desc())
    )
    return list(result.scalars().all())
