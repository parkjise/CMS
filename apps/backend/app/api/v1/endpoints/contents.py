"""콘텐츠 관리 API — 유형 · 칸 (T-253) · 항목 · 카테고리 · 태그 (T-254, 기획서 6장).

목록은 스위치와 상관없이 볼 수 있다(꺼져 있으면 화면이 안내). 그 밖은 CONTENT_MANAGE
가 켜진 사업체만. 보기 전용 계정의 쓰기는 라우터 공통 의존성이 막는다.
"""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import (
    get_current_user,
    get_db,
    get_db_with_rls,
    get_tenant_id,
    require_feature,
)
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.content import (
    ContentBlockAddSection,
    ContentBlockCreate,
    ContentBlockRename,
    ContentBlockResponse,
    ContentBlockUnlink,
    ContentCategoryCreate,
    ContentCategoryResponse,
    ContentCategoryTreeUpdate,
    ContentCategoryUpdate,
    ContentFieldsUpdate,
    ContentItemBulk,
    ContentItemBulkResult,
    ContentItemCreate,
    ContentItemListResponse,
    ContentItemOrderUpdate,
    ContentItemResponse,
    ContentItemUpdate,
    ContentTagInput,
    ContentTagMerge,
    ContentTagResponse,
    ContentTypeCreate,
    ContentTypeListResponse,
    ContentTypeOrderUpdate,
    ContentTypeResponse,
    ContentTypeUpdate,
    ContentUsage,
    PublicContentItem,
)
from app.services import board as board_service
from app.services import content_block as block_service
from app.services import content_item as item_service
from app.services import content_section, section_manage
from app.services import content_taxonomy as taxonomy
from app.services import content_type as type_service

router = APIRouter(prefix="/contents", tags=["contents"])
public_router = APIRouter(tags=["public"])

_feature = [Depends(require_feature(type_service.FEATURE_KEY))]

MSG_PUBLIC_NOT_FOUND = "콘텐츠를 찾을 수 없습니다."


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


# ── 항목 (T-254, CM-01 · 02) ──────────────────────────────────────────────


@router.get(
    "/items",
    response_model=ApiResponse[ContentItemListResponse],
    dependencies=_feature,
)
async def list_items(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    type_id: UUID | None = None,
    status_filter: Literal["DRAFT", "PUBLISHED"] | None = Query(None, alias="status"),
    category_id: UUID | None = None,
    tag_id: UUID | None = None,
    q: str | None = Query(None, max_length=100),
    trash: bool = False,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """검색 · 유형 · 상태 · 카테고리(하위 포함) · 태그 · 휴지통, 상태별 수."""
    data = await item_service.list_items(
        db,
        tenant_id,
        page=page,
        size=size,
        type_id=type_id,
        status_filter=status_filter,
        category_id=category_id,
        tag_id=tag_id,
        q=(q or "").strip() or None,
        trash=trash,
    )
    return ApiResponse.ok(ContentItemListResponse.model_validate(data))


@router.post(
    "/items",
    response_model=ApiResponse[ContentItemResponse],
    status_code=status.HTTP_201_CREATED,
    dependencies=_feature,
)
async def create_item(
    body: ContentItemCreate,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    """초안 · 공개 — 공개는 필수 칸까지 검사, 칸 값 오류는 field: data.{칸}."""
    view = await item_service.create_item(db, current_user, tenant_id, body)
    return ApiResponse.ok(ContentItemResponse.model_validate(view))


@router.post(
    "/items/bulk",
    response_model=ApiResponse[ContentItemBulkResult],
    dependencies=_feature,
)
async def bulk_items(
    body: ContentItemBulk,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    """여러 개 공개 · 초안 · 휴지통 · 복구 — 공개할 수 없는 항목은 skipped."""
    result = await item_service.bulk_update(
        db, current_user, tenant_id, body.ids, body.action
    )
    return ApiResponse.ok(ContentItemBulkResult.model_validate(result))


@router.patch("/items/order", response_model=ApiResponse[None], dependencies=_feature)
async def reorder_items(
    body: ContentItemOrderUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    await type_service.get_type(db, tenant_id, body.type_id)
    await item_service.reorder_items(db, tenant_id, body.type_id, body.ids)
    return ApiResponse.ok(None)


@router.get(
    "/items/{item_id}",
    response_model=ApiResponse[ContentItemResponse],
    dependencies=_feature,
)
async def get_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    view = await item_service.get_item_view(db, tenant_id, item_id)
    return ApiResponse.ok(ContentItemResponse.model_validate(view))


@router.patch(
    "/items/{item_id}",
    response_model=ApiResponse[ContentItemResponse],
    dependencies=_feature,
)
async def update_item(
    item_id: UUID,
    body: ContentItemUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    view = await item_service.update_item(db, current_user, tenant_id, item_id, body)
    return ApiResponse.ok(ContentItemResponse.model_validate(view))


@router.delete(
    "/items/{item_id}", response_model=ApiResponse[None], dependencies=_feature
)
async def delete_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """휴지통으로."""
    await item_service.delete_item(db, tenant_id, item_id)
    return ApiResponse.ok(None)


@router.post(
    "/items/{item_id}/restore",
    response_model=ApiResponse[ContentItemResponse],
    dependencies=_feature,
)
async def restore_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """휴지통에서 — 유형이 휴지통이면 409."""
    view = await item_service.restore_item(db, tenant_id, item_id)
    return ApiResponse.ok(ContentItemResponse.model_validate(view))


@router.post(
    "/items/{item_id}/duplicate",
    response_model=ApiResponse[ContentItemResponse],
    status_code=status.HTTP_201_CREATED,
    dependencies=_feature,
)
async def duplicate_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    """같은 유형에 초안으로 복사."""
    view = await item_service.duplicate_item(db, current_user, tenant_id, item_id)
    return ApiResponse.ok(ContentItemResponse.model_validate(view))


# ── 카테고리 (T-254, CM-05) ───────────────────────────────────────────────


@router.get(
    "/types/{type_id}/categories",
    response_model=ApiResponse[list[ContentCategoryResponse]],
    dependencies=_feature,
)
async def list_categories(
    type_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """2단계 트리 — 항목 수 포함."""
    await type_service.get_type(db, tenant_id, type_id)
    tree = await taxonomy.list_categories(db, tenant_id, type_id)
    return ApiResponse.ok([ContentCategoryResponse.model_validate(n) for n in tree])


@router.post(
    "/types/{type_id}/categories",
    response_model=ApiResponse[ContentCategoryResponse],
    status_code=status.HTTP_201_CREATED,
    dependencies=_feature,
)
async def create_category(
    type_id: UUID,
    body: ContentCategoryCreate,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    await type_service.get_type(db, tenant_id, type_id)
    row = await taxonomy.create_category(
        db, tenant_id, type_id, body.name, body.parent_id
    )
    return ApiResponse.ok(
        ContentCategoryResponse(
            id=row.id,
            name=row.name,
            parent_id=row.parent_id,
            display_order=row.display_order,
        )
    )


@router.put(
    "/types/{type_id}/categories/tree",
    response_model=ApiResponse[list[ContentCategoryResponse]],
    dependencies=_feature,
)
async def save_category_tree(
    type_id: UUID,
    body: ContentCategoryTreeUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """끌어서 바꾼 순서 · 단계 전체."""
    await type_service.get_type(db, tenant_id, type_id)
    await taxonomy.save_tree(
        db, tenant_id, type_id, [n.model_dump() for n in body.nodes]
    )
    tree = await taxonomy.list_categories(db, tenant_id, type_id)
    return ApiResponse.ok([ContentCategoryResponse.model_validate(n) for n in tree])


@router.patch(
    "/categories/{category_id}",
    response_model=ApiResponse[ContentCategoryResponse],
    dependencies=_feature,
)
async def rename_category(
    category_id: UUID,
    body: ContentCategoryUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    row = await taxonomy.get_category(db, tenant_id, category_id)
    if body.name is not None:
        row = await taxonomy.rename_category(db, tenant_id, category_id, body.name)
    return ApiResponse.ok(
        ContentCategoryResponse(
            id=row.id,
            name=row.name,
            parent_id=row.parent_id,
            display_order=row.display_order,
        )
    )


@router.delete(
    "/categories/{category_id}",
    response_model=ApiResponse[dict],
    dependencies=_feature,
)
async def delete_category(
    category_id: UUID,
    move_to: UUID | None = None,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """하위 포함 휴지통 — 그 항목은 move_to 로(없으면 카테고리 없음)."""
    moved = await taxonomy.delete_category(db, tenant_id, category_id, move_to)
    return ApiResponse.ok({"moved": moved})


# ── 태그 (T-254, CM-05) ───────────────────────────────────────────────────


@router.get(
    "/tags",
    response_model=ApiResponse[list[ContentTagResponse]],
    dependencies=_feature,
)
async def list_tags(
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    tags = await taxonomy.list_tags(db, tenant_id)
    return ApiResponse.ok([ContentTagResponse.model_validate(t) for t in tags])


@router.post(
    "/tags",
    response_model=ApiResponse[ContentTagResponse],
    status_code=status.HTTP_201_CREATED,
    dependencies=_feature,
)
async def create_tag(
    body: ContentTagInput,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    row = await taxonomy.create_tag(db, tenant_id, body.name)
    return ApiResponse.ok(ContentTagResponse(id=row.id, name=row.name))


@router.post(
    "/tags/merge",
    response_model=ApiResponse[dict],
    dependencies=_feature,
)
async def merge_tags(
    body: ContentTagMerge,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """source 태그 → target 하나로. 옮긴 연결 수."""
    moved = await taxonomy.merge_tags(db, tenant_id, body.source_ids, body.target_id)
    return ApiResponse.ok({"moved": moved})


@router.patch(
    "/tags/{tag_id}",
    response_model=ApiResponse[ContentTagResponse],
    dependencies=_feature,
)
async def rename_tag(
    tag_id: UUID,
    body: ContentTagInput,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    row = await taxonomy.rename_tag(db, tenant_id, tag_id, body.name)
    return ApiResponse.ok(ContentTagResponse(id=row.id, name=row.name))


@router.delete(
    "/tags/{tag_id}", response_model=ApiResponse[None], dependencies=_feature
)
async def delete_tag(
    tag_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """태그는 휴지통으로, 항목 연결은 끊는다."""
    await taxonomy.delete_tag(db, tenant_id, tag_id)
    return ApiResponse.ok(None)


# ── 사용 위치 · 공개 (T-258) ──────────────────────────────────────────────


@router.get(
    "/types/{type_id}/usage",
    response_model=ApiResponse[list[ContentUsage]],
    dependencies=_feature,
)
async def type_usage(
    type_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """이 유형을 보여 주는 섹션."""
    await type_service.get_type(db, tenant_id, type_id)
    usage = await content_section.type_usage(db, tenant_id, type_id)
    return ApiResponse.ok([ContentUsage.model_validate(u) for u in usage])


@router.get(
    "/items/{item_id}/usage",
    response_model=ApiResponse[list[ContentUsage]],
    dependencies=_feature,
)
async def item_usage(
    item_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """이 항목이 걸리는 섹션 — 섹션의 카테고리 · 태그 조건에 맞을 때."""
    item = await item_service.get_item(db, tenant_id, item_id)
    usage = await content_section.item_usage(db, tenant_id, item)
    return ApiResponse.ok([ContentUsage.model_validate(u) for u in usage])


@public_router.get(
    "/site/{tenant_slug}/content-types/{type_id}/items",
    response_model=ApiResponse[list[PublicContentItem]],
)
async def list_public_items(
    tenant_slug: str,
    type_id: UUID,
    limit: int = Query(
        default=content_section.DEFAULT_COUNT, ge=1, le=content_section.COUNT_MAX
    ),
    sort: Literal["order", "latest", "title"] = "order",
    category: UUID | None = None,
    tag: UUID | None = None,
    body: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """콘텐츠 연결 섹션 (T-258) — 공개 콘텐츠만, 스위치가 꺼졌거나 유형이 없으면 404."""
    tenant = await board_service.open_public_tenant(db, tenant_slug)
    items = (
        await content_section.public_items(
            db,
            tenant,
            type_id,
            limit=limit,
            sort=sort,
            category_id=category,
            tag_id=tag,
            with_body=body,
        )
        if tenant is not None
        else None
    )
    if items is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=MSG_PUBLIC_NOT_FOUND
        )
    return ApiResponse.ok([PublicContentItem.model_validate(i) for i in items])


# ── 공통 블록 (T-260, CM-04) ──────────────────────────────────────────────


@router.get(
    "/blocks",
    response_model=ApiResponse[list[ContentBlockResponse]],
    dependencies=_feature,
)
async def list_blocks(
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """블록 · 쓰는 섹션."""
    blocks = await block_service.list_blocks(db, tenant_id)
    return ApiResponse.ok([ContentBlockResponse.model_validate(b) for b in blocks])


@router.post(
    "/blocks",
    response_model=ApiResponse[ContentBlockResponse],
    status_code=status.HTTP_201_CREATED,
    dependencies=_feature,
)
async def create_block(
    body: ContentBlockCreate,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """섹션 값으로 블록 만들기 — 그 섹션은 참조형으로 이어진다."""
    view = await block_service.create_from_section(
        db, tenant_id, body.section_id, body.name
    )
    return ApiResponse.ok(ContentBlockResponse.model_validate(view))


@router.post("/blocks/unlink", response_model=ApiResponse[None], dependencies=_feature)
async def unlink_block(
    body: ContentBlockUnlink,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """섹션의 연결 끊기 — 값은 그대로, 이후 이 섹션만 따로."""
    await block_service.unlink(db, tenant_id, body.section_id)
    return ApiResponse.ok(None)


@router.patch(
    "/blocks/{block_id}",
    response_model=ApiResponse[ContentBlockResponse],
    dependencies=_feature,
)
async def rename_block(
    block_id: UUID,
    body: ContentBlockRename,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    view = await block_service.rename_block(db, tenant_id, block_id, body.name)
    return ApiResponse.ok(ContentBlockResponse.model_validate(view))


@router.delete(
    "/blocks/{block_id}", response_model=ApiResponse[None], dependencies=_feature
)
async def delete_block(
    block_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """쓰는 섹션이 있으면 409."""
    await block_service.delete_block(db, tenant_id, block_id)
    return ApiResponse.ok(None)


@router.post(
    "/blocks/{block_id}/sections",
    response_model=ApiResponse[dict],
    status_code=status.HTTP_201_CREATED,
    dependencies=_feature,
)
async def add_block_section(
    block_id: UUID,
    body: ContentBlockAddSection,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """블록으로 섹션 더하기 — 한도 · 종류는 섹션 추가와 같다 (422 · 400 · 404)."""
    try:
        section_id = await block_service.add_section(
            db, tenant_id, block_id, body.page_key, body.mode
        )
    except section_manage.PageNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except section_manage.SectionLimitError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "PLAN_LIMIT_EXCEEDED", "message": str(e)},
        ) from e
    except section_manage.SectionTypeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        ) from e
    return ApiResponse.ok({"section_id": str(section_id)})
