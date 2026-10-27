from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import Session

from app.core.config import settings

# RLS 컨텍스트 기본값 — 어떤 테넌트와도 맞지 않는 값 (빈 문자열은 ::uuid 변환 오류)
NO_TENANT = "00000000-0000-0000-0000-000000000000"
_RESET_RLS_SQL = (
    f"SELECT set_config('app.current_tenant_id', '{NO_TENANT}', false), "
    "set_config('app.is_super_admin', 'false', false)"
)


def install_rls_reset(target: AsyncEngine) -> None:
    """풀에서 커넥션을 꺼낼 때마다 RLS 컨텍스트를 초기화한다 (이중 안전장치).

    컨텍스트는 트랜잭션 단위로 설정하지만, 누군가 세션 단위로 설정해도
    커넥션을 재사용하는 다음 요청에 이전 테넌트 · 슈퍼 어드민 권한이 남지 않게 한다.
    """

    @event.listens_for(target.sync_engine, "checkout")
    def _reset(dbapi_connection: Any, _record: Any, _proxy: Any) -> None:
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute(_RESET_RLS_SQL)
        finally:
            cursor.close()


engine = create_async_engine(
    settings.database_url,
    pool_size=settings.database_pool_size,
    max_overflow=settings.database_max_overflow,
    echo=settings.app_env == "development",
)

install_rls_reset(engine)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


_RLS_INFO_KEY = "rls_context"
_APPLY_RLS_SQL = text(
    "SELECT set_config('app.current_tenant_id', :tid, true), "
    "set_config('app.is_super_admin', :sa, true)"
)


@event.listens_for(Session, "after_begin")
def _apply_rls_on_begin(session: Session, _transaction: Any, connection: Any) -> None:
    """세션에 정해 둔 RLS 컨텍스트를 트랜잭션마다 다시 적용한다.

    세션은 commit 할 때 커넥션을 풀에 돌려주고 다음 쿼리에서 새로 받으므로,
    커넥션에 남기는 방식으로는 commit 뒤 refresh · 다음 쿼리에서 컨텍스트가 사라진다.
    트랜잭션 단위(set_config(..., true))라 커넥션을 돌려주면 자동으로 없어진다.
    """
    ctx = session.info.get(_RLS_INFO_KEY)
    if ctx is not None:
        connection.execute(_APPLY_RLS_SQL, {"tid": ctx[0], "sa": ctx[1]})


async def set_rls_context(
    session: AsyncSession,
    tenant_id: UUID,
    is_super_admin: bool = False,
) -> None:
    """이 세션의 RLS 컨텍스트 — 이후 모든 트랜잭션(commit 뒤 포함)에 적용된다."""
    ctx = (str(tenant_id), str(is_super_admin).lower())
    session.sync_session.info[_RLS_INFO_KEY] = ctx
    # 진행 중인 트랜잭션에도 바로 적용 (새 트랜잭션이면 after_begin 이 한 번 더)
    await session.execute(_APPLY_RLS_SQL, {"tid": ctx[0], "sa": ctx[1]})


async def set_super_admin_context(session: AsyncSession) -> None:
    """RLS 우회 — 여러 테넌트를 다루는 작업용 (로그인 · 슈퍼 어드민 · 배치 등)."""
    await set_rls_context(session, UUID(NO_TENANT), is_super_admin=True)


def create_owner_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """소유자 계정(MIGRATION_DATABASE_URL) 세션 — 시드 · 운영 스크립트 전용.

    FORCE RLS 라 소유자도 정책을 따르므로 set_super_admin_context 와 함께 쓴다.
    """
    owner_engine = create_async_engine(
        settings.migration_database_url or settings.database_url
    )
    install_rls_reset(owner_engine)
    return async_sessionmaker(
        bind=owner_engine, class_=AsyncSession, expire_on_commit=False
    )
