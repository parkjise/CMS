"""슈퍼 어드민 2FA · 접속 IP · 요청 횟수 제한 (T-136, 기획서 14.8)."""

import asyncio
import uuid

import pyotp
import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.api.super.endpoints import auth as super_auth
from app.core.client_info import rate_limit_key
from app.core.config import settings
from app.core.security import (
    create_2fa_challenge_token,
    create_access_token,
    create_refresh_token,
    hash_password,
)
from app.services.auth import reset_totp
from tests.conftest import _TestSession  # type: ignore

_PASSWORD = "Sup3r-Secret!"
_LOGIN = "/api/super/v1/auth/login"


async def _exec(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        row = result.first() if result.returns_rows else None
        await s.commit()
    return row


@pytest.fixture
async def admin():
    user_id = uuid.uuid4()
    email = f"super-{user_id.hex[:8]}@example.com"
    await _exec(
        "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active, "
        "created_at, updated_at) VALUES (:i, NULL, :e, :p, 'SUPER_ADMIN', true, "
        "now(), now())",
        i=user_id,
        e=email,
        p=hash_password(_PASSWORD),
    )
    yield {"id": user_id, "email": email, "password": _PASSWORD}
    await _exec("DELETE FROM audit_logs WHERE actor_id = :i", i=user_id)
    await _exec("DELETE FROM users WHERE id = :i", i=user_id)


@pytest.fixture
def require_2fa(monkeypatch):
    monkeypatch.setattr(settings, "super_admin_require_2fa", True)


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _login(client: AsyncClient, admin: dict) -> dict:
    res = await client.post(
        _LOGIN, json={"email": admin["email"], "password": admin["password"]}
    )
    assert res.status_code == 200
    return res.json()["data"]


async def _enroll(client: AsyncClient, admin: dict) -> tuple[str, str]:
    challenge = (await _login(client, admin))["challenge_token"]
    res = await client.post(
        "/api/super/v1/auth/2fa/enroll", json={"challenge_token": challenge}
    )
    assert res.status_code == 200
    return challenge, res.json()["data"]["secret"]


class TestTokenTypes:
    """비밀번호만으로 받은 토큰은 API 를 열지 못한다."""

    @pytest.mark.parametrize("path", ["/auth/me", "/tenants"])
    async def test_challenge_token_rejected(self, client, admin, path):
        token = create_2fa_challenge_token(admin["id"])
        res = await client.get(f"/api/super/v1{path}", headers=_bearer(token))
        assert res.status_code == 401

    async def test_refresh_token_rejected(self, client, admin):
        token = create_refresh_token(admin["id"])
        res = await client.get("/api/super/v1/auth/me", headers=_bearer(token))
        assert res.status_code == 401

    async def test_access_token_still_works(self, client, admin):
        token = create_access_token(
            user_id=admin["id"],
            tenant_id=None,
            role="SUPER_ADMIN",
            is_super_admin=True,
        )
        res = await client.get("/api/super/v1/auth/me", headers=_bearer(token))
        assert res.status_code == 200


class TestRequired:
    async def test_off_logs_in_directly(self, client, admin):
        data = await _login(client, admin)
        assert data["access_token"] and not data["requires_2fa_setup"]

    async def test_on_without_enrollment_gives_no_token(
        self, client, admin, require_2fa
    ):
        data = await _login(client, admin)
        assert data["access_token"] is None
        assert data["requires_2fa_setup"] is True
        assert data["challenge_token"]

    async def test_enroll_then_login_with_code(self, client, admin, require_2fa):
        challenge, secret = await _enroll(client, admin)

        wrong = await client.post(
            "/api/super/v1/auth/2fa/enroll/confirm",
            json={"challenge_token": challenge, "code": "000000"},
        )
        assert wrong.status_code == 400
        row = await _exec("SELECT totp_enabled FROM users WHERE id = :i", i=admin["id"])
        assert row[0] is False

        ok = await client.post(
            "/api/super/v1/auth/2fa/enroll/confirm",
            json={"challenge_token": challenge, "code": pyotp.TOTP(secret).now()},
        )
        assert ok.status_code == 200
        me = await client.get(
            "/api/super/v1/auth/me", headers=_bearer(ok.json()["data"]["access_token"])
        )
        assert me.status_code == 200

        # 다음 로그인은 코드 단계
        data = await _login(client, admin)
        assert data["requires_2fa"] is True and data["access_token"] is None
        verified = await client.post(
            "/api/super/v1/auth/verify-2fa",
            json={
                "challenge_token": data["challenge_token"],
                "code": pyotp.TOTP(secret).now(),
            },
        )
        assert verified.status_code == 200

    async def test_repeated_enroll_keeps_same_secret(self, client, admin, require_2fa):
        """새로고침 · 중복 요청에도 앱에 찍은 QR 이 유효하다"""
        challenge, first = await _enroll(client, admin)
        again = await client.post(
            "/api/super/v1/auth/2fa/enroll", json={"challenge_token": challenge}
        )
        assert again.json()["data"]["secret"] == first
        ok = await client.post(
            "/api/super/v1/auth/2fa/enroll/confirm",
            json={"challenge_token": challenge, "code": pyotp.TOTP(first).now()},
        )
        assert ok.status_code == 200

    async def test_concurrent_enroll_gets_one_secret(self, client, admin, require_2fa):
        """React StrictMode 처럼 동시에 불러도 저장된 값과 응답이 어긋나지 않는다"""
        challenge = (await _login(client, admin))["challenge_token"]
        responses = await asyncio.gather(
            *[
                client.post(
                    "/api/super/v1/auth/2fa/enroll",
                    json={"challenge_token": challenge},
                )
                for _ in range(5)
            ]
        )
        secrets = {r.json()["data"]["secret"] for r in responses}
        row = await _exec("SELECT totp_secret FROM users WHERE id = :i", i=admin["id"])
        assert secrets == {row[0]}

    async def test_enabled_account_cannot_replace_app(self, client, admin, require_2fa):
        challenge, secret = await _enroll(client, admin)
        await client.post(
            "/api/super/v1/auth/2fa/enroll/confirm",
            json={"challenge_token": challenge, "code": pyotp.TOTP(secret).now()},
        )
        # 비밀번호를 아는 사람이 새 challenge 로 앱을 바꾸려 해도 거부
        fresh = (await _login(client, admin))["challenge_token"]
        res = await client.post(
            "/api/super/v1/auth/2fa/enroll", json={"challenge_token": fresh}
        )
        assert res.status_code == 409
        row = await _exec("SELECT totp_secret FROM users WHERE id = :i", i=admin["id"])
        assert row[0] == secret

    async def test_session_cannot_replace_app(self, client, admin):
        await _exec(
            "UPDATE users SET totp_enabled = true, totp_secret = 'KEEP' WHERE id = :i",
            i=admin["id"],
        )
        token = create_access_token(
            user_id=admin["id"],
            tenant_id=None,
            role="SUPER_ADMIN",
            is_super_admin=True,
        )
        res = await client.post("/api/super/v1/auth/2fa/setup", headers=_bearer(token))
        assert res.status_code == 409
        row = await _exec("SELECT totp_secret FROM users WHERE id = :i", i=admin["id"])
        assert row[0] == "KEEP"

    async def test_enroll_rejects_other_tokens(self, client, admin):
        token = create_access_token(
            user_id=admin["id"],
            tenant_id=None,
            role="SUPER_ADMIN",
            is_super_admin=True,
        )
        res = await client.post(
            "/api/super/v1/auth/2fa/enroll", json={"challenge_token": token}
        )
        assert res.status_code == 401

    async def test_enrollment_is_audited(self, client, admin, require_2fa):
        challenge, secret = await _enroll(client, admin)
        await client.post(
            "/api/super/v1/auth/2fa/enroll/confirm",
            json={"challenge_token": challenge, "code": pyotp.TOTP(secret).now()},
        )
        row = await _exec(
            "SELECT count(*) FROM audit_logs WHERE actor_id = :i "
            "AND action IN ('TOTP_SETUP', 'TOTP_ENABLED')",
            i=admin["id"],
        )
        assert row[0] == 2

    async def test_reset_clears_app(self, client, admin):
        await _exec(
            "UPDATE users SET totp_enabled = true, totp_secret = 'OLD' WHERE id = :i",
            i=admin["id"],
        )
        async with _TestSession() as s:
            assert await reset_totp(s, admin["email"]) is True
        async with _TestSession() as s:
            assert await reset_totp(s, "nobody@example.com") is False
        row = await _exec(
            "SELECT totp_enabled, totp_secret FROM users WHERE id = :i", i=admin["id"]
        )
        assert tuple(row) == (False, None)


class TestAllowedIps:
    @pytest.fixture(autouse=True)
    def allow_office(self, monkeypatch):
        monkeypatch.setattr(settings, "super_admin_allowed_ips", "203.0.113.5")

    async def test_spoofed_forwarded_for_rejected(self, client):
        res = await client.get(
            "/api/super/v1/health",
            headers={"X-Forwarded-For": "203.0.113.5", "X-Real-IP": "198.51.100.9"},
        )
        assert res.status_code == 403

    async def test_forwarded_for_alone_rejected(self, client):
        res = await client.get(
            "/api/super/v1/health", headers={"X-Forwarded-For": "203.0.113.5"}
        )
        assert res.status_code == 403

    async def test_real_ip_allowed(self, client):
        res = await client.get(
            "/api/super/v1/health", headers={"X-Real-IP": "203.0.113.5"}
        )
        assert res.status_code != 403


class _FakeRequest:
    def __init__(self, headers: dict, host: str = "10.0.0.2"):
        self.headers = headers
        self.client = type("C", (), {"host": host})()


class TestRateLimit:
    def test_key_is_per_visitor_behind_proxy(self):
        one = _FakeRequest({"X-Real-IP": "198.51.100.1"})
        two = _FakeRequest({"X-Real-IP": "198.51.100.2"})
        assert rate_limit_key(one) != rate_limit_key(two)

    def test_forwarded_for_does_not_change_key(self):
        one = _FakeRequest({"X-Real-IP": "198.51.100.1", "X-Forwarded-For": "1.1.1.1"})
        two = _FakeRequest({"X-Real-IP": "198.51.100.1", "X-Forwarded-For": "2.2.2.2"})
        assert rate_limit_key(one) == rate_limit_key(two)

    def test_without_proxy_uses_connection(self):
        assert rate_limit_key(_FakeRequest({})) == "10.0.0.2"

    async def test_super_login_is_limited(self, client, admin, monkeypatch):
        monkeypatch.setattr(super_auth.limiter, "enabled", True)
        monkeypatch.setattr(settings, "login_rate_limit", "2/minute")
        super_auth.limiter.reset()
        headers = {"X-Real-IP": "198.51.100.77"}
        body = {"email": admin["email"], "password": "wrong"}
        codes = [
            (await client.post(_LOGIN, json=body, headers=headers)).status_code
            for _ in range(3)
        ]
        super_auth.limiter.reset()
        assert codes == [401, 401, 429]
