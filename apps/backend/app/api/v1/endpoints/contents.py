"""콘텐츠 관리 API — 유형 · 칸 (T-253, 콘텐츠 관리 기획서 6장).

목록은 스위치와 상관없이 볼 수 있다(꺼져 있으면 화면이 안내). 그 밖은 CONTENT_MANAGE
가 켜진 사업체만. 보기 전용 계정의 쓰기는 라우터 공통 의존성이 막는다.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import (
    get_current_user,
    get_db_with_rls,
    get_tenant_id,
    require_feature,
)
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.content import (
    ContentFieldsUpdate,
    ContentTypeCreate,
    ContentTypeListResponse,
    ContentTypeOrderUpdate,
    ContentTypeResponse,
    ContentTypeUpdate,
)
from app.services import content_type as type_service

router = APIRouter(prefix="/contents", tags=["contents"])

_feature = [Depends(require_feature(type_service.FEATURE_KEY))]


@router.get("/types", response_model=ApiResponse[ContentTypeListResponse])
async def list_types(
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """유형 · 휴지통 · 한도 · 스위치 · 시작용 유형."""
    return ApiResponse.ok(
        ContentTypeListResponse.model_validate(
            await type_service.list_types(db, tenant_id)
        )
    )


@router.post(
    "/types",
    response_model=ApiResponse[ContentTypeResponse],
    status_code=status.HTTP_201_CREATED,
    dependencies=_feature,
)
async def create_type(
    body: ContentTypeCreate,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    """빈 유형 · 시작용 유형 — 한도 초과 422, 키 충돌 409."""
    view = await type_service.create_type(db, current_user, tenant_id, body)
    return ApiResponse.ok(ContentTypeResponse.model_validate(view))


@router.patch("/types/order", response_model=ApiResponse[None], dependencies=_feature)
async def reorder_types(
    body: ContentTypeOrderUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    await type_service.reorder_types(db, tenant_id, body.ids)
    return ApiResponse.ok(None)


@router.get(
    "/types/{type_id}",
    response_model=ApiResponse[ContentTypeResponse],
    dependencies=_feature,
)
async def get_type(
    type_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    view = await type_service.get_type_view(db, tenant_id, type_id)
    return ApiResponse.ok(ContentTypeResponse.model_validate(view))


@router.patch(
    "/types/{type_id}",
    response_model=ApiResponse[ContentTypeResponse],
    dependencies=_feature,
)
async def update_type(
    type_id: UUID,
    body: ContentTypeUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    """이름 · 키 · 설명."""
    view = await type_service.update_type(db, current_user, tenant_id, type_id, body)
    return ApiResponse.ok(ContentTypeResponse.model_validate(view))


@router.put(
    "/types/{type_id}/fields",
    response_model=ApiResponse[ContentTypeResponse],
    dependencies=_feature,
)
async def save_fields(
    type_id: UUID,
    body: ContentFieldsUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    """칸 전체 저장 — 목록 순서대로, 빠진 칸은 휴지통."""
    view = await type_service.save_fields(
        db, current_user, tenant_id, type_id, body.fields
    )
    return ApiResponse.ok(ContentTypeResponse.model_validate(view))


@router.delete(
    "/types/{type_id}", response_model=ApiResponse[None], dependencies=_feature
)
async def delete_type(
    type_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    """휴지통으로 — 콘텐츠가 남아 있으면 409."""
    await type_service.delete_type(db, current_user, tenant_id, type_id)
    return ApiResponse.ok(None)


@router.post(
    "/types/{type_id}/restore",
    response_model=ApiResponse[ContentTypeResponse],
    dependencies=_feature,
)
async def restore_type(
    type_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    """휴지통에서 되살림 — 한도 초과 422."""
    view = await type_service.restore_type(db, current_user, tenant_id, type_id)
    return ApiResponse.ok(ContentTypeResponse.model_validate(view))
