"""T-108 방문자 회원 인증 API (기획서 16.10).

`/api/public/{tenant_slug}/auth/*` — 테넌트별로 격리된다.
refresh 토큰은 `member_refresh_token` 쿠키에 담는다. 도메인을 지정하지 않아(호스트 한정)
서브도메인과 공유하지 않고, path 를 테넌트 API 경로로 한정해 같은 호스트의 다른
테넌트에 보내지 않는다.
"""

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from pydantic import EmailStr
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_member, get_member_db, get_member_tenant
from app.models.site_member import SiteMember
from app.models.tenant import Tenant
from app.schemas.common import ApiResponse
from app.schemas.site_member import (
    EmailCheckResponse,
    FindEmailRequest,
    FindEmailResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    FoundAccount,
    MemberAuthResponse,
    MemberLoginRequest,
    MemberRegisterRequest,
    MemberSummary,
    PhoneSendRequest,
    PhoneSendResponse,
    PhoneVerifyRequest,
    PhoneVerifyResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    ResetTokenCheckResponse,
)
from app.services import member_auth as member_auth_service
from app.services import member_recovery, member_verification

router = APIRouter(prefix="/{tenant_slug}/auth", tags=["public-member"])

# 인증 API IP 당 10회/분 (기획서 16.11)
limiter = Limiter(key_func=get_remote_address)
_RATE = "10/minute"

REFRESH_COOKIE = "member_refresh_token"
_COOKIE_MAX_AGE = 60 * 60 * 24 * settings.refresh_token_expire_days


def _cookie_path(tenant: Tenant) -> str:
    return f"/api/public/{tenant.slug}"


def _set_refresh_cookie(
    response: Response, tenant: Tenant, token: str, remember: bool
) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=(settings.app_env != "development"),
        samesite="lax",
        path=_cookie_path(tenant),
        # 로그인 상태 유지가 아니면 브라우저 종료 시 사라지는 세션 쿠키
        max_age=_COOKIE_MAX_AGE if remember else None,
    )


def _delete_refresh_cookie(response: Response, tenant: Tenant) -> None:
    response.delete_cookie(key=REFRESH_COOKIE, httponly=True, path=_cookie_path(tenant))


def _auth_response(
    response: Response, tenant: Tenant, member: SiteMember, remember: bool
) -> ApiResponse[MemberAuthResponse]:
    access, refresh = member_auth_service.issue_tokens(member, remember)
    _set_refresh_cookie(response, tenant, refresh, remember)
    return ApiResponse.ok(
        MemberAuthResponse(
            access_token=access, member=MemberSummary.model_validate(member)
        )
    )


@router.post(
    "/register",
    response_model=ApiResponse[MemberAuthResponse],
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(_RATE)
async def register(
    request: Request,
    body: MemberRegisterRequest,
    response: Response,
    tenant: Tenant = Depends(get_member_tenant),
    db: AsyncSession = Depends(get_member_db),
):
    """일반 회원가입 → 자동 로그인 (refresh 쿠키는 세션 쿠키)."""
    member = await member_auth_service.register(db, tenant, body)
    return _auth_response(response, tenant, member, remember=False)


@router.post("/login", response_model=ApiResponse[MemberAuthResponse])
@limiter.limit(_RATE)
async def login(
    request: Request,
    body: MemberLoginRequest,
    response: Response,
    tenant: Tenant = Depends(get_member_tenant),
    db: AsyncSession = Depends(get_member_db),
):
    member = await member_auth_service.authenticate(
        db, tenant, body.email, body.password
    )
    return _auth_response(response, tenant, member, body.remember_me)


@router.post("/refresh", response_model=ApiResponse[MemberAuthResponse])
@limiter.limit(_RATE)
async def refresh(
    request: Request,
    response: Response,
    tenant: Tenant = Depends(get_member_tenant),
    db: AsyncSession = Depends(get_member_db),
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
):
    """refresh 회전 — 이전 refresh 토큰은 다시 쓸 수 없다."""
    member, access, new_refresh, remember = await member_auth_service.refresh(
        db, tenant, refresh_token
    )
    _set_refresh_cookie(response, tenant, new_refresh, remember)
    return ApiResponse.ok(
        MemberAuthResponse(
            access_token=access, member=MemberSummary.model_validate(member)
        )
    )


@router.post("/logout", response_model=ApiResponse[dict])
async def logout(
    response: Response,
    tenant: Tenant = Depends(get_member_tenant),
    _member: SiteMember = Depends(get_current_member),
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
):
    await member_auth_service.logout(tenant, refresh_token)
    _delete_refresh_cookie(response, tenant)
    return ApiResponse.ok({"logged_out": True})


@router.get("/check-email", response_model=ApiResponse[EmailCheckResponse])
@limiter.limit("30/minute")
async def check_email(
    request: Request,
    email: EmailStr,
    tenant: Tenant = Depends(get_member_tenant),
    db: AsyncSession = Depends(get_member_db),
):
    """가입 화면 이메일 중복 확인 (1초 디바운스 호출)."""
    available = await member_auth_service.is_email_available(db, tenant.id, email)
    return ApiResponse.ok(
        EmailCheckResponse(
            email=member_auth_service.normalize_email(email), available=available
        )
    )


# ── 휴대폰 인증 · 계정 찾기 · 비밀번호 재설정 (T-109, 기획서 16.5 · 16.6) ──


@router.post("/phone/send", response_model=ApiResponse[PhoneSendResponse])
@limiter.limit(_RATE)
async def send_phone_code(
    request: Request,
    body: PhoneSendRequest,
    tenant: Tenant = Depends(get_member_tenant),
    db: AsyncSession = Depends(get_member_db),
):
    """인증번호 문자 발송 (3분 · 하루 5회 · 60초 간격)."""
    verification, resend_after = await member_verification.send_code(
        db, tenant, body.phone, body.purpose
    )
    return ApiResponse.ok(
        PhoneSendResponse(
            verification_id=verification.id,
            expires_at=verification.expires_at,
            resend_after_seconds=resend_after,
            debug_code=(
                verification.code if member_verification.debug_code_enabled() else None
            ),
        )
    )


@router.post("/phone/verify", response_model=ApiResponse[PhoneVerifyResponse])
@limiter.limit(_RATE)
async def verify_phone_code(
    request: Request,
    body: PhoneVerifyRequest,
    tenant: Tenant = Depends(get_member_tenant),
    db: AsyncSession = Depends(get_member_db),
):
    verification = await member_verification.verify_code(
        db, tenant, body.verification_id, body.code
    )
    return ApiResponse.ok(
        PhoneVerifyResponse(verification_id=verification.id, verified=True)
    )


@router.post("/find-email", response_model=ApiResponse[FindEmailResponse])
@limiter.limit(_RATE)
async def find_email(
    request: Request,
    body: FindEmailRequest,
    tenant: Tenant = Depends(get_member_tenant),
    db: AsyncSession = Depends(get_member_db),
):
    members = await member_recovery.find_email(
        db, tenant, body.name, body.phone_verification_id
    )
    return ApiResponse.ok(
        FindEmailResponse(
            accounts=[
                FoundAccount(
                    masked_email=member_recovery.mask_email(m.email),
                    social_provider=m.social_provider,  # type: ignore[arg-type]
                    created_at=m.created_at,
                )
                for m in members
            ]
        )
    )


@router.post("/forgot-password", response_model=ApiResponse[ForgotPasswordResponse])
@limiter.limit(_RATE)
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    tenant: Tenant = Depends(get_member_tenant),
    db: AsyncSession = Depends(get_member_db),
):
    """재설정 링크 발송 — 계정이 없어도 같은 응답 (기획서 16.11)."""
    masked = await member_recovery.request_reset(
        db, tenant, body.email, body.phone_verification_id
    )
    return ApiResponse.ok(
        ForgotPasswordResponse(
            masked_email=masked,
            expires_in_minutes=member_recovery.RESET_TOKEN_MINUTES,
            resend_after_seconds=member_recovery.RESET_RESEND_SECONDS,
        )
    )


@router.get(
    "/reset-password/check", response_model=ApiResponse[ResetTokenCheckResponse]
)
@limiter.limit(_RATE)
async def check_reset_token(
    request: Request,
    token: str,
    tenant: Tenant = Depends(get_member_tenant),
    db: AsyncSession = Depends(get_member_db),
):
    """재설정 화면 진입 전 링크 확인 — 만료·사용된 링크는 400 TOKEN_EXPIRED."""
    masked = await member_recovery.check_reset_token(db, tenant, token)
    return ApiResponse.ok(ResetTokenCheckResponse(valid=True, masked_email=masked))


@router.post("/reset-password", response_model=ApiResponse[ResetPasswordResponse])
@limiter.limit(_RATE)
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    tenant: Tenant = Depends(get_member_tenant),
    db: AsyncSession = Depends(get_member_db),
):
    """새 비밀번호 저장 — 다른 기기 로그인 해제 + 보안 알림."""
    await member_recovery.reset_password(db, tenant, body)
    return ApiResponse.ok(ResetPasswordResponse(reset=True))
