import asyncio

from app.db.session import set_super_admin_context
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.analytics.flush_analytics", bind=True, max_retries=3)
def flush_analytics(self):
    """매시 정각: Redis 분석 카운터 → PostgreSQL site_analytics upsert"""
    try:
        asyncio.run(_flush())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


async def _flush() -> None:

    from app.db.session import AsyncSessionLocal
    from app.services.analytics import flush_all_to_db

    async with AsyncSessionLocal() as db:
        await set_super_admin_context(db)
        await flush_all_to_db(db)
