"""T-094 슈퍼 어드민 보안 강화 (2FA, 감사 로그, impersonate Redis TTL)."""

import uuid

import pyotp
import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token, decode_token, hash_password
from tests.conftest import _TestSession  # type: ignore

_PASSWORD = "super-secret-123"


@pytest.fixture
async def super_admin() -> dict:
    user_id = uuid.uuid4()
    email = f"super-{uuid.uuid4().hex[:6]}@cms.io"
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text(
                "INSERT INTO users "
                "(id, tenant_id, email, password_hash, role, is_active, "
                " created_at, updated_at) "
                "VALUES (:id, NULL, :email, :pw, 'SUPER_ADMIN', true, now(), now())"
            ),
            {"id": str(user_id), "email": email, "pw": hash_password(_PASSWORD)},
        )
        await session.commit()
    token = create_access_token(
        user_id=user_id, tenant_id=None, role="SUPER_ADMIN", is_super_admin=True
    )
    yield {
        "id": str(user_id),
        "email": email,
        "headers": {"Authorization": f"Bearer {token}"},
    }
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("DELETE FROM users WHERE id = :id"), {"id": str(user_id)}
        )
        await session.commit()


class Test2FA:
    async def test_setup_returns_secret_and_uri(
        self, client: AsyncClient, super_admin: dict
    ):
        resp = await client.post(
            "/api/super/v1/auth/2fa/setup", headers=super_admin["headers"]
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["secret"]
        assert data["otpauth_uri"].startswith("otpauth://totp/")

    async def test_login_without_2fa_issues_token(
        self, client: AsyncClient, super_admin: dict
    ):
        resp = await client.post(
            "/api/super/v1/auth/login",
            json={"email": super_admin["email"], "password": _PASSWORD},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["requires_2fa"] is False
        assert data["access_token"]

    async def test_full_2fa_flow_blocks_without_code(
        self, client: AsyncClient, super_admin: dict
    ):
        # 1) setup
        setup = await client.post(
            "/api/super/v1/auth/2fa/setup", headers=super_admin["headers"]
        )
        secret = setup.json()["data"]["secret"]
        totp = pyotp.TOTP(secret)

        # 2) confirm (활성화)
        confirm = await client.post(
            "/api/super/v1/auth/2fa/confirm",
            headers=super_admin["headers"],
            json={"code": totp.now()},
        )
        assert confirm.status_code == 200

        # 3) 로그인 → 2FA 필요, 액세스 토큰 없음
        login = await client.post(
            "/api/super/v1/auth/login",
            json={"email": super_admin["email"], "password": _PASSWORD},
        )
        body = login.json()["data"]
        assert body["requires_2fa"] is True
        assert body["access_token"] is None
        challenge = body["challenge_token"]

        # 4) 잘못된 코드 → 401
        bad = await client.post(
            "/api/super/v1/auth/verify-2fa",
            json={"challenge_token": challenge, "code": "000000"},
        )
        assert bad.status_code == 401

        # 5) 올바른 코드 → 액세스 토큰 발급
        ok = await client.post(
            "/api/super/v1/auth/verify-2fa",
            json={"challenge_token": challenge, "code": totp.now()},
        )
        assert ok.status_code == 200
        assert ok.json()["data"]["access_token"]

    async def test_confirm_rejects_wrong_code(
        self, client: AsyncClient, super_admin: dict
    ):
        await client.post(
            "/api/super/v1/auth/2fa/setup", headers=super_admin["headers"]
        )
        resp = await client.post(
            "/api/super/v1/auth/2fa/confirm",
            headers=super_admin["headers"],
            json={"code": "000000"},
        )
        assert resp.status_code == 400


class TestAuditLogsApi:
    async def _insert_log(self, action: str, target_id: str) -> None:
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text(
                    "INSERT INTO audit_logs "
                    "(id, actor_id, actor_role, action, target_type, target_id, "
                    " created_at) "
                    "VALUES (:id, :actor, 'SUPER_ADMIN', :action, 'tenant', "
                    " :tid, now())"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "actor": str(uuid.uuid4()),
                    "action": action,
                    "tid": target_id,
                },
            )
            await session.commit()

    async def test_list_and_filter(self, client: AsyncClient, super_admin: dict):
        marker = f"TEST_ACTION_{uuid.uuid4().hex[:6]}"
        await self._insert_log(marker, str(uuid.uuid4()))

        resp = await client.get(
            f"/api/super/v1/audit-logs?action={marker}",
            headers=super_admin["headers"],
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] >= 1
        assert all(i["action"] == marker for i in data["items"])

    async def test_requires_super_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/super/v1/audit-logs", headers=auth_headers)
        assert resp.status_code == 403


class TestImpersonateRedis:
    async def test_impersonate_registers_redis_key(
        self, client: AsyncClient, super_admin: dict, test_tenant: dict, test_user: dict
    ):
        resp = await client.post(
            f"/api/super/v1/tenants/{test_tenant['id']}/impersonate",
            headers=super_admin["headers"],
        )
        assert resp.status_code == 200
        token = resp.json()["data"]["impersonate_token"]
        jti = decode_token(token)["jti"]

        from app.core.redis import get_redis

        redis = await get_redis()
        ttl = await redis.ttl(f"impersonate:{jti}")
        assert ttl > 0
