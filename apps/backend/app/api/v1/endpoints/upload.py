import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls, get_tenant_id
from app.models.file import UploadedFile
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.upload import ImageUploadResponse
from app.services import image as image_service
from app.workers.image import generate_thumbnail

router = APIRouter(prefix="/upload", tags=["upload"])

_ALLOWED_CONTEXTS = {
    "hero",
    "gallery",
    "intro",
    "services",
    "team",
    "portfolio",
    "seo",
    "site",
}
# 섹션에 속하지 않는 이미지 — SEO 공유 이미지 (T-037-C) · 로고 · 파비콘 (T-036-A)
_SECTIONLESS_CONTEXTS = {"seo", "site"}


@router.post("/image", response_model=ApiResponse[ImageUploadResponse])
async def upload_image(
    file: UploadFile = File(...),
    context: str = Form(...),
    section_id: UUID | None = Form(None),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    if context not in _ALLOWED_CONTEXTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_CONTEXT"
        )

    if section_id is None and context not in _SECTIONLESS_CONTEXTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="섹션을 지정해 주세요."
        )

    file_bytes = await file.read()

    # 1. 검증 (크기·magic-bytes)
    try:
        image_service.validate_image(file_bytes)
    except image_service.ImageValidationError as e:
        code = str(e)
        http_status = (
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            if code == "FILE_TOO_LARGE"
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=http_status, detail=code)

    # 2. 최적화 (Pillow WebP)
    optimized_bytes, meta = image_service.optimize_image(file_bytes)

    # 3. 플랜별 스토리지 한도 체크
    tenant_result = await db.execute(
        select(Tenant.plan_type).where(Tenant.id == tenant_id)
    )
    plan_type = tenant_result.scalar_one_or_none() or "BASIC"
    try:
        await image_service.check_storage_quota(
            db, tenant_id, plan_type, len(optimized_bytes)
        )
    except image_service.StorageQuotaExceeded as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )

    # 4. MinIO 업로드
    file_id = uuid.uuid4()
    folder = f"{context}/{section_id}" if section_id else context
    key = f"{tenant_id}/{folder}/{file_id}.webp"
    url = image_service.upload_to_storage(optimized_bytes, key, "image/webp")

    # 5. DB 기록
    uploaded = UploadedFile(
        id=file_id,
        tenant_id=tenant_id,
        file_name=file.filename or f"{file_id}.webp",
        file_url=url,
        file_size=len(optimized_bytes),
        mime_type="image/webp",
        uploaded_by=current_user.id,
    )
    db.add(uploaded)
    await db.commit()

    # 비동기 썸네일 생성 (브로커 장애 시 업로드 자체는 성공시킴)
    try:
        generate_thumbnail.delay(str(file_id))
    except Exception:
        pass

    return ApiResponse.ok(
        ImageUploadResponse(
            id=file_id,
            url=url,
            original_size_kb=max(1, meta["original_size"] // 1024),
            optimized_size_kb=max(1, meta["optimized_size"] // 1024),
            width=meta["width"],
            height=meta["height"],
            format=meta["format"],
        )
    )
