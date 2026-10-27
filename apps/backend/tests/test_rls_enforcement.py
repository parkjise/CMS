"""RLS 실제 적용 — 앱 계정 · DB 수준 테넌트 격리 · 컨텍스트 누수 방지.

- 앱 계정(cms_app)은 슈퍼유저 · BYPASSRLS 가 아니다 (이전엔 소유자 슈퍼유저라 RLS 무시)
- 테넌트 A 컨텍스트에서 B 의 행은 조회 0건, B 의 tenant_id 로 쓰기는 RLS 위반
- 컨텍스트가 없으면 테넌트 테이블은 0건 (공개 API 가 빠뜨리면 데이터가 안 보임)
- set_rls_context 는 commit 뒤 다음 트랜잭션에도 유지
- 커넥션을 재사용해도 이전 요청의 테넌트 · 슈퍼 어드민 권한이 남지 않는다
- scripts/init_db_roles.py — 계정 · 권한 SQL, 잘못된 설정 거부
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db import session as db_session
from app.db.session import NO_TENANT, set_rls_context, set_super_admin_context
from tests.conftest import TEST_APP_URL, TEST_OWNER_URL, _TestSession

_SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "init_db_roles.py"
_spec = importlib.util.spec_from_file_location("_init_db_roles_t", _SCRIPT)
assert _spec and _spec.loader
roles = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(roles)


def _app_session() -> AsyncSession:
    return db_session.AsyncSessionLocal()


async def _settings(db: AsyncSession) -> tuple[str, str]:
    row = (
        await db.execute(
            text(
                "SELECT current_setting('app.current_tenant_id', true), "
                "current_setting('app.is_super_admin', true)"
            )
        )
    ).one()
    return row[0], row[1]


@pytest.fixture
async def two_tenants():
    """섹션이 하나씩 있는 테넌트 A · B (소유자 계정으로 준비 · 정리)."""
    ids = [uuid.uuid4(), uuid.uuid4()]
    sections = [uuid.uuid4(), uuid.uuid4()]
    async with _TestSession() as s:
        for tid, sid in zip(ids, sections, strict=True):
            await s.execute(
                text(
                    "INSERT INTO tenants (id, name, slug, plan_type, is_active,"
                    " created_at, updated_at) VALUES (:id, 'RLS', :slug, 'FREE',"
                    " true, now(), now())"
                ),
                {"id": str(tid), "slug": f"rls-{tid.hex[:8]}"},
            )
            await s.execute(
                text(
                    "INSERT INTO sections (id, tenant_id, section_type, label,"
                    " display_order, is_active, created_at, updated_at) VALUES"
                    " (:id, :tid, 'INTRO', 'rls', 0, true, now(), now())"
                ),
                {"id": str(sid), "tid": str(tid)},
            )
        await s.commit()
    yield {"tenants": ids, "sections": sections}
    async with _TestSession() as s:
        for tid in ids:
            await s.execute(
                text("DELETE FROM sections WHERE tenant_id = :t"), {"t": str(tid)}
            )
            await s.execute(text("DELETE FROM tenants WHERE id = :t"), {"t": str(tid)})
        await s.commit()


async def _visible_sections(db: AsyncSession, ids: list[uuid.UUID]) -> set[str]:
    rows = await db.execute(
        text("SELECT tenant_id::text FROM sections WHERE tenant_id = ANY(:ids)"),
        {"ids": ids},
    )
    return {r[0] for r in rows}


class TestAppRole:
    async def test_app_connects_as_unprivileged_role(self):
        async with _app_session() as db:
            row = (
                await db.execute(
                    text(
                        "SELECT current_user, rolsuper, rolbypassrls FROM pg_roles"
                        " WHERE rolname = current_user"
                    )
                )
            ).one()
        assert row[0] == "cms_app"
        assert row[1] is False and row[2] is False

    async def test_app_role_cannot_change_schema(self):
        async with _app_session() as db:
            with pytest.raises(DBAPIError):
                await db.execute(text("CREATE TABLE rls_should_fail (id int)"))

    async def test_app_role_cannot_write_alembic_version(self):
        async with _app_session() as db:
            with pytest.raises(DBAPIError):
                await db.execute(text("UPDATE alembic_version SET version_num = 'x'"))


class TestDatabaseIsolation:
    async def test_tenant_context_sees_only_own_rows(self, two_tenants):
        a, b = two_tenants["tenants"]
        async with _app_session() as db:
            await set_rls_context(db, a)
            assert await _visible_sections(db, [a, b]) == {str(a)}

    async def test_no_context_sees_nothing(self, two_tenants):
        async with _app_session() as db:
            assert await _visible_sections(db, two_tenants["tenants"]) == set()

    async def test_super_admin_context_sees_all(self, two_tenants):
        a, b = two_tenants["tenants"]
        async with _app_session() as db:
            await set_super_admin_context(db)
            assert await _visible_sections(db, [a, b]) == {str(a), str(b)}

    async def test_cannot_write_into_other_tenant(self, two_tenants):
        a, b = two_tenants["tenants"]
        async with _app_session() as db:
            await set_rls_context(db, a)
            with pytest.raises(DBAPIError, match="row-level security"):
                await db.execute(
                    text(
                        "INSERT INTO sections (id, tenant_id, section_type, label,"
                        " display_order, is_active, created_at, updated_at) VALUES"
                        " (gen_random_uuid(), :tid, 'INTRO', 'x', 0, true, now(),"
                        " now())"
                    ),
                    {"tid": str(b)},
                )

    async def test_cannot_update_other_tenant_rows(self, two_tenants):
        a, b = two_tenants["tenants"]
        async with _app_session() as db:
            await set_rls_context(db, a)
            result = await db.execute(
                text("UPDATE sections SET label = 'hacked' WHERE tenant_id = :t"),
                {"t": str(b)},
            )
            assert result.rowcount == 0


class TestContextLifetime:
    async def test_context_survives_commit(self, two_tenants):
        a, b = two_tenants["tenants"]
        async with _app_session() as db:
            await set_rls_context(db, a)
            await db.commit()  # 커넥션을 풀에 돌려주고 다음 쿼리에서 새로 받는다
            assert await _visible_sections(db, [a, b]) == {str(a)}
            assert await _settings(db) == (str(a), "false")

    async def test_switching_to_tenant_drops_super_admin(self, two_tenants):
        a, b = two_tenants["tenants"]
        async with _app_session() as db:
            await set_super_admin_context(db)
            await set_rls_context(db, a)
            assert await _visible_sections(db, [a, b]) == {str(a)}

    async def test_pooled_connection_does_not_leak_context(self, two_tenants):
        """같은 커넥션을 다음 세션이 재사용해도 이전 컨텍스트가 남지 않는다."""
        a, b = two_tenants["tenants"]
        engine = create_async_engine(TEST_APP_URL, pool_size=1, max_overflow=0)
        db_session.install_rls_reset(engine)
        maker = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with maker() as first:
                await set_super_admin_context(first)
                # 누군가 세션 단위로 남겨도(set_config(..., false)) 초기화돼야 한다
                await first.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', false)")
                )
                await first.commit()
                pid = (await first.execute(text("SELECT pg_backend_pid()"))).scalar()
            async with maker() as second:
                assert (
                    await second.execute(text("SELECT pg_backend_pid()"))
                ).scalar() == pid  # 같은 커넥션 재사용
                assert await _settings(second) == (NO_TENANT, "false")
                assert await _visible_sections(second, [a, b]) == set()
        finally:
            await engine.dispose()


class TestInitDbRoles:
    def test_rejects_same_account(self):
        with pytest.raises(roles.RoleSetupError, match="같습니다"):
            import asyncio

            asyncio.run(roles.ensure_app_role(TEST_OWNER_URL, TEST_OWNER_URL))

    @pytest.mark.parametrize(
        ("app_url", "message"),
        [
            ("postgresql+asyncpg://cms_app@localhost/cms_test_db", "비밀번호"),
            ("postgresql+asyncpg://cms_app:pw@localhost/other_db", "DB 가 다릅니다"),
            ("postgresql+asyncpg://Bad-Name:pw@localhost/cms_test_db", "영문 소문자"),
        ],
    )
    async def test_rejects_invalid_settings(self, app_url, message):
        with pytest.raises(roles.RoleSetupError, match=message):
            await roles.ensure_app_role(TEST_OWNER_URL, app_url)

    def test_statements_grant_dml_only(self):
        sql = "\n".join(roles.statements("cms_user", "cms_app", "p'w", "cms_db"))
        assert "NOSUPERUSER NOBYPASSRLS" in sql
        assert "PASSWORD 'p''w'" in sql  # 따옴표 이스케이프
        assert "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES" in sql
        assert 'ALTER DEFAULT PRIVILEGES FOR ROLE "cms_user"' in sql
        assert "REVOKE INSERT, UPDATE, DELETE ON public.alembic_version" in sql
        for forbidden in ("SUPERUSER PASSWORD", "BYPASSRLS PASSWORD", "GRANT ALL"):
            assert forbidden not in sql

    async def test_idempotent_and_verified(self):
        assert await roles.ensure_app_role(TEST_OWNER_URL, TEST_APP_URL) == "cms_app"
        assert await roles.ensure_app_role(TEST_OWNER_URL, TEST_APP_URL) == "cms_app"
        info = await roles.verify_app_role(TEST_APP_URL)
        assert info == {"rolname": "cms_app", "rolsuper": False, "rolbypassrls": False}
