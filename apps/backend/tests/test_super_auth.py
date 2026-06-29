"""T-084 슈퍼 어드민 인증 (POST /api/super/v1/auth/login, GET /auth/me)."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token, hash_password
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
    yield {"id": str(user_id), "email": email}
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("DELETE FROM users WHERE id = :id"), {"id": str(user_id)}
        )
        await session.commit()


class TestSuperLogin:
    _url = "/api/super/v1/auth/login"

    async def test_login_success(self, client: AsyncClient, super_admin: dict):
        resp = await client.post(
            self._url,
            json={"email": super_admin["email"], "password": _PASSWORD},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["access_token"]
        assert data["user"]["role"] == "SUPER_ADMIN"
        assert data["user"]["tenant_id"] is None

    async def test_wrong_password(self, client: AsyncClient, super_admin: dict):
        resp = await client.post(
            self._url,
            json={"email": super_admin["email"], "password": "wrong"},
        )
        assert resp.status_code == 401

    async def test_unknown_email(self, client: AsyncClient):
        resp = await client.post(
            self._url,
            json={"email": "nobody@cms.io", "password": _PASSWORD},
        )
        assert resp.status_code == 401

    async def test_regular_user_cannot_super_login(
        self, client: AsyncClient, test_user: dict
    ):
        # 일반 테넌트 관리자 계정으로는 슈퍼 로그인 불가
        resp = await client.post(
            self._url,
            json={"email": test_user["email"], "password": test_user["password"]},
        )
        assert resp.status_code == 401


class TestSuperMe:
    _url = "/api/super/v1/auth/me"

    async def test_requires_auth(self, client: AsyncClient):
        assert (await client.get(self._url)).status_code == 401

    async def test_me_returns_super_admin(
        self, client: AsyncClient, super_admin: dict
    ):
        token = create_access_token(
            user_id=uuid.UUID(super_admin["id"]),
            tenant_id=None,
            role="SUPER_ADMIN",
            is_super_admin=True,
        )
        resp = await client.get(
            self._url, headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["email"] == super_admin["email"]

    async def test_tenant_admin_forbidden(
        self, client: AsyncClient, auth_headers: dict
    ):
        # 일반 관리자 토큰으로 슈퍼 /me 접근 → 403
        resp = await client.get(self._url, headers=auth_headers)
        assert resp.status_code == 403
