import os

# Override DATABASE_URL BEFORE any app module imports
os.environ["DATABASE_URL"] = (
    "postgresql+asyncpg://cms_user:cms_password@localhost:5432/cms_test_db"
)

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import hash_password
from app.main import app

TEST_DATABASE_URL = os.environ["DATABASE_URL"]

_test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
_TestSession = async_sessionmaker(_test_engine, class_=AsyncSession, expire_on_commit=False)


async def _bypass_session() -> AsyncSession:
    """RLS 우회 세션 생성 헬퍼"""
    session = _TestSession()
    await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    return session


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


@pytest.fixture
async def test_tenant():
    slug = f"test-{uuid.uuid4().hex[:8]}"
    tenant_id = uuid.uuid4()

    async with _TestSession() as session:
        await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await session.execute(
            text(
                "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at, updated_at) "
                "VALUES (:id, :name, :slug, 'FREE', true, now(), now())"
            ),
            {"id": str(tenant_id), "name": f"Test Tenant {slug}", "slug": slug},
        )
        await session.commit()

    yield {"id": str(tenant_id), "slug": slug}

    async with _TestSession() as session:
        await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await session.execute(
            text("DELETE FROM users WHERE tenant_id = :tid"),
            {"tid": str(tenant_id)},
        )
        await session.execute(
            text("DELETE FROM tenants WHERE id = :tid"),
            {"tid": str(tenant_id)},
        )
        await session.commit()


@pytest.fixture
async def test_user(test_tenant: dict):
    user_id = uuid.uuid4()
    email = f"admin@{test_tenant['slug']}.com"
    password = "password123"

    async with _TestSession() as session:
        await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await session.execute(
            text(
                "INSERT INTO users "
                "(id, tenant_id, email, password_hash, role, is_active, created_at, updated_at) "
                "VALUES (:id, :tenant_id, :email, :pw_hash, 'TENANT_ADMIN', true, now(), now())"
            ),
            {
                "id": str(user_id),
                "tenant_id": test_tenant["id"],
                "email": email,
                "pw_hash": hash_password(password),
            },
        )
        await session.commit()

    return {
        "id": str(user_id),
        "email": email,
        "password": password,
        "tenant_slug": test_tenant["slug"],
        "tenant_id": test_tenant["id"],
    }


@pytest.fixture
async def auth_headers(test_user: dict) -> dict:
    """JWT를 직접 생성하여 Bearer 헤더 반환 (rate limit 우회)"""
    from uuid import UUID
    from app.core.security import create_access_token

    token = create_access_token(
        user_id=UUID(test_user["id"]),
        tenant_id=UUID(test_user["tenant_id"]),
        role="TENANT_ADMIN",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def test_section(test_tenant: dict) -> dict:
    section_id = uuid.uuid4()

    async with _TestSession() as session:
        await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await session.execute(
            text(
                "INSERT INTO sections (id, tenant_id, section_type, label, display_order, is_active, created_at, updated_at) "
                "VALUES (:id, :tenant_id, 'HERO_BANNER', '메인 배너', 0, true, now(), now())"
            ),
            {"id": str(section_id), "tenant_id": test_tenant["id"]},
        )
        await session.commit()

    yield {"id": str(section_id), "tenant_id": test_tenant["id"]}

    async with _TestSession() as session:
        await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await session.execute(
            text("DELETE FROM section_settings WHERE section_id = :sid"),
            {"sid": str(section_id)},
        )
        await session.execute(
            text("DELETE FROM sections WHERE id = :sid"),
            {"sid": str(section_id)},
        )
        await session.commit()


@pytest.fixture
async def test_inquiry(test_tenant: dict) -> dict:
    inquiry_id = uuid.uuid4()

    async with _TestSession() as session:
        await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await session.execute(
            text(
                "INSERT INTO inquiries "
                "(id, tenant_id, inquiry_type, name, phone, email, message, status, is_read, created_at, updated_at) "
                "VALUES (:id, :tenant_id, 'GENERAL', '테스트문의자', '010-1234-5678', NULL, "
                "'테스트 문의 내용입니다. 확인 부탁드립니다.', 'PENDING', false, now(), now())"
            ),
            {"id": str(inquiry_id), "tenant_id": test_tenant["id"]},
        )
        await session.commit()

    yield {"id": str(inquiry_id), "tenant_id": test_tenant["id"]}

    async with _TestSession() as session:
        await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await session.execute(
            text("DELETE FROM inquiries WHERE id = :iid"),
            {"iid": str(inquiry_id)},
        )
        await session.commit()
