import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls
from app.core.redis import get_redis
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.section import SectionOrderUpdate, SectionResponse, SectionUpdate
from app.services import section as section_service

router = APIRouter(prefix="/sections", tags=["sections"])

_CACHE_TTL = 300  # 5분


def _cache_key(tenant_id: UUID) -> str:
    return f"sections:{tenant_id}"


async def _invalidate_cache(tenant_id: UUID) -> None:
    redis = await get_redis()
    await redis.delete(_cache_key(tenant_id))


@router.get("", response_model=ApiResponse[list[SectionResponse]])
async def list_sections(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    redis = await get_redis()
    cached = await redis.get(_cache_key(current_user.tenant_id))
    if cached:
        return ApiResponse.ok(json.loads(cached))

    sections = await section_service.get_sections(db)
    response_data = [SectionResponse.model_validate(s) for s in sections]
    serialized = json.dumps(
        [r.model_dump(mode="json") for r in response_data], default=str
    )
    await redis.setex(_cache_key(current_user.tenant_id), _CACHE_TTL, serialized)

    return ApiResponse.ok(response_data)


@router.get("/{section_id}", response_model=ApiResponse[SectionResponse])
async def get_section(
    section_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    section = await section_service.get_section_by_id(db, section_id)
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    return ApiResponse.ok(SectionResponse.model_validate(section))


@router.patch("/order", response_model=ApiResponse[None])
async def reorder_sections(
    body: SectionOrderUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    await section_service.update_sections_order(db, body.sections)
    await _invalidate_cache(current_user.tenant_id)
    return ApiResponse.ok(None)


@router.patch("/{section_id}", response_model=ApiResponse[SectionResponse])
async def update_section(
    section_id: UUID,
    body: SectionUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    try:
        section = await section_service.update_section_settings(
            db, section_id, current_user.tenant_id, body
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")

    await _invalidate_cache(current_user.tenant_id)
    return ApiResponse.ok(SectionResponse.model_validate(section))


@router.patch("/{section_id}/toggle", response_model=ApiResponse[SectionResponse])
async def toggle_section(
    section_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    # 현재 상태를 읽어 반전
    current = await section_service.get_section_by_id(db, section_id)
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")

    section = await section_service.toggle_section(
        db, section_id, not current.is_active
    )
    await _invalidate_cache(current_user.tenant_id)
    return ApiResponse.ok(SectionResponse.model_validate(section))
