import hashlib
import re
import uuid
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.models.analytics import SiteAnalytics

_KEY_TTL = 60 * 60 * 36  # 36시간 (당일 + 12시간 여유)
_PV_PREFIX = "analytics:pv"
_UV_PREFIX = "analytics:uv"

_MOBILE_RE = re.compile(
    r"Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini",
    re.IGNORECASE,
)


def _date_str() -> str:
    return datetime.now(UTC).date().isoformat()


def _pv_key(tenant_id: str, date_str: str) -> str:
    return f"{_PV_PREFIX}:{tenant_id}:{date_str}"


def _uv_key(tenant_id: str, date_str: str) -> str:
    return f"{_UV_PREFIX}:{tenant_id}:{date_str}"


def _hash_ip(ip: str) -> str:
    return hashlib.sha256(ip.encode()).hexdigest()


def is_mobile(user_agent: str) -> bool:
    return bool(_MOBILE_RE.search(user_agent))


async def record_pageview(
    tenant_id: str,
    ip: str,
    user_agent: str = "",
) -> None:
    today = _date_str()
    pv_key = _pv_key(tenant_id, today)
    uv_key = _uv_key(tenant_id, today)
    ip_hash = _hash_ip(ip)

    redis = await get_redis()
    async with redis.pipeline() as pipe:
        pipe.incr(pv_key)
        pipe.expire(pv_key, _KEY_TTL)
        pipe.pfadd(uv_key, ip_hash)
        pipe.expire(uv_key, _KEY_TTL)
        await pipe.execute()


async def flush_tenant_to_db(
    db: AsyncSession,
    tenant_id: UUID,
    date_str: str,
) -> None:
    """Redis 카운터 → PostgreSQL site_analytics upsert"""
    tid_str = str(tenant_id)
    redis = await get_redis()

    pv = int(await redis.get(_pv_key(tid_str, date_str)) or 0)
    uv = int(await redis.pfcount(_uv_key(tid_str, date_str)) or 0)

    if pv == 0:
        return

    target_date = date.fromisoformat(date_str)
    stmt = (
        pg_insert(SiteAnalytics)
        .values(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            date=target_date,
            page_views=pv,
            unique_visitors=uv,
        )
        .on_conflict_do_update(
            index_elements=["tenant_id", "date"],
            set_={"page_views": pv, "unique_visitors": uv},
        )
    )
    await db.execute(stmt)
    await db.commit()


async def flush_all_to_db(db: AsyncSession) -> int:
    """모든 테넌트의 오늘 분석 데이터를 DB에 기록. 처리된 테넌트 수 반환."""
    redis = await get_redis()
    today = _date_str()
    pattern = f"{_PV_PREFIX}:*:{today}"

    flushed = 0
    async for key in redis.scan_iter(pattern):
        # key = "analytics:pv:{tenant_id}:{date}"
        parts = key.split(":")
        if len(parts) < 4:
            continue
        tid_str = parts[2]
        try:
            tenant_id = UUID(tid_str)
        except ValueError:
            continue
        await flush_tenant_to_db(db, tenant_id, today)
        flushed += 1

    return flushed


async def get_summary(db: AsyncSession, tenant_id: UUID) -> dict:
    """오늘 + 이번 주 통계 (Redis 우선, DB 보완)"""
    redis = await get_redis()
    today = _date_str()
    tid_str = str(tenant_id)

    redis_pv = int(await redis.get(_pv_key(tid_str, today)) or 0)
    redis_uv = int(await redis.pfcount(_uv_key(tid_str, today)) or 0)

    week_start = datetime.now(UTC).date() - timedelta(
        days=datetime.now(UTC).weekday()
    )
    week_result = await db.execute(
        select(
            func.sum(SiteAnalytics.page_views),
            func.sum(SiteAnalytics.unique_visitors),
        ).where(
            SiteAnalytics.tenant_id == tenant_id,
            SiteAnalytics.date >= week_start,
        )
    )
    week_pv, week_uv = week_result.one()

    return {
        "today_page_views": redis_pv,
        "today_unique_visitors": redis_uv,
        "week_page_views": int(week_pv or 0),
        "week_unique_visitors": int(week_uv or 0),
    }
