from collections.abc import AsyncGenerator
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(
    settings.database_url,
    pool_size=settings.database_pool_size,
    max_overflow=settings.database_max_overflow,
    echo=settings.app_env == "development",
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


async def set_rls_context(
    session: AsyncSession,
    tenant_id: UUID,
    is_super_admin: bool = False,
) -> None:
    await session.execute(
        "SELECT set_config('app.current_tenant_id', :tid, true), "
        "set_config('app.is_super_admin', :sa, true)",
        {"tid": str(tenant_id), "sa": str(is_super_admin).lower()},
    )
