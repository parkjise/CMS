"""T-110 마이페이지 소셜 계정 연결 · 해제 API (기획서 16.7).

`/api/public/{tenant_slug}/members/me/social/*` — 로그인한 방문자만.
연결은 소셜 로그인과 같은 콜백(`POST /auth/social`)을 쓰며 state 에 연결 모드가 담긴다.
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.public.member_auth import _RATE, limiter, parse_provider
from app.core.deps import get_current_member, get_member_db, get_member_tenant
from app.models.site_member import SiteMember
from app.models.tenant import Tenant
from app.schemas.common import ApiResponse
from app.schemas.site_member import (
    SocialAccountItem,
    SocialAccountsResponse,
    SocialAuthorizeResponse,
)
from app.services import member_social

router = APIRouter(prefix="/{tenant_slug}/members/me/social", tags=["public-member"])


async def _accounts_response(
    db: AsyncSession, member: SiteMember
) -> ApiResponse[SocialAccountsResponse]:
    accounts = await member_social.list_accounts(db, member)
    return ApiResponse.ok(
        SocialAccountsResponse(
            accounts=[
                SocialAccountItem(
                    provider=a.provider,  # type: ignore[arg-type]
                    email=a.email,
                    linked_at=a.created_at,
                )
                for a in accounts
            ],
            has_password=bool(member.password_hash),
        )
    )


@router.get("", response_model=ApiResponse[SocialAccountsResponse])
async def list_social_accounts(
    tenant: Tenant = Depends(get_member_tenant),
    db: AsyncSession = Depends(get_member_db),
    member: SiteMember = Depends(get_current_member),
):
    await member_social.ensure_enabled(db, tenant)
    return await _accounts_response(db, member)


@router.post(
    "/{provider}/authorize", response_model=ApiResponse[SocialAuthorizeResponse]
)
@limiter.limit(_RATE)
async def link_authorize(
    request: Request,
    provider: str,
    return_to: str | None = None,
    stub_user: str | None = None,
    tenant: Tenant = Depends(get_member_tenant),
    db: AsyncSession = Depends(get_member_db),
    member: SiteMember = Depends(get_current_member),
):
    """연결하기 — 소셜 로그인 주소 (state 에 연결 모드 + 회원 id)."""
    await member_social.ensure_enabled(db, tenant)
    url, state = await member_social.start(
        tenant,
        parse_provider(provider),
        "link",
        return_to or f"/{tenant.slug}/member/mypage",
        member_id=member.id,
        stub_user=stub_user,
    )
    return ApiResponse.ok(SocialAuthorizeResponse(authorize_url=url, state=state))


@router.delete("/{provider}", response_model=ApiResponse[SocialAccountsResponse])
async def unlink_social_account(
    provider: str,
    tenant: Tenant = Depends(get_member_tenant),
    db: AsyncSession = Depends(get_member_db),
    member: SiteMember = Depends(get_current_member),
):
    await member_social.ensure_enabled(db, tenant)
    await member_social.unlink(db, member, parse_provider(provider))
    return await _accounts_response(db, member)
