from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, get_db_with_rls
from app.models.user import User
from app.schemas.common import ApiResponse
from app.services import analytics as analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])
public_router = APIRouter(prefix="/analytics", tags=["public"])

# 1×1 투명 GIF
_1PX_GIF = bytes([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
    0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
    0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
    0x01, 0x00, 0x3b,
])


@public_router.post("/pageview")
async def record_pageview(
    request: Request,
    tenant_id: str,
    db: AsyncSession = Depends(get_db),
):
    """1px 비콘 방식 페이지뷰 수집. tenant_id 쿼리 파라미터 필수."""
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else "unknown"
    )
    ua = request.headers.get("User-Agent", "")

    try:
        await analytics_service.record_pageview(tenant_id, ip, ua)
    except Exception:
        pass  # 수집 실패가 서비스를 막아서는 안 됨

    return Response(
        content=_1PX_GIF,
        media_type="image/gif",
        headers={"Cache-Control": "no-cache, no-store"},
    )


@router.get("/summary", response_model=ApiResponse[dict])
async def get_summary(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    result = await analytics_service.get_summary(db, current_user.tenant_id)
    return ApiResponse.ok(result)
