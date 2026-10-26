"""T-110 소셜 로그인 · 가입 · 계정 연결 테스트 (기획서 16.3 · 16.4 · 16.7).

- 시작: 로그인 주소(client_id · redirect_uri · state), state Redis 저장, 잘못된 공급자
- 콜백 (카카오 · 네이버 실제 응답 형태를 MockTransport 로): 신규 → 추가 정보 → 가입,
  기존 연결 → 로그인, 같은 이메일 기존 회원 409, 이메일 미제공 시 입력 필수
- state 재사용 · 다른 테넌트 · 만료 signup_token 400, 공급자 오류 502, 소셜 토큰 미노출
- 연결: 로그인 후 네이버 연결 → 목록, 다른 회원 계정 409, 해제 · 마지막 수단 409
- 격리 · 기능 플래그 OFF 403 · 어드민 토큰 403
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.services import social_providers
from app.workers import notification as notification_worker
from tests.conftest import _TestSession  # type: ignore

PHONE = "010-3333-4444"


def _base(slug: str) -> str:
    return f"/api/public/{slug}"


async def _sql(sql: str, params: dict | None = None):
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        result = await session.execute(text(sql), params or {})
        await session.commit()
        return result


async def _set_flag(tenant_id: str, enabled: bool) -> None:
    await _sql(
        "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled,"
        " created_at, updated_at) SELECT gen_random_uuid(), :t, id, :on, now(), now()"
        " FROM features WHERE key = 'MEMBER_SOCIAL_LOGIN'"
        " ON CONFLICT ON CONSTRAINT uq_tenant_features_pair"
        " DO UPDATE SET is_enabled = :on",
        {"t": tenant_id, "on": enabled},
    )
    from app.services import feature as feature_service

    await feature_service.invalidate_cache(tenant_id)


@pytest.fixture
async def tenant(test_tenant: dict):
    await _set_flag(test_tenant["id"], True)
    yield test_tenant
    await _sql(
        "DELETE FROM member_social_accounts WHERE tenant_id = :t",
        {"t": test_tenant["id"]},
    )
    await _sql(
        "DELETE FROM tenant_features WHERE tenant_id = :t", {"t": test_tenant["id"]}
    )


@pytest.fixture(autouse=True)
def no_alerts(monkeypatch):
    class _Task:
        def delay(self, *args) -> None:
            pass

    monkeypatch.setattr(notification_worker, "send_member_joined_alert", _Task())


async def _verified_phone(tenant_id: str, phone: str = PHONE) -> str:
    vid = str(uuid.uuid4())
    now = datetime.now(UTC)
    await _sql(
        "INSERT INTO phone_verifications (id, tenant_id, phone, code, purpose,"
        " expires_at, verified_at) VALUES (:id, :t, :p, '123456', 'REGISTER',"
        " :exp, :now)",
        {
            "id": vid,
            "t": tenant_id,
            "p": phone,
            "exp": now + timedelta(minutes=3),
            "now": now,
        },
    )
    return vid


async def _authorize(
    client: AsyncClient, slug: str, provider: str = "kakao", **params
) -> dict:
    resp = await client.get(
        f"{_base(slug)}/auth/social/{provider}/authorize", params=params
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _code_and_state(authorize_url: str) -> tuple[str, str]:
    query = parse_qs(urlparse(authorize_url).query)
    return query["code"][0], query["state"][0]


async def _callback(
    client: AsyncClient, slug: str, provider: str, code: str, state: str
):
    return await client.post(
        f"{_base(slug)}/auth/social",
        json={"provider": provider, "code": code, "state": state},
    )


async def _stub_login(
    client: AsyncClient, slug: str, provider: str = "KAKAO", user: str = "u1", **extra
):
    data = await _authorize(client, slug, provider.lower(), stub_user=user, **extra)
    code, state = _code_and_state(data["authorize_url"])
    return await _callback(client, slug, provider, code, state)


async def _complete(client: AsyncClient, tenant: dict, signup_token: str, **extra):
    vid = await _verified_phone(tenant["id"])
    return await client.post(
        f"{_base(tenant['slug'])}/auth/social/complete",
        json={
            "signup_token": signup_token,
            "phone": PHONE,
            "phone_verification_id": vid,
            "terms_agree": True,
            "privacy_agree": True,
            **extra,
        },
    )


async def _signup_stub(client: AsyncClient, tenant: dict, provider="KAKAO", user="u1"):
    first = await _stub_login(client, tenant["slug"], provider, user)
    assert first.json()["data"]["status"] == "SIGNUP_REQUIRED", first.text
    done = await _complete(client, tenant, first.json()["data"]["signup_token"])
    assert done.status_code == 201, done.text
    return done.json()["data"]


class TestStubFlow:
    async def test_new_user_signup_then_login(self, client: AsyncClient, tenant: dict):
        slug = tenant["slug"]
        first = await _stub_login(client, slug, return_to=f"/{slug}/about")
        data = first.json()["data"]
        assert data["status"] == "SIGNUP_REQUIRED"
        assert data["email_required"] is False
        assert data["access_token"] is None and data["return_to"] == f"/{slug}/about"

        done = await _complete(client, tenant, data["signup_token"])
        assert done.status_code == 201, done.text
        member = done.json()["data"]["member"]
        assert member["email"] == "kakao-u1@example.com"
        assert done.json()["data"]["status"] == "LOGGED_IN"
        assert "member_refresh_token=" in done.headers["set-cookie"]
        row = (
            await _sql(
                "SELECT m.password_hash, m.social_provider, a.provider_user_id"
                " FROM site_members m JOIN member_social_accounts a"
                " ON a.member_id = m.id WHERE m.id = :id",
                {"id": member["id"]},
            )
        ).one()
        assert row.password_hash is None and row.social_provider == "KAKAO"
        assert row.provider_user_id == "stub-u1"

        # 같은 소셜 계정으로 다시 → 바로 로그인
        again = await _stub_login(client, slug)
        assert again.json()["data"]["status"] == "LOGGED_IN"
        assert again.json()["data"]["member"]["id"] == member["id"]
        assert again.json()["data"]["access_token"]

    async def test_signup_token_single_use_and_expiry(
        self, client: AsyncClient, tenant: dict
    ):
        first = await _stub_login(client, tenant["slug"])
        token = first.json()["data"]["signup_token"]
        assert (await _complete(client, tenant, token)).status_code == 201
        reuse = await _complete(client, tenant, token)
        assert reuse.json()["error"]["code"] == "SIGNUP_EXPIRED"
        unknown = await _complete(client, tenant, "x" * 32)
        assert unknown.json()["error"]["code"] == "SIGNUP_EXPIRED"

    async def test_complete_requires_phone_verification(
        self, client: AsyncClient, tenant: dict
    ):
        first = await _stub_login(client, tenant["slug"])
        resp = await client.post(
            f"{_base(tenant['slug'])}/auth/social/complete",
            json={
                "signup_token": first.json()["data"]["signup_token"],
                "phone": PHONE,
                "phone_verification_id": str(uuid.uuid4()),
                "terms_agree": True,
                "privacy_agree": True,
            },
        )
        assert resp.json()["error"]["code"] == "PHONE_NOT_VERIFIED"

    async def test_existing_email_member_not_auto_linked(
        self, client: AsyncClient, tenant: dict
    ):
        await _sql(
            "INSERT INTO site_members (tenant_id, email, name, password_hash)"
            " VALUES (:t, 'kakao-u1@example.com', '홍길동', 'x')",
            {"t": tenant["id"]},
        )
        resp = await _stub_login(client, tenant["slug"])
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "SOCIAL_EMAIL_EXISTS"
        linked = (
            await _sql(
                "SELECT count(*) FROM member_social_accounts WHERE tenant_id = :t",
                {"t": tenant["id"]},
            )
        ).scalar_one()
        assert linked == 0

    async def test_state_single_use_and_tenant_bound(
        self, client: AsyncClient, tenant: dict, other_tenant: dict
    ):
        await _set_flag(other_tenant["id"], True)
        data = await _authorize(client, tenant["slug"], stub_user="u2")
        code, state = _code_and_state(data["authorize_url"])
        cross = await _callback(client, other_tenant["slug"], "KAKAO", code, state)
        assert cross.json()["error"]["code"] == "INVALID_STATE"
        # 다른 테넌트에서 시도한 state 는 이미 소모됨
        used = await _callback(client, tenant["slug"], "KAKAO", code, state)
        assert used.json()["error"]["code"] == "INVALID_STATE"

        data = await _authorize(client, tenant["slug"], stub_user="u2")
        code, state = _code_and_state(data["authorize_url"])
        wrong_provider = await _callback(client, tenant["slug"], "NAVER", code, state)
        assert wrong_provider.json()["error"]["code"] == "INVALID_STATE"

    async def test_same_social_user_is_new_at_other_tenant(
        self, client: AsyncClient, tenant: dict, other_tenant: dict
    ):
        await _signup_stub(client, tenant)
        await _set_flag(other_tenant["id"], True)
        resp = await _stub_login(client, other_tenant["slug"])
        assert resp.json()["data"]["status"] == "SIGNUP_REQUIRED"

    async def test_return_to_must_be_relative(self, client: AsyncClient, tenant: dict):
        for bad in ("https://evil.com", "//evil.com", "/\\evil.com"):
            resp = await _stub_login(client, tenant["slug"], user="r1", return_to=bad)
            assert resp.json()["data"]["return_to"] == f"/{tenant['slug']}"

    async def test_callback_without_provider_uses_state(
        self, client: AsyncClient, tenant: dict
    ):
        data = await _authorize(client, tenant["slug"], "naver", stub_user="np")
        code, state = _code_and_state(data["authorize_url"])
        resp = await client.post(
            f"{_base(tenant['slug'])}/auth/social", json={"code": code, "state": state}
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["provider"] == "NAVER"

    async def test_unknown_provider(self, client: AsyncClient, tenant: dict):
        resp = await client.get(f"{_base(tenant['slug'])}/auth/social/google/authorize")
        assert resp.status_code == 400
        assert resp.json()["error"]["field"] == "provider"


@pytest.fixture
async def other_tenant():
    tid = str(uuid.uuid4())
    slug = f"other-{tid[:8]}"
    await _sql(
        "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
        " updated_at) VALUES (:id, '다른 사이트', :slug, 'FREE', true, now(), now())",
        {"id": tid, "slug": slug},
    )
    yield {"id": tid, "slug": slug}
    await _sql("DELETE FROM tenants WHERE id = :id", {"id": tid})


def _mock_providers(calls: list, *, kakao_email_verified: bool = True, fail=False):
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, str(request.url.copy_with(query=None))))
        url = str(request.url)
        if fail:
            return httpx.Response(401, json={"error": "invalid_grant"})
        if url.startswith(social_providers.KAKAO_TOKEN_URL):
            assert b"code=kakao-code" in request.content
            return httpx.Response(200, json={"access_token": "KAKAO-SECRET-TOKEN"})
        if url.startswith(social_providers.KAKAO_PROFILE_URL):
            assert request.headers["authorization"] == "Bearer KAKAO-SECRET-TOKEN"
            return httpx.Response(
                200,
                json={
                    "id": 4242,
                    "kakao_account": {
                        "email": "real@kakao.com",
                        "is_email_valid": True,
                        "is_email_verified": kakao_email_verified,
                        "profile": {"nickname": "카카오친구"},
                    },
                },
            )
        if url.startswith(social_providers.NAVER_TOKEN_URL):
            return httpx.Response(200, json={"access_token": "NAVER-SECRET-TOKEN"})
        if url.startswith(social_providers.NAVER_PROFILE_URL):
            return httpx.Response(
                200,
                json={
                    "resultcode": "00",
                    "response": {
                        "id": "nv-777",
                        "email": "real@naver.com",
                        "name": "네이버친구",
                        "mobile": "010-0000-0000",
                    },
                },
            )
        return httpx.Response(404)

    return httpx.MockTransport(handler)


@pytest.fixture
def live(monkeypatch):
    """실제 카카오 · 네이버 API 형태로 동작 (HTTP 는 MockTransport)."""
    calls: list = []
    settings = social_providers.settings
    monkeypatch.setattr(settings, "social_mode", "live")
    monkeypatch.setattr(settings, "kakao_rest_api_key", "kakao-client-id")
    monkeypatch.setattr(settings, "naver_client_id", "naver-client-id")
    monkeypatch.setattr(settings, "naver_client_secret", "naver-secret")
    monkeypatch.setattr(
        settings, "social_redirect_uri", "https://site.test/member/social/callback"
    )

    def use(**kwargs):
        monkeypatch.setattr(
            social_providers, "transport", _mock_providers(calls, **kwargs)
        )
        return calls

    use()
    return use


class TestLiveProviders:
    @pytest.mark.parametrize(
        ("provider", "host", "client_id"),
        [
            ("kakao", "kauth.kakao.com", "kakao-client-id"),
            ("naver", "nid.naver.com", "naver-client-id"),
        ],
    )
    async def test_authorize_url(
        self, client: AsyncClient, tenant: dict, live, provider, host, client_id
    ):
        data = await _authorize(client, tenant["slug"], provider)
        url = urlparse(data["authorize_url"])
        query = parse_qs(url.query)
        assert url.netloc == host
        assert query["client_id"] == [client_id]
        assert query["redirect_uri"] == ["https://site.test/member/social/callback"]
        assert query["state"] == [data["state"]]
        # 공용 콜백 페이지가 테넌트를 찾도록 slug 가 앞에 붙는다
        slug, _, nonce = data["state"].partition(".")
        assert slug == tenant["slug"] and len(nonce) >= 40
        from app.core.redis import get_redis

        stored = json.loads(
            await (await get_redis()).get(f"member_social_state:{data['state']}")
        )
        assert stored["tenant_id"] == tenant["id"] and stored["mode"] == "login"

    async def test_kakao_signup_without_exposing_token(
        self, client: AsyncClient, tenant: dict, live
    ):
        calls = live()
        data = await _authorize(client, tenant["slug"], "kakao")
        resp = await _callback(
            client, tenant["slug"], "KAKAO", "kakao-code", data["state"]
        )
        assert resp.status_code == 200, resp.text
        assert "KAKAO-SECRET-TOKEN" not in resp.text
        body = resp.json()["data"]
        assert body["status"] == "SIGNUP_REQUIRED"
        assert body["suggested_name"] == "카카오친구"
        assert [c[1] for c in calls] == [
            social_providers.KAKAO_TOKEN_URL,
            social_providers.KAKAO_PROFILE_URL,
        ]
        done = await _complete(client, tenant, body["signup_token"])
        assert done.json()["data"]["member"]["email"] == "real@kakao.com"
        assert done.json()["data"]["member"]["name"] == "카카오친구"

    async def test_kakao_unverified_email_requires_input(
        self, client: AsyncClient, tenant: dict, live
    ):
        live(kakao_email_verified=False)
        data = await _authorize(client, tenant["slug"], "kakao")
        resp = await _callback(
            client, tenant["slug"], "KAKAO", "kakao-code", data["state"]
        )
        body = resp.json()["data"]
        assert body["email_required"] is True
        missing = await _complete(client, tenant, body["signup_token"])
        assert missing.json()["error"]["field"] == "email"
        done = await _complete(
            client, tenant, body["signup_token"], email="typed@example.com"
        )
        assert done.status_code == 201
        assert done.json()["data"]["member"]["email"] == "typed@example.com"

    async def test_naver_signup_and_login(
        self, client: AsyncClient, tenant: dict, live
    ):
        data = await _authorize(client, tenant["slug"], "naver")
        resp = await _callback(
            client, tenant["slug"], "NAVER", "nv-code", data["state"]
        )
        body = resp.json()["data"]
        assert "NAVER-SECRET-TOKEN" not in resp.text
        done = await _complete(client, tenant, body["signup_token"])
        assert done.json()["data"]["member"]["email"] == "real@naver.com"
        # 네이버가 준 휴대폰 번호가 아니라 인증한 번호로 저장
        phone = (
            await _sql(
                "SELECT phone FROM site_members WHERE email = 'real@naver.com'"
                " AND tenant_id = :t",
                {"t": tenant["id"]},
            )
        ).scalar_one()
        assert phone == PHONE

        data = await _authorize(client, tenant["slug"], "naver")
        login = await _callback(
            client, tenant["slug"], "NAVER", "nv-code", data["state"]
        )
        assert login.json()["data"]["status"] == "LOGGED_IN"

    async def test_provider_failure_502(self, client: AsyncClient, tenant: dict, live):
        live(fail=True)
        data = await _authorize(client, tenant["slug"], "kakao")
        resp = await _callback(client, tenant["slug"], "KAKAO", "bad", data["state"])
        assert resp.status_code == 502
        assert resp.json()["error"]["code"] == "SOCIAL_AUTH_FAILED"


class TestLinking:
    async def _link(self, client: AsyncClient, slug: str, access: str, provider, user):
        resp = await client.post(
            f"{_base(slug)}/members/me/social/{provider.lower()}/authorize",
            params={"stub_user": user},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert resp.status_code == 200, resp.text
        code, state = _code_and_state(resp.json()["data"]["authorize_url"])
        return await _callback(client, slug, provider, code, state)

    async def test_link_list_and_unlink(self, client: AsyncClient, tenant: dict):
        slug = tenant["slug"]
        signup = await _signup_stub(client, tenant, "KAKAO", "k1")
        access = signup["access_token"]
        auth = {"Authorization": f"Bearer {access}"}

        linked = await self._link(client, slug, access, "NAVER", "n1")
        assert linked.json()["data"]["status"] == "LINKED"
        assert linked.json()["data"]["return_to"] == f"/{slug}/member/mypage"

        listing = await client.get(f"{_base(slug)}/members/me/social", headers=auth)
        data = listing.json()["data"]
        assert [a["provider"] for a in data["accounts"]] == ["KAKAO", "NAVER"]
        assert data["has_password"] is False

        # 네이버로도 같은 회원으로 로그인
        naver_login = await _stub_login(client, slug, "NAVER", "n1")
        assert naver_login.json()["data"]["member"]["id"] == signup["member"]["id"]

        # 카카오 해제 → 네이버만 남음 → 마지막 수단은 해제 불가
        out = await client.delete(
            f"{_base(slug)}/members/me/social/kakao", headers=auth
        )
        assert [a["provider"] for a in out.json()["data"]["accounts"]] == ["NAVER"]
        last = await client.delete(
            f"{_base(slug)}/members/me/social/naver", headers=auth
        )
        assert last.status_code == 409
        assert last.json()["error"]["code"] == "LAST_LOGIN_METHOD"
        missing = await client.delete(
            f"{_base(slug)}/members/me/social/kakao", headers=auth
        )
        assert missing.status_code == 404

        # 해제한 카카오로 다시 로그인 → 같은 이메일의 회원이 있어 자동 연결하지 않음
        relogin = await _stub_login(client, slug, "KAKAO", "k1")
        assert relogin.status_code == 409
        assert relogin.json()["error"]["code"] == "SOCIAL_EMAIL_EXISTS"
        # 다시 연결하면 카카오 로그인 가능
        relinked = await self._link(client, slug, access, "KAKAO", "k1")
        assert relinked.json()["data"]["status"] == "LINKED"
        assert (await _stub_login(client, slug, "KAKAO", "k1")).json()["data"][
            "status"
        ] == "LOGGED_IN"

    async def test_cannot_link_account_of_other_member(
        self, client: AsyncClient, tenant: dict
    ):
        slug = tenant["slug"]
        await _signup_stub(client, tenant, "NAVER", "taken")
        await _sql(
            "UPDATE phone_verifications SET used_at = now() WHERE tenant_id = :t",
            {"t": tenant["id"]},
        )
        other = await _signup_stub(client, tenant, "KAKAO", "k2")
        resp = await self._link(client, slug, other["access_token"], "NAVER", "taken")
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "SOCIAL_ALREADY_LINKED"

    async def test_member_with_password_can_unlink_last_social(
        self, client: AsyncClient, tenant: dict
    ):
        signup = await _signup_stub(client, tenant, "KAKAO", "k3")
        await _sql(
            "UPDATE site_members SET password_hash = 'x' WHERE id = :id",
            {"id": signup["member"]["id"]},
        )
        resp = await client.delete(
            f"{_base(tenant['slug'])}/members/me/social/kakao",
            headers={"Authorization": f"Bearer {signup['access_token']}"},
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["accounts"] == []

    async def test_link_requires_member_token(
        self, client: AsyncClient, tenant: dict, auth_headers: dict
    ):
        slug = tenant["slug"]
        anonymous = await client.post(
            f"{_base(slug)}/members/me/social/kakao/authorize"
        )
        assert anonymous.status_code == 401
        admin = await client.post(
            f"{_base(slug)}/members/me/social/kakao/authorize", headers=auth_headers
        )
        assert admin.status_code == 403


class TestFeatureFlag:
    async def test_auth_options_reflect_flag(self, client: AsyncClient, tenant: dict):
        url = f"{_base(tenant['slug'])}/auth/options"
        on = await client.get(url)
        assert on.json()["data"] == {
            "social_login": True,
            "providers": ["KAKAO", "NAVER"],
        }
        await _set_flag(tenant["id"], False)
        off = await client.get(url)
        assert off.json()["data"] == {"social_login": False, "providers": []}

    async def test_disabled_returns_403(self, client: AsyncClient, tenant: dict):
        await _set_flag(tenant["id"], False)
        resp = await client.get(f"{_base(tenant['slug'])}/auth/social/kakao/authorize")
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "FEATURE_DISABLED"
        callback = await _callback(client, tenant["slug"], "KAKAO", "c", "s" * 20)
        assert callback.status_code == 403

    async def test_missing_flag_is_off(self, client: AsyncClient, test_tenant: dict):
        resp = await client.get(
            f"{_base(test_tenant['slug'])}/auth/social/kakao/authorize"
        )
        assert resp.status_code == 403
