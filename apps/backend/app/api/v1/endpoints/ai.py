from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import (
    get_current_user,
    get_db_with_rls,
    get_tenant_id,
    require_feature,
)
from app.models.user import User
from app.schemas.ai import (
    AiReportListItem,
    AiReportListResponse,
    AiReportQuota,
    AiReportResponse,
    AiUsageResponse,
    ChatEditRequest,
    CopySuggestRequest,
    CopySuggestResponse,
    TemplateRecommendRequest,
    TemplateRecommendResponse,
)
from app.schemas.common import ApiResponse
from app.services import ai as ai_service
from app.services import ai_report, ai_template

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/usage", response_model=ApiResponse[AiUsageResponse])
async def get_usage(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """이번 달 AI 기능 사용 현황(문구 추천 / 대화형 편집)을 플랜 한도와 함께 반환."""
    result = await ai_service.get_usage(db, tenant_id)
    return ApiResponse.ok(result)


@router.post("/suggest-copy", response_model=ApiResponse[CopySuggestResponse])
async def suggest_copy(
    body: CopySuggestRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    result = await ai_service.suggest_copy(db, tenant_id, current_user.id, body)
    return ApiResponse.ok(result)


@router.post("/chat-edit")
async def chat_edit(
    body: ChatEditRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """대화형 편집 — SSE 스트리밍. 플랜 한도 초과 시 스트림 시작 전 403/422/429."""
    # 한도/컨텍스트는 스트림 시작 전에 평가해 일반 JSON 에러로 응답
    await ai_service.ensure_not_abusing(tenant_id)
    await ai_service.ensure_chat_quota(db, tenant_id)
    site_context = await ai_service.build_site_context(db, tenant_id)

    generator = ai_service.chat_edit_stream(
        db, tenant_id, current_user.id, body, site_context
    )
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post(
    "/recommend-templates",
    response_model=ApiResponse[TemplateRecommendResponse],
    dependencies=[Depends(require_feature("AI_TEMPLATE_RECOMMEND"))],
)
async def recommend_templates(
    body: TemplateRecommendRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """AI 템플릿 추천 3개 + 이유 (STANDARD 이상, 기획서 13.4 · T-070-A)"""
    result = await ai_template.recommend_templates(
        db, tenant_id, current_user.id, refresh=body.refresh
    )
    return ApiResponse.ok(result)


# ── AI 월간 리포트 (기획서 13.2 기능 3 · 13.4, T-073-A) ──────────────────
_report_feature = [Depends(require_feature("AI_MONTHLY_REPORT"))]


@router.get(
    "/reports",
    response_model=ApiResponse[AiReportListResponse],
    dependencies=_report_feature,
)
async def list_reports(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """지난 리포트 목록 + 이번 달 남은 횟수"""
    reports = await ai_report.list_reports(db, tenant_id)
    quota = await ai_report.quota(db, tenant_id)
    return ApiResponse.ok(
        AiReportListResponse(
            reports=[
                AiReportListItem(
                    id=r.id,
                    period=r.period,
                    kind=r.kind,  # type: ignore[arg-type]
                    source=r.source,  # type: ignore[arg-type]
                    improvement_count=len(r.improvements or []),
                    created_at=r.created_at,
                )
                for r in reports
            ],
            quota=AiReportQuota(**quota),
        )
    )


@router.post(
    "/reports",
    response_model=ApiResponse[AiReportResponse],
    dependencies=_report_feature,
)
async def create_report(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """직접 만들기 — 이번 달 지금까지 (STANDARD 월 1 · PREMIUM 월 4, 자동 포함)"""
    report = await ai_report.create_manual_report(db, tenant_id, current_user.id)
    return ApiResponse.ok(AiReportResponse.model_validate(report))


@router.get(
    "/reports/{report_id}",
    response_model=ApiResponse[AiReportResponse],
    dependencies=_report_feature,
)
async def get_report(
    report_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_tenant_id),
):
    report = await ai_report.get_report(db, tenant_id, report_id)
    return ApiResponse.ok(AiReportResponse.model_validate(report))
