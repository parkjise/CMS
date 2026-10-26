"""T-111 방문자 마이페이지 · 탈퇴 API (기획서 16.7 · 16.8 · 16.10).

`/api/public/{tenant_slug}/members/*` — 로그인한 방문자만
(다른 테넌트 · 어드민 토큰은 403).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.public.member_auth import _delete_refresh_cookie, _set_refresh_cookie
from app.core import member_errors as errors
from app.core.deps import get_current_member, get_member_db, get_member_tenant
from app.core.member_errors import MemberAuthError
from app.models.inquiry import Inquiry
from app.models.site_member import SiteMember
from app.models.tenant import Tenant
from app.schemas.common import ApiResponse
from app.schemas.site_member import (
    MemberInquiryDetail,
    MemberInquiryItem,
    MemberInquiryList,
    MemberNotificationSettings,
    MemberPasswordChangeRequest,
    MemberPasswordChangeResponse,
    MemberReservationList,
    MemberReservationResponse,
    MemberResponse,
    MemberUpdateRequest,
    MemberWithdrawRequest,
    ReservationStatus,
)
from app.services import member_activity, member_profile
from app.services import member_auth as member_auth_service

router = APIRouter(prefix="/{tenant_slug}/members", tags=["public-member"])

NOTIFICATION_FIELDS = tuple(MemberNotificationSettings.model_fields)
RESERVATION_MONTHS = (3, 6, 12)


async def _me(db: AsyncSession, member: SiteMember) -> ApiResponse[MemberResponse]:
    data = MemberResponse.model_validate(member).model_dump()
    data["social_accounts"] = await member_profile.social_providers_of(db, member)
    return ApiResponse.ok(MemberResponse(**data))


def _notifications(member: SiteMember) -> MemberNotificationSettings:
    return MemberNotificationSettings(
        **{field: getattr(member, field) for field in NOTIFICATION_FIELDS}
    )


def _inquiry_item(inquiry: Inquiry) -> dict:
    return {
        "id": inquiry.id,
        "inquiry_type": inquiry.inquiry_type,
        "subject": inquiry.subject,
        "is_board": inquiry.is_board,
        "answered": member_activity.is_answered(inquiry),
        "created_at": inquiry.created_at,
    }


# ── 내 정보 ────────────────────────────────────────────────────────────────


@router.get("/me", response_model=ApiResponse[MemberResponse])
async def get_me(
    db: AsyncSession = Depends(get_member_db),
    member: SiteMember = Depends(get_current_member),
):
    return await _me(db, member)


@router.patch("/me", response_model=ApiResponse[MemberResponse])
async def update_me(
    body: MemberUpdateRequest,
    db: AsyncSession = Depends(get_member_db),
    member: SiteMember = Depends(get_current_member),
):
    """이름 · 생년월일 · 연락처(새 번호 휴대폰 인증 필요). 이메일은 변경 불가."""
    member = await member_profile.update_profile(db, member, body)
    return await _me(db, member)


@router.patch("/me/password", response_model=ApiResponse[MemberPasswordChangeResponse])
async def change_password(
    body: MemberPasswordChangeRequest,
    response: Response,
    tenant: Tenant = Depends(get_member_tenant),
    db: AsyncSession = Depends(get_member_db),
    member: SiteMember = Depends(get_current_member),
):
    """비밀번호 변경 — 다른 기기 로그인 해제, 이 기기는 새 토큰으로 유지."""
    member = await member_profile.change_password(db, member, body)
    access, refresh = member_auth_service.issue_tokens(member, False)
    _set_refresh_cookie(response, tenant, refresh, False)
    return ApiResponse.ok(MemberPasswordChangeResponse(access_token=access))


@router.get("/me/notification", response_model=ApiResponse[MemberNotificationSettings])
async def get_notifications(member: SiteMember = Depends(get_current_member)):
    return ApiResponse.ok(_notifications(member))


@router.patch(
    "/me/notification", response_model=ApiResponse[MemberNotificationSettings]
)
async def update_notifications(
    body: MemberNotificationSettings,
    db: AsyncSession = Depends(get_member_db),
    member: SiteMember = Depends(get_current_member),
):
    """보낸 항목만 변경."""
    member = await member_profile.update_notifications(db, member, body)
    return ApiResponse.ok(_notifications(member))


@router.delete("/me", response_model=ApiResponse[dict])
async def withdraw(
    body: MemberWithdrawRequest,
    response: Response,
    tenant: Tenant = Depends(get_member_tenant),
    db: AsyncSession = Depends(get_member_db),
    member: SiteMember = Depends(get_current_member),
):
    """회원 탈퇴 — 진행 중 예약이 있으면 409, 개인정보 익명화 + 탈퇴 안내."""
    await member_profile.withdraw(db, tenant, member, body)
    _delete_refresh_cookie(response, tenant)
    return ApiResponse.ok({"withdrawn": True})


# ── 내 예약 ────────────────────────────────────────────────────────────────


@router.get("/reservations", response_model=ApiResponse[MemberReservationList])
async def list_reservations(
    status: ReservationStatus | None = None,
    months: int | None = Query(None, description="최근 N개월 (3 · 6 · 12)"),
    db: AsyncSession = Depends(get_member_db),
    member: SiteMember = Depends(get_current_member),
):
    if months is not None and months not in RESERVATION_MONTHS:
        raise MemberAuthError(
            400, "VALIDATION_ERROR", errors.VALIDATION_ERROR, field="months"
        )
    items = await member_activity.list_reservations(db, member, status, months)
    return ApiResponse.ok(
        MemberReservationList(
            items=[MemberReservationResponse.model_validate(r) for r in items]
        )
    )


@router.post(
    "/reservations/{reservation_id}/cancel",
    response_model=ApiResponse[MemberReservationResponse],
)
async def cancel_reservation(
    reservation_id: UUID,
    db: AsyncSession = Depends(get_member_db),
    member: SiteMember = Depends(get_current_member),
):
    reservation = await member_activity.cancel_reservation(db, member, reservation_id)
    return ApiResponse.ok(MemberReservationResponse.model_validate(reservation))


# ── 내 문의 ────────────────────────────────────────────────────────────────


@router.get("/inquiries", response_model=ApiResponse[MemberInquiryList])
async def list_inquiries(
    db: AsyncSession = Depends(get_member_db),
    member: SiteMember = Depends(get_current_member),
):
    items = await member_activity.list_inquiries(db, member)
    return ApiResponse.ok(
        MemberInquiryList(items=[MemberInquiryItem(**_inquiry_item(i)) for i in items])
    )


@router.get("/inquiries/{inquiry_id}", response_model=ApiResponse[MemberInquiryDetail])
async def get_inquiry(
    inquiry_id: UUID,
    db: AsyncSession = Depends(get_member_db),
    member: SiteMember = Depends(get_current_member),
):
    inquiry = await member_activity.get_inquiry(db, member, inquiry_id)
    return ApiResponse.ok(
        MemberInquiryDetail(
            **_inquiry_item(inquiry),
            message=inquiry.message,
            answer=inquiry.answer,
            answered_at=inquiry.answered_at,
            reserved_date=inquiry.reserved_date,
            reserved_time=inquiry.reserved_time,
        )
    )
