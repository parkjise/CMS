import uuid
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import UploadedFile
from app.models.gallery import GalleryItem
from app.schemas.gallery import GalleryOrderItem
from app.services import image as image_service

MAX_FILES_PER_REQUEST = 10


async def list_items(
    db: AsyncSession, section_id: UUID, tenant_id: UUID
) -> list[GalleryItem]:
    result = await db.execute(
        select(GalleryItem)
        .where(
            GalleryItem.section_id == section_id,
            GalleryItem.tenant_id == tenant_id,
        )
        .order_by(GalleryItem.display_order, GalleryItem.created_at)
    )
    return list(result.scalars().all())


async def get_item(
    db: AsyncSession, item_id: UUID, tenant_id: UUID
) -> GalleryItem | None:
    result = await db.execute(
        select(GalleryItem).where(
            GalleryItem.id == item_id, GalleryItem.tenant_id == tenant_id
        )
    )
    return result.scalar_one_or_none()


async def _next_display_order(
    db: AsyncSession, section_id: UUID, tenant_id: UUID
) -> int:
    result = await db.execute(
        select(func.coalesce(func.max(GalleryItem.display_order), -1)).where(
            GalleryItem.section_id == section_id,
            GalleryItem.tenant_id == tenant_id,
        )
    )
    return int(result.scalar_one()) + 1


async def add_uploaded_item(
    db: AsyncSession,
    tenant_id: UUID,
    section_id: UUID,
    optimized_bytes: bytes,
    storage_key: str,
    image_url: str,
    file_name: str,
    uploaded_by: UUID | None,
    display_order: int,
) -> GalleryItem:
    """업로드된 이미지를 uploaded_files + gallery_items 두 테이블에 기록."""
    now = datetime.now(UTC)
    file_id = uuid.uuid4()

    uploaded = UploadedFile(
        id=file_id,
        tenant_id=tenant_id,
        file_name=file_name,
        file_url=image_url,
        file_size=len(optimized_bytes),
        mime_type="image/webp",
        uploaded_by=uploaded_by,
        created_at=now,
        updated_at=now,
    )
    db.add(uploaded)

    item = GalleryItem(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        section_id=section_id,
        file_id=file_id,
        image_url=image_url,
        storage_key=storage_key,
        display_order=display_order,
        created_at=now,
        updated_at=now,
    )
    db.add(item)
    return item


async def update_order(
    db: AsyncSession,
    tenant_id: UUID,
    order_items: list[GalleryOrderItem],
) -> None:
    for item in order_items:
        await db.execute(
            update(GalleryItem)
            .where(
                GalleryItem.id == item.id,
                GalleryItem.tenant_id == tenant_id,
            )
            .values(display_order=item.display_order, updated_at=datetime.now(UTC))
        )
    await db.commit()


async def delete_item(db: AsyncSession, item_id: UUID, tenant_id: UUID) -> bool:
    """gallery_items + uploaded_files + MinIO 객체를 함께 삭제."""
    item = await get_item(db, item_id, tenant_id)
    if not item:
        return False

    storage_key = item.storage_key
    file_id = item.file_id

    await db.execute(
        delete(GalleryItem).where(
            GalleryItem.id == item_id, GalleryItem.tenant_id == tenant_id
        )
    )
    await db.execute(
        delete(UploadedFile).where(
            UploadedFile.id == file_id, UploadedFile.tenant_id == tenant_id
        )
    )
    await db.commit()

    # MinIO 객체 삭제 (실패해도 DB 삭제는 유지)
    try:
        image_service.delete_from_storage(storage_key)
    except Exception:
        pass

    return True
