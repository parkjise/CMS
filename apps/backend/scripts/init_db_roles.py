"""
앱 전용 DB 계정 생성 · 권한 설정 (RLS 실제 적용).

    python scripts/init_db_roles.py   # alembic upgrade head 다음 (운영도 배포 시 1회)

- MIGRATION_DATABASE_URL(소유자)로 접속해 DATABASE_URL 의 계정을 만든다
  (이미 있으면 비밀번호 · 속성만 맞춘다 — 여러 번 실행해도 안전)
- 앱 계정은 슈퍼유저 · BYPASSRLS · DB/역할 생성 권한이 없다
  → 테넌트 격리(RLS)가 DB 에서 강제된다
- 권한: 테이블 읽기 · 쓰기 · 삭제, 시퀀스 사용. 앞으로 만들 테이블에도 자동 부여
  (default privileges). alembic_version 은 읽기만
"""

import asyncio
import re
import sys
from dataclasses import dataclass
from pathlib import Path

# `python scripts/...` 로 바로 실행해도 app 패키지를 찾도록 (seed.py 와 같은 방식)
sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncpg
from sqlalchemy.engine import make_url

_IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")


class RoleSetupError(Exception):
    """계정을 만들 수 없는 설정 (같은 계정 · 잘못된 이름 등)."""


@dataclass(frozen=True)
class DbTarget:
    user: str
    password: str
    database: str
    dsn: str


def _target(url: str) -> DbTarget:
    u = make_url(url)
    if not u.username or not u.database:
        raise RoleSetupError(
            f"계정 · DB 이름이 없는 주소입니다: {u.render_as_string()}"
        )
    dsn = u.set(drivername="postgresql").render_as_string(hide_password=False)
    return DbTarget(u.username, u.password or "", u.database, dsn)


def _ident(name: str) -> str:
    if not _IDENT.match(name):
        raise RoleSetupError(f"계정 · DB 이름은 영문 소문자 · 숫자 · _ 만: {name}")
    return f'"{name}"'


def _literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def statements(owner: str, app: str, password: str, database: str) -> list[str]:
    """앱 계정 생성 · 권한 SQL (순서대로 실행)."""
    o, a, d = _ident(owner), _ident(app), _ident(database)
    attrs = "LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT"
    return [
        f"""DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = {_literal(app)}) THEN
    CREATE ROLE {a} {attrs} PASSWORD {_literal(password)};
  END IF;
END $$""",
        f"ALTER ROLE {a} {attrs} PASSWORD {_literal(password)}",
        f"GRANT CONNECT ON DATABASE {d} TO {a}",
        f"GRANT USAGE ON SCHEMA public TO {a}",
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {a}",
        f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {a}",
        f"ALTER DEFAULT PRIVILEGES FOR ROLE {o} IN SCHEMA public "
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {a}",
        f"ALTER DEFAULT PRIVILEGES FOR ROLE {o} IN SCHEMA public "
        f"GRANT USAGE, SELECT ON SEQUENCES TO {a}",
        f"""DO $$ BEGIN
  IF to_regclass('public.alembic_version') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE ON public.alembic_version FROM {a};
  END IF;
END $$""",
    ]


async def ensure_app_role(owner_url: str, app_url: str) -> str:
    """소유자 계정으로 앱 계정을 만들고 권한을 준다 → 앱 계정 이름."""
    owner, app = _target(owner_url), _target(app_url)
    if owner.user == app.user:
        raise RoleSetupError(
            f"앱 계정과 소유자 계정이 같습니다({app.user}) — RLS 가 적용되지 않습니다. "
            "DATABASE_URL 을 별도 계정(예: cms_app)으로 바꾸세요"
        )
    if not app.password:
        raise RoleSetupError("DATABASE_URL 에 앱 계정 비밀번호가 없습니다")
    if owner.database != app.database:
        raise RoleSetupError(
            f"두 주소의 DB 가 다릅니다 ({owner.database} ≠ {app.database})"
        )
    conn = await asyncpg.connect(owner.dsn)
    try:
        async with conn.transaction():
            for sql in statements(owner.user, app.user, app.password, app.database):
                await conn.execute(sql)
    finally:
        await conn.close()
    return app.user


async def verify_app_role(app_url: str) -> dict:
    """앱 계정으로 접속해 속성 확인 (슈퍼유저 · RLS 우회가 아니어야 한다)."""
    conn = await asyncpg.connect(_target(app_url).dsn)
    try:
        row = await conn.fetchrow(
            "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles "
            "WHERE rolname = current_user"
        )
    finally:
        await conn.close()
    return dict(row) if row else {}


def main() -> int:
    from app.core.config import settings

    owner_url = settings.migration_database_url or settings.database_url
    try:
        name = asyncio.run(ensure_app_role(owner_url, settings.database_url))
        info = asyncio.run(verify_app_role(settings.database_url))
    except (RoleSetupError, OSError, asyncpg.PostgresError) as e:
        print(f"❌ 앱 DB 계정 설정 실패: {e}")
        return 1
    if info.get("rolsuper") or info.get("rolbypassrls"):
        print(f"❌ {name} 계정이 슈퍼유저 또는 RLS 우회 권한을 갖고 있습니다")
        return 1
    print(f"✅ 앱 DB 계정 '{name}' 준비 완료 (일반 권한 · RLS 적용)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
