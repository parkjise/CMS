from fastapi import APIRouter, Depends

from app.core.deps import get_super_admin
from app.models.user import User
from app.schemas.common import ApiResponse

router = APIRouter(tags=["super-admin"])


@router.get("/health", response_model=ApiResponse[dict])
async def super_health(current_user: User = Depends(get_super_admin)):
    return ApiResponse.ok({"status": "ok", "role": current_user.role})
