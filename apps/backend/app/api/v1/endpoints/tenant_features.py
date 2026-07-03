"""T-086 테넌트용 기능 조회 API.

로그인한 테넌트의 활성 기능 목록(Redis 5분 캐시) + 미읽은 공지(T-088 연동) 반환.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.feature import TenantActiveFeature, TenantFeaturesResponse
from app.services import announcement as announcement_svc
from app.services import feature as svc

router = APIRouter(prefix="/tenant", tags=["tenant-features"])


@router.get("/features", response_model=ApiResponse[TenantFeaturesResponse])
async def get_my_features(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    data = await svc.get_tenant_features(db, current_user.tenant_id)
    unread = await announcement_svc.list_unread(db, current_user.tenant_id)
    return ApiResponse.ok(
        TenantFeaturesResponse(
            features=[TenantActiveFeature(**f) for f in data["features"]],
            flags=data["flags"],
            announcements=[
                {
                    "id": str(a.id),
                    "title": a.title,
                    "type": a.type,
                    "content": a.content,
                    "is_read": False,
                }
                for a in unread
            ],
        )
    )
