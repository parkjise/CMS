"""관리자 개인 화면 설정 (T-181) — 로그인한 본인 것만."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import (
    get_current_user,
    get_db_with_rls,
    get_tenant_id,
    require_feature,
)
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.preference import PostTableLayout, PostTableLayoutResponse
from app.services import board as board_service
from app.services import preference as preference_service

MSG_BOARD_NOT_FOUND = "게시판을 찾을 수 없습니다."

router = APIRouter(prefix="/me/preferences", tags=["preferences"])


async def _board_key(
    board_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
) -> str:
    """같은 사업체의 게시판인지 확인하고 설정 key 를 돌려준다."""
    if await board_service.get_board(db, tenant_id, board_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": MSG_BOARD_NOT_FOUND},
        )
    return preference_service.post_table_key(board_id)


_board_feature = [Depends(require_feature("BOARD_MANAGER"))]


@router.get(
    "/post-table/{board_id}",
    response_model=ApiResponse[PostTableLayoutResponse | None],
    dependencies=_board_feature,
)
async def get_post_table_layout(
    key: str = Depends(_board_key),
    db: AsyncSession = Depends(get_db_with_rls),
    user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """저장한 열 설정 — 없으면 data 가 null (화면은 기본 순서 · 보통 크기)."""
    saved = await preference_service.get_preference(db, tenant_id, user.id, key)
    if saved is None:
        return ApiResponse.ok(None)
    return ApiResponse.ok(
        PostTableLayoutResponse.model_validate(
            {**saved.value, "updated_at": saved.updated_at}
        )
    )


@router.put(
    "/post-table/{board_id}",
    response_model=ApiResponse[PostTableLayoutResponse],
    dependencies=_board_feature,
)
async def save_post_table_layout(
    data: PostTableLayout,
    key: str = Depends(_board_key),
    db: AsyncSession = Depends(get_db_with_rls),
    user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    saved = await preference_service.save_preference(
        db, tenant_id, user.id, key, data.model_dump()
    )
    return ApiResponse.ok(
        PostTableLayoutResponse.model_validate(
            {**saved.value, "updated_at": saved.updated_at}
        )
    )


@router.delete(
    "/post-table/{board_id}",
    response_model=ApiResponse[dict],
    dependencies=_board_feature,
)
async def reset_post_table_layout(
    key: str = Depends(_board_key),
    db: AsyncSession = Depends(get_db_with_rls),
    user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    reset = await preference_service.reset_preference(db, tenant_id, user.id, key)
    return ApiResponse.ok({"reset": reset})
