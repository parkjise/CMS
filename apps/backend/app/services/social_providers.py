"""T-110 카카오 · 네이버 OAuth (기획서 16.4 · 16.11, 오픈 이슈 #24 — 운영사 공용 앱).

인가 코드 교환 · 프로필 조회는 서버에서만 한다. 소셜 access token 은 응답에 담지 않는다.

`settings.social_mode != "live"` 이면 외부 호출 없이 가짜 계정으로 동작한다.
- 로그인 주소가 바로 콜백 페이지로 가며 code 는 `stub-{PROVIDER}-{사용자키}`
- 같은 사용자키(`stub_user`)로 다시 로그인하면 기존 회원 흐름을 확인할 수 있다
"""

import secrets
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlencode

import httpx

from app.core.config import settings

Provider = Literal["KAKAO", "NAVER"]
PROVIDERS: tuple[Provider, ...] = ("KAKAO", "NAVER")

KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize"
KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token"
KAKAO_PROFILE_URL = "https://kapi.kakao.com/v2/user/me"
NAVER_AUTHORIZE_URL = "https://nid.naver.com/oauth2.0/authorize"
NAVER_TOKEN_URL = "https://nid.naver.com/oauth2.0/token"
NAVER_PROFILE_URL = "https://openapi.naver.com/v1/nid/me"

STUB_PREFIX = "stub-"

# 테스트에서 httpx.MockTransport 를 넣는다
transport: httpx.AsyncBaseTransport | None = None


class SocialAuthError(Exception):
    """소셜 서버 응답 오류 (코드 만료 · 키 오류 · 네트워크)."""


@dataclass(frozen=True)
class SocialProfile:
    provider: Provider
    provider_user_id: str
    # 소셜이 확인한 이메일만 (카카오 미인증 이메일은 None)
    email: str | None
    name: str | None


def is_live() -> bool:
    return settings.social_mode == "live"


def authorize_url(provider: Provider, state: str, stub_user: str | None = None) -> str:
    if not is_live():
        code = f"{STUB_PREFIX}{provider}-{stub_user or secrets.token_hex(6)}"
        query = urlencode({"code": code, "state": state})
        return f"{settings.social_redirect_uri}?{query}"
    if provider == "KAKAO":
        params = {
            "response_type": "code",
            "client_id": settings.kakao_rest_api_key,
            "redirect_uri": settings.social_redirect_uri,
            "state": state,
        }
        return f"{KAKAO_AUTHORIZE_URL}?{urlencode(params)}"
    params = {
        "response_type": "code",
        "client_id": settings.naver_client_id,
        "redirect_uri": settings.social_redirect_uri,
        "state": state,
    }
    return f"{NAVER_AUTHORIZE_URL}?{urlencode(params)}"


async def fetch_profile(provider: Provider, code: str, state: str) -> SocialProfile:
    """인가 코드 → (서버에서) 토큰 교환 → 프로필."""
    if not is_live():
        return _stub_profile(provider, code)
    try:
        async with httpx.AsyncClient(timeout=10.0, transport=transport) as client:
            if provider == "KAKAO":
                return await _kakao_profile(client, code)
            return await _naver_profile(client, code, state)
    except httpx.HTTPError as exc:
        raise SocialAuthError(str(exc)) from exc


def _stub_profile(provider: Provider, code: str) -> SocialProfile:
    prefix = f"{STUB_PREFIX}{provider}-"
    if not code.startswith(prefix) or len(code) == len(prefix):
        raise SocialAuthError("invalid stub code")
    user = code.removeprefix(prefix)
    return SocialProfile(
        provider=provider,
        provider_user_id=f"stub-{user}",
        email=f"{provider.lower()}-{user}@example.com",
        name="테스트 사용자",
    )


async def _kakao_profile(client: httpx.AsyncClient, code: str) -> SocialProfile:
    data = {
        "grant_type": "authorization_code",
        "client_id": settings.kakao_rest_api_key,
        "redirect_uri": settings.social_redirect_uri,
        "code": code,
    }
    if settings.kakao_client_secret:
        data["client_secret"] = settings.kakao_client_secret
    token_resp = await client.post(KAKAO_TOKEN_URL, data=data)
    token = token_resp.json().get("access_token") if token_resp.is_success else None
    if not token:
        raise SocialAuthError(f"kakao token: {token_resp.status_code}")

    me = await client.get(
        KAKAO_PROFILE_URL, headers={"Authorization": f"Bearer {token}"}
    )
    if not me.is_success:
        raise SocialAuthError(f"kakao profile: {me.status_code}")
    body = me.json()
    account = body.get("kakao_account") or {}
    verified = account.get("is_email_valid", True) and account.get("is_email_verified")
    return SocialProfile(
        provider="KAKAO",
        provider_user_id=str(body["id"]),
        email=account.get("email") if verified else None,
        name=(account.get("profile") or {}).get("nickname"),
    )


async def _naver_profile(
    client: httpx.AsyncClient, code: str, state: str
) -> SocialProfile:
    token_resp = await client.post(
        NAVER_TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "client_id": settings.naver_client_id,
            "client_secret": settings.naver_client_secret,
            "code": code,
            "state": state,
        },
    )
    token = token_resp.json().get("access_token") if token_resp.is_success else None
    if not token:
        raise SocialAuthError(f"naver token: {token_resp.status_code}")

    me = await client.get(
        NAVER_PROFILE_URL, headers={"Authorization": f"Bearer {token}"}
    )
    body = me.json() if me.is_success else {}
    if body.get("resultcode") != "00":
        raise SocialAuthError(f"naver profile: {me.status_code}")
    profile = body.get("response") or {}
    # 네이버 휴대폰 번호는 쓰지 않는다 — 가입 시 휴대폰 인증을 따로 받는다
    return SocialProfile(
        provider="NAVER",
        provider_user_id=str(profile["id"]),
        email=profile.get("email"),
        name=profile.get("name") or profile.get("nickname"),
    )
