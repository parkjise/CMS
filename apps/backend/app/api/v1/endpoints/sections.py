import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls, get_tenant_id
from app.core.redis import get_redis
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.section import (
    SectionCreate,
    SectionLimitsResponse,
    SectionOrderUpdate,
    SectionResponse,
    SectionUpdate,
)
from app.services import section as section_service
from app.services import section_manage, site_cache

router = APIRouter(prefix="/sections", tags=["sections"])

_CACHE_TTL = 300  # 5분


def _cache_key(tenant_id: UUID) -> str:
    return site_cache.sections_key(tenant_id)


@router.get("", response_model=ApiResponse[list[SectionResponse]])
async def list_sections(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    redis = await get_redis()
    cached = await redis.get(_cache_key(tenant_id))
    if cached:
        return ApiResponse.ok(json.loads(cached))

    sections = await section_service.get_sections(db, tenant_id)
    response_data = [SectionResponse.model_validate(s) for s in sections]
    serialized = json.dumps(
        [r.model_dump(mode="json") for r in response_data], default=str
    )
    await redis.setex(_cache_key(tenant_id), _CACHE_TTL, serialized)

    return ApiResponse.ok(response_data)


@router.get("/limits", response_model=ApiResponse[SectionLimitsResponse])
async def get_section_limits(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """요금제 섹션 수 한도 · 추가할 수 있는 종류 (T-037-A)"""
    limits = await section_manage.get_limits(db, tenant_id)
    return ApiResponse.ok(SectionLimitsResponse.model_validate(limits.__dict__))


@router.post(
    "",
    response_model=ApiResponse[SectionResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_section(
    body: SectionCreate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """섹션 추가 — 한도 초과 422 PLAN_LIMIT_EXCEEDED (기획서 AD-02, T-037-A)"""
    try:
        section_id = await section_manage.add_section(
            db, tenant_id, body.section_type, body.label
        )
    except section_manage.SectionLimitError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )
    except section_manage.SectionTypeError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    section = await section_service.get_section_by_id(db, section_id, tenant_id)
    return ApiResponse.ok(SectionResponse.model_validate(section))


@router.delete("/{section_id}", response_model=ApiResponse[None])
async def delete_section(
    section_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """섹션 삭제 (소프트 삭제) — BASIC · 코드형 템플릿은 422 (T-037-A)"""
    try:
        deleted = await section_manage.delete_section(db, tenant_id, section_id)
    except section_manage.SectionLimitError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    return ApiResponse.ok(None)


@router.get("/{section_id}", response_model=ApiResponse[SectionResponse])
async def get_section(
    section_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    section = await section_service.get_section_by_id(db, section_id, tenant_id)
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    return ApiResponse.ok(SectionResponse.model_validate(section))


@router.patch("/order", response_model=ApiResponse[None])
async def reorder_sections(
    body: SectionOrderUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    await section_service.update_sections_order(db, body.sections, tenant_id)
    # 관리자 목록 + 공개 사이트 + 홈페이지 캐시 (T-066-A)
    # — 전에는 목록만 비워 홈페이지에 최대 10분 늦게 반영
    await site_cache.purge_site(db, tenant_id)
    return ApiResponse.ok(None)


@router.patch("/{section_id}", response_model=ApiResponse[SectionResponse])
async def update_section(
    section_id: UUID,
    body: SectionUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    try:
        section = await section_service.update_section_settings(
            db, section_id, tenant_id, body
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")

    await site_cache.purge_site(db, tenant_id)
    return ApiResponse.ok(SectionResponse.model_validate(section))


@router.patch("/{section_id}/toggle", response_model=ApiResponse[SectionResponse])
async def toggle_section(
    section_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    # 현재 상태를 읽어 반전
    current = await section_service.get_section_by_id(db, section_id, tenant_id)
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")

    section = await section_service.toggle_section(
        db, section_id, not current.is_active, tenant_id
    )
    await site_cache.purge_site(db, tenant_id)
    return ApiResponse.ok(SectionResponse.model_validate(section))
