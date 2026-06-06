import uuid
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text

from app.core.audit import log_action
from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
from app.models.audit import AuditLog
from app.models.user import User
from tests.conftest import _TestSession


@pytest.fixture
async def super_admin_user() -> dict:
    user_id = uuid.uuid4()
    email = f"superadmin-{uuid.uuid4().hex[:6]}@cms.io"

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text(
                "INSERT INTO users "
                "(id, tenant_id, email, password_hash, role, is_active,"
                " created_at, updated_at) "
                "VALUES (:id, NULL, :email, 'hash', 'SUPER_ADMIN', true,"
                " now(), now())"
            ),
            {"id": str(user_id), "email": email},
        )
        await session.commit()

    yield {"id": str(user_id), "email": email}

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("DELETE FROM users WHERE id = :uid"), {"uid": str(user_id)}
        )
        await session.commit()


@pytest.fixture
async def super_admin_headers(super_admin_user: dict) -> dict:
    token = create_access_token(
        user_id=UUID(super_admin_user["id"]),
        tenant_id=None,
        role="SUPER_ADMIN",
    )
    return {"Authorization": f"Bearer {token}"}


class TestSuperAdminHealth:
    _url = "/api/super/v1/health"

    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.get(self._url)
        assert resp.status_code == 401

    async def test_tenant_admin_forbidden(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get(self._url, headers=auth_headers)
        assert resp.status_code == 403

    async def test_super_admin_ok(
        self, client: AsyncClient, super_admin_headers: dict
    ):
        resp = await client.get(self._url, headers=super_admin_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["status"] == "ok"
        assert data["role"] == "SUPER_ADMIN"


class TestAuditLog:
    async def test_log_action(self, super_admin_user: dict):
        actor = User()
        actor.id = UUID(super_admin_user["id"])
        actor.role = "SUPER_ADMIN"

        async with AsyncSessionLocal() as db:
            await db.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await log_action(
                db,
                actor,
                action="TEST_ACTION",
                target_type="tenant",
                target_id="some-target-id",
                before={"key": "old"},
                after={"key": "new"},
            )

            result = await db.execute(
                select(AuditLog).where(
                    AuditLog.actor_id == UUID(super_admin_user["id"])
                )
            )
            log = result.scalar_one_or_none()

        assert log is not None
        assert log.action == "TEST_ACTION"
        assert log.target_type == "tenant"
        assert log.before_value == {"key": "old"}
        assert log.after_value == {"key": "new"}

        async with AsyncSessionLocal() as db:
            await db.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await db.execute(
                text("DELETE FROM audit_logs WHERE actor_id = :uid"),
                {"uid": super_admin_user["id"]},
            )
            await db.commit()
