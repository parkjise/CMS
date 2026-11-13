"""T-208 슈퍼 어드민 템플릿 관리 API (상위 기획서 14.1 · 10.2 #12)."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_with_rls, get_super_admin
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.super_template import (
    SuperTemplateCreate,
    SuperTemplateItem,
    SuperTemplateUpdate,
)
from app.services import super_template as svc

router = APIRouter(prefix="/templates", tags=["super-templates"])


def _item(template, usage_count: int) -> SuperTemplateItem:
    item = SuperTemplateItem.model_validate(template)
    item.usage_count = usage_count
    return item


@router.get("", response_model=ApiResponse[list[SuperTemplateItem]])
async def list_templates(
    db: AsyncSession = Depends(get_db_with_rls),
    _: User = Depends(get_super_admin),
):
    rows = await svc.list_templates(db)
    return ApiResponse.ok([_item(t, n) for t, n in rows])


@router.post("", response_model=ApiResponse[SuperTemplateItem])
async def create_template(
    body: SuperTemplateCreate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    """새 테마형 템플릿 — 처음엔 숨김(기본), 확인 뒤 공개."""
    template = await svc.create_template(db, current_user, body)
    return ApiResponse.ok(_item(template, 0))


@router.patch("/{template_id}", response_model=ApiResponse[SuperTemplateItem])
async def update_template(
    template_id: uuid.UUID,
    body: SuperTemplateUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    """이름 · 설명 · 썸네일 · 최소 플랜 · 공개 여부 · (테마형) 색 · 글꼴."""
    template, usage = await svc.update_template(db, current_user, template_id, body)
    return ApiResponse.ok(_item(template, usage))
