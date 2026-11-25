"""페이지 관리 API (T-237, 페이지 관리 기획서 PART C 2번).

목록은 스위치와 상관없이 볼 수 있다(기본 페이지만 있어도). 그 밖은 CUSTOM_PAGES 가
켜진 사업체만. 보기 전용 계정의 쓰기는 라우터 공통 의존성이 막는다.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_with_rls, get_tenant_id, require_feature
from app.schemas.common import ApiResponse
from app.schemas.page import (
    PageCreate,
    PageDuplicate,
    PageKeyCheckResponse,
    PageListResponse,
    PageOrderUpdate,
    PageResponse,
    PageUpdate,
    PageUsageResponse,
)
from app.schemas.section import SectionPreviewResponse
from app.services import page as page_service
from app.services import section_draft

router = APIRouter(prefix="/pages", tags=["pages"])

_feature = [Depends(require_feature(page_service.FEATURE_KEY))]


@router.get("", response_model=ApiResponse[PageListResponse])
async def list_pages(
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """기본 + 직접 만든 페이지, 휴지통, 요금제 한도, 스위치."""
    return ApiResponse.ok(
        PageListResponse.model_validate(await page_service.list_pages(db, tenant_id))
    )


@router.get(
    "/check-key",
    response_model=ApiResponse[PageKeyCheckResponse],
    dependencies=_feature,
)
async def check_key(
    key: str = Query(..., max_length=100),
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """주소 미리 확인 — 형식 · 쓸 수 없는 주소 · 사용 중, 이유와 함께."""
    available, reason = await page_service.check_key(db, tenant_id, key)
    return ApiResponse.ok(PageKeyCheckResponse(available=available, reason=reason))


@router.post(
    "",
    response_model=ApiResponse[PageResponse],
    status_code=status.HTTP_201_CREATED,
    dependencies=_feature,
)
async def create_page(
    body: PageCreate,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """빈 페이지 추가 — 한도 초과 422 PLAN_LIMIT_EXCEEDED, 주소 충돌 409."""
    page = await page_service.create_page(db, tenant_id, body)
    return ApiResponse.ok(PageResponse.model_validate(page))


@router.patch("/order", response_model=ApiResponse[None], dependencies=_feature)
async def reorder_pages(
    body: PageOrderUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    await page_service.reorder_pages(db, tenant_id, body.ids)
    return ApiResponse.ok(None)


@router.patch(
    "/{page_id}", response_model=ApiResponse[PageResponse], dependencies=_feature
)
async def update_page(
    page_id: UUID,
    body: PageUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """이름 · 주소 · 상위 · 메뉴 · 공개 · SEO — 주소를 바꾸면 이전 주소 이동 기록."""
    page = await page_service.update_page(db, tenant_id, page_id, body)
    return ApiResponse.ok(PageResponse.model_validate(page))


@router.post(
    "/{page_id}/duplicate",
    response_model=ApiResponse[PageResponse],
    status_code=status.HTTP_201_CREATED,
    dependencies=_feature,
)
async def duplicate_page(
    page_id: UUID,
    body: PageDuplicate,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """섹션까지 복사한 숨김 페이지."""
    page = await page_service.duplicate_page(db, tenant_id, page_id, body)
    return ApiResponse.ok(PageResponse.model_validate(page))


@router.get(
    "/{page_id}/usage",
    response_model=ApiResponse[PageUsageResponse],
    dependencies=_feature,
)
async def page_usage(
    page_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """이 페이지를 가리키는 메뉴 · 섹션 링크 (T-242) — 지우기 · 주소 변경 전 안내."""
    found = await page_service.usage(db, tenant_id, page_id)
    return ApiResponse.ok(PageUsageResponse.model_validate(found))


@router.post("/{page_id}/preview", response_model=ApiResponse[SectionPreviewResponse])
async def preview_page(
    page_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """페이지 미리보기 (T-244, PM-06) — 숨김 페이지도 10분 동안 관리자만 보는 주소로.

    스위치와 상관없이 기본 페이지도 미리볼 수 있다. 직접 만든 페이지는 스위치가 꺼지면
    홈페이지가 그리지 않는다.
    """
    page_key = await page_service.preview_key(db, tenant_id, page_id)
    token = await section_draft.create_page_preview(tenant_id, page_key)
    return ApiResponse.ok(
        SectionPreviewResponse(
            token=token,
            page_key=page_key,
            expires_in=section_draft.DRAFT_TTL_SECONDS,
        )
    )


@router.delete("/{page_id}", response_model=ApiResponse[None], dependencies=_feature)
async def delete_page(
    page_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """휴지통으로 — 홈 · 템플릿 기본 페이지는 403."""
    await page_service.delete_page(db, tenant_id, page_id)
    return ApiResponse.ok(None)


@router.post(
    "/{page_id}/restore",
    response_model=ApiResponse[PageResponse],
    dependencies=_feature,
)
async def restore_page(
    page_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    page = await page_service.restore_page(db, tenant_id, page_id)
    return ApiResponse.ok(PageResponse.model_validate(page))
