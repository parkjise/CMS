from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls
from app.models.user import User
from app.schemas.ai import (
    AiUsageResponse,
    ChatEditRequest,
    CopySuggestRequest,
    CopySuggestResponse,
)
from app.schemas.common import ApiResponse
from app.services import ai as ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/usage", response_model=ApiResponse[AiUsageResponse])
async def get_usage(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    """이번 달 AI 기능 사용 현황(문구 추천 / 대화형 편집)을 플랜 한도와 함께 반환."""
    result = await ai_service.get_usage(db, current_user.tenant_id)
    return ApiResponse.ok(result)


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


@router.post("/chat-edit")
async def chat_edit(
    body: ChatEditRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    """대화형 편집 — SSE 스트리밍. 플랜 한도 초과 시 스트림 시작 전 403/422/429."""
    # 한도/컨텍스트는 스트림 시작 전에 평가해 일반 JSON 에러로 응답
    await ai_service.ensure_not_abusing(current_user.tenant_id)
    await ai_service.ensure_chat_quota(db, current_user.tenant_id)
    site_context = await ai_service.build_site_context(db, current_user.tenant_id)

    generator = ai_service.chat_edit_stream(
        db, current_user.tenant_id, current_user.id, body, site_context
    )
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
