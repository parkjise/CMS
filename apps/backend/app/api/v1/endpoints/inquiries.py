from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import (
    get_current_user,
    get_db,
    get_db_with_rls,
    optional_member_payload,
)
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.inquiry import (
    InquiryCreate,
    InquiryListResponse,
    InquiryResponse,
    InquiryUpdate,
    ReservationStatusUpdate,
)
from app.schemas.inquiry_board import (
    BoardListResponse,
    BoardPostCreate,
    BoardPostDetail,
    BoardUnlockRequest,
)
from app.services import inquiry as inquiry_service
from app.services import inquiry_board as board_service
from app.services import member_activity
from app.services import member_reservation_admin as reservation_admin

# 관리자 전용 라우터 — main.py에서 /api/v1 prefix로 등록
router = APIRouter(prefix="/inquiries", tags=["inquiries"])

# 공개 라우터 — main.py에서 /api/public prefix로 등록
public_router = APIRouter(prefix="/inquiries", tags=["public"])

_limiter = Limiter(key_func=get_remote_address)


async def _verify_recaptcha(token: str | None) -> None:
    if not settings.recaptcha_secret_key:
        return
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="RECAPTCHA_REQUIRED"
        )
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.post(
            "https://www.google.com/recaptcha/api/siteverify",
            data={"secret": settings.recaptcha_secret_key, "response": token},
        )
    result = resp.json()
    score_ok = result.get("score", 0) >= settings.recaptcha_min_score
    if not result.get("success") or not score_ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="RECAPTCHA_FAILED"
        )


# ── Public ──────────────────────────────────────────────────────────────────


async def _resolve_public_tenant(db: AsyncSession, tenant_slug: str) -> Tenant:
    """공개 API: 슬러그로 활성 테넌트를 찾고 그 테넌트로 RLS 를 설정한다."""
    await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    tenant_result = await db.execute(
        select(Tenant).where(Tenant.slug == tenant_slug, Tenant.is_active == True)  # noqa: E712
    )
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    await db.execute(text("SELECT set_config('app.is_super_admin', 'false', true)"))
    await db.execute(
        text("SELECT set_config('app.current_tenant_id', :tid, true)"),
        {"tid": str(tenant.id)},
    )
    return tenant


@public_router.post("", response_model=ApiResponse[dict])
@_limiter.limit("3/minute")
async def submit_inquiry(
    request: Request,
    body: InquiryCreate,
    tenant_slug: str = Query(..., description="테넌트 슬러그"),
    db: AsyncSession = Depends(get_db),
    member_payload: dict | None = Depends(optional_member_payload),
):
    await _verify_recaptcha(body.recaptcha_token)
    tenant = await _resolve_public_tenant(db, tenant_slug)
    member_id = await member_activity.active_member_id(db, tenant, member_payload)
    inquiry = await inquiry_service.create_inquiry(
        db, tenant.id, body, member_id=member_id, tenant=tenant
    )
    return ApiResponse.ok(
        {"inquiry_id": str(inquiry.id), "message": "문의가 접수되었습니다."}
    )


# ── Public: 온라인 상담 게시판 (T-123) ────────────────────────────────────────


@public_router.get("/board", response_model=ApiResponse[BoardListResponse])
async def list_board_posts(
    tenant_slug: str = Query(..., description="테넌트 슬러그"),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=50),
    q: str | None = Query(None, max_length=60),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _resolve_public_tenant(db, tenant_slug)
    return ApiResponse.ok(await board_service.list_posts(db, tenant.id, page, size, q))


@public_router.post("/board", response_model=ApiResponse[dict])
@_limiter.limit("3/minute")
async def create_board_post(
    request: Request,
    body: BoardPostCreate,
    tenant_slug: str = Query(..., description="테넌트 슬러그"),
    db: AsyncSession = Depends(get_db),
    member_payload: dict | None = Depends(optional_member_payload),
):
    await _verify_recaptcha(body.recaptcha_token)
    tenant = await _resolve_public_tenant(db, tenant_slug)
    member_id = await member_activity.active_member_id(db, tenant, member_payload)
    post = await board_service.create_post(db, tenant.id, body, member_id=member_id)
    return ApiResponse.ok(
        {"post_id": str(post.id), "message": "상담 글이 등록되었습니다."}
    )


@public_router.get("/board/{post_id}", response_model=ApiResponse[BoardPostDetail])
async def get_board_post(
    post_id: UUID,
    tenant_slug: str = Query(..., description="테넌트 슬러그"),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _resolve_public_tenant(db, tenant_slug)
    detail = await board_service.get_post(db, tenant.id, post_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    return ApiResponse.ok(detail)


@public_router.post(
    "/board/{post_id}/unlock", response_model=ApiResponse[BoardPostDetail]
)
@_limiter.limit("10/minute")
async def unlock_board_post(
    request: Request,
    post_id: UUID,
    body: BoardUnlockRequest,
    tenant_slug: str = Query(..., description="테넌트 슬러그"),
    db: AsyncSession = Depends(get_db),
):
    """비밀글 열람: 작성 시 입력한 비밀번호 확인 (IP당 분당 10회)."""
    tenant = await _resolve_public_tenant(db, tenant_slug)
    try:
        detail = await board_service.get_post(db, tenant.id, post_id, body.password)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="비밀번호가 일치하지 않습니다.",
        ) from exc
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    return ApiResponse.ok(detail)


# ── Admin ────────────────────────────────────────────────────────────────────


@router.get("", response_model=ApiResponse[InquiryListResponse])
async def list_inquiries(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    inquiry_type: str | None = Query(None),
    is_read: bool | None = Query(None),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    result = await inquiry_service.get_inquiries(
        db,
        tenant_id=current_user.tenant_id,
        page=page,
        limit=limit,
        status=status_filter,
        inquiry_type=inquiry_type,
        is_read=is_read,
        search=search,
    )
    return ApiResponse.ok(result)


@router.get("/export")
async def export_inquiries(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    inquiries = await inquiry_service.get_all_for_export(db, current_user.tenant_id)
    xlsx_bytes = inquiry_service.export_to_excel(inquiries)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=inquiries.xlsx"},
    )


@router.get("/{inquiry_id}", response_model=ApiResponse[InquiryResponse])
async def get_inquiry(
    inquiry_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    inquiry = await inquiry_service.get_inquiry_by_id(
        db, inquiry_id, current_user.tenant_id
    )
    if not inquiry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    return ApiResponse.ok(await _detail(db, inquiry))


async def _detail(db: AsyncSession, inquiry) -> InquiryResponse:
    """관리자 문의 상세 — 회원 정보 · 회원 예약 상태 포함 (T-115)."""
    response = InquiryResponse.model_validate(inquiry)
    response.member, response.reservation = await reservation_admin.extras(db, inquiry)
    return response


@router.patch("/{inquiry_id}/reservation", response_model=ApiResponse[InquiryResponse])
async def update_member_reservation(
    inquiry_id: UUID,
    body: ReservationStatusUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    """회원 예약 상태 변경 (대기 → 확정 → 완료, 관리자 취소) + 회원 알림 (T-115)."""
    inquiry = await inquiry_service.get_inquiry_by_id(
        db, inquiry_id, current_user.tenant_id
    )
    if not inquiry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    await reservation_admin.change_status(db, inquiry, body.status)
    await db.refresh(inquiry)
    return ApiResponse.ok(await _detail(db, inquiry))


@router.patch("/{inquiry_id}", response_model=ApiResponse[InquiryResponse])
async def update_inquiry(
    inquiry_id: UUID,
    body: InquiryUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    try:
        inquiry = await inquiry_service.update_inquiry(
            db, inquiry_id, current_user.tenant_id, body
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if not inquiry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    return ApiResponse.ok(await _detail(db, inquiry))


@router.delete("/{inquiry_id}", response_model=ApiResponse[None])
async def delete_inquiry(
    inquiry_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    deleted = await inquiry_service.delete_inquiry(
        db, inquiry_id, current_user.tenant_id
    )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    return ApiResponse.ok(None)
