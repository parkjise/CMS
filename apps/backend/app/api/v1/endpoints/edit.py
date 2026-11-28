from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls, get_tenant_id
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.edit import BatchSaveRequest, BatchSaveResponse
from app.services import content_block
from app.services import edit as edit_service

router = APIRouter(prefix="/edit", tags=["edit"])


@router.post("/batch-save", response_model=ApiResponse[BatchSaveResponse])
async def batch_save(
    body: BatchSaveRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    result = await edit_service.batch_save(db, tenant_id, body.changes)
    # 공통 블록(참조형)에 이어진 섹션이면 다른 이어진 섹션도 같은 값으로 (T-260)
    for section_id in dict.fromkeys(change.section_id for change in body.changes):
        await content_block.sync_from_section(db, tenant_id, section_id)
    return ApiResponse.ok(result)
