from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.edit import BatchSaveRequest, BatchSaveResponse
from app.services import edit as edit_service

router = APIRouter(prefix="/edit", tags=["edit"])


@router.post("/batch-save", response_model=ApiResponse[BatchSaveResponse])
async def batch_save(
    body: BatchSaveRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    result = await edit_service.batch_save(db, current_user.tenant_id, body.changes)
    return ApiResponse.ok(result)
