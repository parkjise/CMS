from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.gallery import (
    GalleryItemResponse,
    GalleryOrderUpdate,
    GalleryUploadResponse,
)
from app.services import gallery as gallery_service
from app.services import image as image_service

router = APIRouter(tags=["gallery"])


@router.post("/upload/gallery", response_model=ApiResponse[GalleryUploadResponse])
async def upload_gallery(
    files: list[UploadFile] = File(...),
    section_id: UUID = Form(...),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    if len(files) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="NO_FILES")
    if len(files) > gallery_service.MAX_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="TOO_MANY_FILES"
        )

    # 플랜 조회 (1회)
    tenant_result = await db.execute(
        select(Tenant.plan_type).where(Tenant.id == current_user.tenant_id)
    )
    plan_type = tenant_result.scalar_one_or_none() or "BASIC"

    # 갤러리 시작 순서
    next_order = await gallery_service._next_display_order(
        db, section_id, current_user.tenant_id
    )

    items_added = []
    failed = 0

    for idx, file in enumerate(files):
        file_bytes = await file.read()
        try:
            image_service.validate_image(file_bytes)
        except image_service.ImageValidationError:
            failed += 1
            continue

        optimized_bytes, _meta = image_service.optimize_image(file_bytes)

        try:
            await image_service.check_storage_quota(
                db, current_user.tenant_id, plan_type, len(optimized_bytes)
            )
        except image_service.StorageQuotaExceeded as e:
            # 한도 초과 시 즉시 중단 (이미 추가된 것은 커밋)
            if items_added:
                await db.commit()
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
            )

        new_file_id = uuid4()
        storage_key = (
            f"{current_user.tenant_id}/gallery/{section_id}/{new_file_id}.webp"
        )
        image_url = image_service.upload_to_storage(
            optimized_bytes, storage_key, "image/webp"
        )

        item = await gallery_service.add_uploaded_item(
            db,
            tenant_id=current_user.tenant_id,
            section_id=section_id,
            optimized_bytes=optimized_bytes,
            storage_key=storage_key,
            image_url=image_url,
            file_name=file.filename or f"{new_file_id}.webp",
            uploaded_by=current_user.id,
            display_order=next_order + idx,
        )
        items_added.append(item)

    await db.commit()

    return ApiResponse.ok(
        GalleryUploadResponse(
            uploaded_count=len(items_added),
            failed_count=failed,
            items=[GalleryItemResponse.model_validate(i) for i in items_added],
        )
    )


@router.get(
    "/gallery/{section_id}", response_model=ApiResponse[list[GalleryItemResponse]]
)
async def list_gallery(
    section_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    items = await gallery_service.list_items(db, section_id, current_user.tenant_id)
    return ApiResponse.ok([GalleryItemResponse.model_validate(i) for i in items])


@router.patch("/gallery/order", response_model=ApiResponse[None])
async def reorder_gallery(
    body: GalleryOrderUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    await gallery_service.update_order(db, current_user.tenant_id, body.items)
    return ApiResponse.ok(None)


@router.delete("/gallery/{item_id}", response_model=ApiResponse[None])
async def delete_gallery_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    deleted = await gallery_service.delete_item(db, item_id, current_user.tenant_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    return ApiResponse.ok(None)
