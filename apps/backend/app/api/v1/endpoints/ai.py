from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls
from app.models.user import User
from app.schemas.ai import CopySuggestRequest, CopySuggestResponse
from app.schemas.common import ApiResponse
from app.services import ai as ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/suggest-copy", response_model=ApiResponse[CopySuggestResponse])
async def suggest_copy(
    body: CopySuggestRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    result = await ai_service.suggest_copy(
        db, current_user.tenant_id, current_user.id, body
    )
    return ApiResponse.ok(result)
