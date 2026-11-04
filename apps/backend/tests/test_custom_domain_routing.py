"""고객 도메인 접속 — 도메인 조회 · 소셜 로그인 넘기기 (T-137, 기획서 15.3)."""

import uuid

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.services import member_social
from app.services.domain import normalize_host
from tests.test_member_social import (  # type: ignore
    _base,
    _callback,
    _code_and_state,
    _complete,
    _set_flag,
    _sql,
    no_alerts,  # noqa: F401
)

DOMAIN = "www.oo-hospital.test"
HOST = {"Host": DOMAIN}


async def _connect(tenant_id: str, status: str = "ACTIVE") -> None:
    await _sql(
        "INSERT INTO tenant_domains (id, tenant_id, domain, domain_type, status)"
        " VALUES (:i, :t, :d, 'CUSTOM', :s)",
        {"i": uuid.uuid4(), "t": tenant_id, "d": DOMAIN, "s": status},
    )
    if status == "ACTIVE":
        await _sql(
            "UPDATE tenants SET custom_domain = :d WHERE id = :t",
            {"d": DOMAIN, "t": tenant_id},
        )


@pytest.fixture
async def tenant(test_tenant: dict):
    await _set_flag(test_tenant["id"], True)
    yield test_tenant
    params = {"t": test_tenant["id"]}
    await _sql("DELETE FROM member_social_accounts WHERE tenant_id = :t", params)
    await _sql("DELETE FROM tenant_features WHERE tenant_id = :t", params)
    await _sql("DELETE FROM tenant_domains WHERE tenant_id = :t", params)
    await _sql("DELETE FROM site_members WHERE tenant_id = :t", params)
    await _sql("DELETE FROM phone_verifications WHERE tenant_id = :t", params)
    await _sql("UPDATE tenants SET custom_domain = NULL WHERE id = :t", params)


async def _login(client: AsyncClient, slug: str, host: dict, user: str = "u1"):
    """test 모드 공급자로 소셜 로그인 — 콜백은 항상 메인 주소에서 호출된다"""
    start = await client.get(
        f"{_base(slug)}/auth/social/kakao/authorize",
        params={"stub_user": user, "return_to": "/about"},
        headers=host,
    )
    assert start.status_code == 200, start.text
    code, state = _code_and_state(start.json()["data"]["authorize_url"])
    return await _callback(client, slug, "KAKAO", code, state)


async def _signup(client: AsyncClient, tenant: dict, host: dict, user: str = "u1"):
    first = await _login(client, tenant["slug"], host, user)
    assert first.json()["data"]["status"] == "SIGNUP_REQUIRED", first.text
    return await _complete(client, tenant, first.json()["data"]["signup_token"])


def _code_of(url: str) -> str:
    return url.split("code=", 1)[1]


class TestDomainLookup:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [("WWW.OO.com", "www.oo.com"), ("www.oo.com:443", "www.oo.com")],
    )
    def test_normalize(self, raw, expected):
        assert normalize_host(raw) == expected

    async def test_active_domain(self, client, tenant):
        await _connect(tenant["id"])
        res = await client.get(f"/api/public/domain/{DOMAIN.upper()}")
        assert res.status_code == 200
        assert res.json()["data"]["slug"] == tenant["slug"]

    @pytest.mark.parametrize("status", ["PENDING", "DNS_CHECKING", "FAILED"])
    async def test_unfinished_domain_hidden(self, client, tenant, status):
        await _connect(tenant["id"], status)
        assert (await client.get(f"/api/public/domain/{DOMAIN}")).status_code == 404

    async def test_unknown_domain(self, client):
        assert (await client.get("/api/public/domain/none.test")).status_code == 404

    async def test_suspended_tenant_hidden(self, client, tenant):
        await _connect(tenant["id"])
        await _sql(
            "UPDATE tenants SET is_active = false WHERE id = :t", {"t": tenant["id"]}
        )
        res = await client.get(f"/api/public/domain/{DOMAIN}")
        await _sql(
            "UPDATE tenants SET is_active = true WHERE id = :t", {"t": tenant["id"]}
        )
        assert res.status_code == 404


def test_origin_url_is_https_outside_development(monkeypatch):
    monkeypatch.setattr(settings, "app_env", "production")
    assert member_social.origin_url(DOMAIN) == f"https://{DOMAIN}"


class TestSocialHandoff:
    async def _member(self, client, tenant) -> None:
        await _connect(tenant["id"])
        done = await _signup(client, tenant, {})
        assert done.status_code == 201, done.text
        client.cookies.clear()

    async def test_login_from_custom_domain_hands_off(self, client, tenant):
        await self._member(client, tenant)
        res = await _login(client, tenant["slug"], HOST)
        data = res.json()["data"]
        assert data["status"] == "LOGGED_IN"
        assert data["handoff_url"].startswith(
            f"{member_social.origin_url(DOMAIN)}/member/handoff?code="
        )
        # 메인 도메인에 세션을 만들지 않는다
        assert data["access_token"] is None
        assert "member_refresh_token" not in res.headers.get("set-cookie", "")

        exchanged = await client.post(
            f"{_base(tenant['slug'])}/auth/social/exchange",
            json={"code": _code_of(data["handoff_url"])},
            headers=HOST,
        )
        assert exchanged.status_code == 200, exchanged.text
        body = exchanged.json()["data"]
        assert body["access_token"]
        assert body["return_to"] == "/about"
        assert "member_refresh_token" in exchanged.headers["set-cookie"]

    async def test_code_is_single_use(self, client, tenant):
        await self._member(client, tenant)
        res = await _login(client, tenant["slug"], HOST)
        body = {"code": _code_of(res.json()["data"]["handoff_url"])}
        url = f"{_base(tenant['slug'])}/auth/social/exchange"
        assert (await client.post(url, json=body)).status_code == 200
        again = await client.post(url, json=body)
        assert again.status_code == 400
        assert again.json()["error"]["code"] == "HANDOFF_EXPIRED"

    async def test_login_from_main_host_unchanged(self, client, tenant):
        await self._member(client, tenant)
        res = await _login(client, tenant["slug"], {})
        data = res.json()["data"]
        assert data["handoff_url"] is None
        assert data["access_token"]
        assert "member_refresh_token" in res.headers["set-cookie"]

    async def test_foreign_host_cannot_receive_handoff(self, client, tenant):
        """요청 Host 를 위조해도 사업체 연결 도메인이 아니면 넘기지 않는다"""
        await self._member(client, tenant)
        res = await _login(client, tenant["slug"], {"Host": "evil.test"})
        data = res.json()["data"]
        assert data["handoff_url"] is None
        assert data["access_token"]

    async def test_unknown_code_rejected(self, client, tenant):
        res = await client.post(
            f"{_base(tenant['slug'])}/auth/social/exchange",
            json={"code": "x" * 43},
        )
        assert res.status_code == 400

    async def test_signup_from_custom_domain_hands_off(self, client, tenant):
        await _connect(tenant["id"])
        done = await _signup(client, tenant, HOST)
        assert done.status_code == 201, done.text
        data = done.json()["data"]
        assert data["handoff_url"].startswith(
            f"{member_social.origin_url(DOMAIN)}/member/handoff?code="
        )
        assert data["access_token"] is None
        assert "member_refresh_token" not in done.headers.get("set-cookie", "")


class TestRobotsField:
    async def test_public_site_has_robots_txt(self, client, tenant):
        await _sql(
            "INSERT INTO seo_settings (id, tenant_id, robots_txt) VALUES (:i, :t, :r)",
            {"i": uuid.uuid4(), "t": tenant["id"], "r": "User-agent: *\nDisallow: /a"},
        )
        res = await client.get(f"/api/public/site/{tenant['slug']}")
        await _sql("DELETE FROM seo_settings WHERE tenant_id = :t", {"t": tenant["id"]})
        assert res.json()["data"]["seo_settings"]["robots_txt"].startswith("User-agent")
