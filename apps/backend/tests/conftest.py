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
from sqlalchemy.pool import NullPool

from app.core.security import hash_password
from app.main import app

TEST_DATABASE_URL = os.environ["DATABASE_URL"]

_test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
_TestSession = async_sessionmaker(
    _test_engine, class_=AsyncSession, expire_on_commit=False
)

# Replace the app's connection pool with NullPool so each request gets a
# fresh connection with no stale RLS settings from previous requests.
from app.core import deps as _deps  # noqa: E402
from app.db import session as _db_session  # noqa: E402

_app_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
_nullpool_session = async_sessionmaker(
    bind=_app_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)
_db_session.engine = _app_engine
_db_session.AsyncSessionLocal = _nullpool_session
# deps.py imports AsyncSessionLocal directly (not through the module), so patch it too
_deps.AsyncSessionLocal = _nullpool_session

# Disable rate limiting during tests — all requests share 127.0.0.1 so the per-IP
# limit would be exhausted after 3 inquiry submissions across the entire test suite.
from app.api.v1.endpoints.auth import limiter as _auth_limiter  # noqa: E402
from app.api.v1.endpoints.billing import _limiter as _billing_limiter  # noqa: E402
from app.api.v1.endpoints.inquiries import _limiter as _inquiry_limiter  # noqa: E402

_inquiry_limiter.enabled = False
_auth_limiter.enabled = False
_billing_limiter.enabled = False


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
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )  # noqa: E501
        await session.execute(
            text(
                "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at, updated_at) "  # noqa: E501
                "VALUES (:id, :name, :slug, 'FREE', true, now(), now())"
            ),
            {"id": str(tenant_id), "name": f"Test Tenant {slug}", "slug": slug},
        )
        await session.commit()

    yield {"id": str(tenant_id), "slug": slug}

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )  # noqa: E501
        # FK 순서 준수: section_settings → sections → users → tenants
        # (sections.tenant_id → tenants.id FK, 마이그레이션 0016)
        await session.execute(
            text("DELETE FROM section_settings WHERE tenant_id = :tid"),
            {"tid": str(tenant_id)},
        )
        await session.execute(
            text("DELETE FROM sections WHERE tenant_id = :tid"),
            {"tid": str(tenant_id)},
        )
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
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )  # noqa: E501
        await session.execute(
            text(
                "INSERT INTO users "
                "(id, tenant_id, email, password_hash, role, is_active, created_at, updated_at) "  # noqa: E501
                "VALUES (:id, :tenant_id, :email, :pw_hash, 'TENANT_ADMIN', true, now(), now())"  # noqa: E501
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
    from app.core.security import create_access_token

    token = create_access_token(
        user_id=uuid.UUID(test_user["id"]),
        tenant_id=uuid.UUID(test_user["tenant_id"]),
        role="TENANT_ADMIN",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def test_section(test_tenant: dict) -> dict:
    section_id = uuid.uuid4()

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )  # noqa: E501
        await session.execute(
            text(
                "INSERT INTO sections (id, tenant_id, section_type, label, display_order, is_active, created_at, updated_at) "  # noqa: E501
                "VALUES (:id, :tenant_id, 'HERO_BANNER', '메인 배너', 0, true, now(), now())"  # noqa: E501
            ),
            {"id": str(section_id), "tenant_id": test_tenant["id"]},
        )
        await session.commit()

    yield {"id": str(section_id), "tenant_id": test_tenant["id"]}

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )  # noqa: E501
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
async def test_analytics(test_tenant: dict) -> dict:
    """오늘 날짜 분석 데이터 삽입"""
    analytics_id = uuid.uuid4()

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )  # noqa: E501
        await session.execute(
            text(
                "INSERT INTO site_analytics (id, tenant_id, date, page_views, unique_visitors, created_at, updated_at) "  # noqa: E501
                "VALUES (:id, :tenant_id, CURRENT_DATE, 42, 17, now(), now()) "
                "ON CONFLICT (tenant_id, date) DO UPDATE SET page_views = 42, unique_visitors = 17"  # noqa: E501
            ),
            {"id": str(analytics_id), "tenant_id": test_tenant["id"]},
        )
        await session.commit()

    yield {"id": str(analytics_id), "tenant_id": test_tenant["id"]}

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )  # noqa: E501
        await session.execute(
            text("DELETE FROM site_analytics WHERE tenant_id = :tid"),
            {"tid": test_tenant["id"]},
        )
        await session.commit()


@pytest.fixture
async def test_inquiry(test_tenant: dict) -> dict:
    inquiry_id = uuid.uuid4()

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )  # noqa: E501
        await session.execute(
            text(
                "INSERT INTO inquiries "
                "(id, tenant_id, inquiry_type, name, phone, email, message, status, is_read, created_at, updated_at) "  # noqa: E501
                "VALUES (:id, :tenant_id, 'GENERAL', '테스트문의자', '010-1234-5678', NULL, "  # noqa: E501
                "'테스트 문의 내용입니다. 확인 부탁드립니다.', 'PENDING', false, now(), now())"  # noqa: E501
            ),
            {"id": str(inquiry_id), "tenant_id": test_tenant["id"]},
        )
        await session.commit()

    yield {"id": str(inquiry_id), "tenant_id": test_tenant["id"]}

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )  # noqa: E501
        await session.execute(
            text("DELETE FROM inquiries WHERE id = :iid"),
            {"iid": str(inquiry_id)},
        )
        await session.commit()
