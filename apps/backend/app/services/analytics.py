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
_MV_PREFIX = "analytics:mv"  # 모바일 페이지뷰
_REF_PREFIX = "analytics:ref"  # 유입 경로별 카운트 (hash)

_MOBILE_RE = re.compile(
    r"Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini",
    re.IGNORECASE,
)

# 유입 경로 분류 (호스트 부분 문자열 → 소스 라벨)
_REFERRER_SOURCES: list[tuple[str, str]] = [
    ("naver.", "naver"),
    ("google.", "google"),
    ("instagram.", "instagram"),
    ("facebook.", "facebook"),
    ("fb.", "facebook"),
    ("youtube.", "youtube"),
    ("youtu.be", "youtube"),
    ("kakao", "kakao"),
    ("daum.", "daum"),
]

# 플랜별 분석 데이터 조회 최대 일수 (BASIC은 7일만)
ANALYTICS_MAX_DAYS: dict[str, int] = {
    "FREE": 7,
    "BASIC": 7,
    "STANDARD": 90,
    "PREMIUM": 90,
}
_DEFAULT_MAX_DAYS = 7


def _date_str() -> str:
    return datetime.now(UTC).date().isoformat()


def _pv_key(tenant_id: str, date_str: str) -> str:
    return f"{_PV_PREFIX}:{tenant_id}:{date_str}"


def _uv_key(tenant_id: str, date_str: str) -> str:
    return f"{_UV_PREFIX}:{tenant_id}:{date_str}"


def _mv_key(tenant_id: str, date_str: str) -> str:
    return f"{_MV_PREFIX}:{tenant_id}:{date_str}"


def _ref_key(tenant_id: str, date_str: str) -> str:
    return f"{_REF_PREFIX}:{tenant_id}:{date_str}"


def _hash_ip(ip: str) -> str:
    return hashlib.sha256(ip.encode()).hexdigest()


def is_mobile(user_agent: str) -> bool:
    return bool(_MOBILE_RE.search(user_agent))


def classify_referrer(referrer: str) -> str:
    """Referer 헤더 → 유입 경로 소스 라벨. 비어 있으면 'direct'."""
    if not referrer or not referrer.strip():
        return "direct"
    host = referrer.lower()
    for needle, label in _REFERRER_SOURCES:
        if needle in host:
            return label
    return "other"


async def record_pageview(
    tenant_id: str,
    ip: str,
    user_agent: str = "",
    referrer: str = "",
) -> None:
    today = _date_str()
    pv_key = _pv_key(tenant_id, today)
    uv_key = _uv_key(tenant_id, today)
    mv_key = _mv_key(tenant_id, today)
    ref_key = _ref_key(tenant_id, today)
    ip_hash = _hash_ip(ip)
    source = classify_referrer(referrer)

    redis = await get_redis()
    async with redis.pipeline() as pipe:
        pipe.incr(pv_key)
        pipe.expire(pv_key, _KEY_TTL)
        pipe.pfadd(uv_key, ip_hash)
        pipe.expire(uv_key, _KEY_TTL)
        if is_mobile(user_agent):
            pipe.incr(mv_key)
            pipe.expire(mv_key, _KEY_TTL)
        pipe.hincrby(ref_key, source, 1)
        pipe.expire(ref_key, _KEY_TTL)
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
    mv = int(await redis.get(_mv_key(tid_str, date_str)) or 0)
    ref_raw = await redis.hgetall(_ref_key(tid_str, date_str)) or {}
    referrers = {str(k): int(v) for k, v in ref_raw.items()}

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
            mobile_views=mv,
            referrers=referrers,
        )
        .on_conflict_do_update(
            index_elements=["tenant_id", "date"],
            set_={
                "page_views": pv,
                "unique_visitors": uv,
                "mobile_views": mv,
                "referrers": referrers,
            },
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

    week_start = datetime.now(UTC).date() - timedelta(days=datetime.now(UTC).weekday())
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


def max_days_for_plan(plan_type: str) -> int:
    return ANALYTICS_MAX_DAYS.get((plan_type or "").upper(), _DEFAULT_MAX_DAYS)


async def get_timeseries(
    db: AsyncSession,
    tenant_id: UUID,
    plan_type: str,
    requested_days: int,
) -> dict:
    """방문자 추이 + 모바일 비율 + 상위 유입 경로. 플랜별 최대 일수로 클램프."""
    max_days = max_days_for_plan(plan_type)
    days = max(1, min(requested_days, max_days))
    start = datetime.now(UTC).date() - timedelta(days=days - 1)

    rows = (
        (
            await db.execute(
                select(SiteAnalytics)
                .where(
                    SiteAnalytics.tenant_id == tenant_id,
                    SiteAnalytics.date >= start,
                )
                .order_by(SiteAnalytics.date)
            )
        )
        .scalars()
        .all()
    )

    # 날짜별 시계열 (데이터 없는 날은 0으로 채움)
    by_date = {r.date.isoformat(): r for r in rows}
    series = []
    total_views = 0
    mobile_views = 0
    referrer_totals: dict[str, int] = {}
    for offset in range(days):
        d = (start + timedelta(days=offset)).isoformat()
        row = by_date.get(d)
        pv = row.page_views if row else 0
        uv = row.unique_visitors if row else 0
        series.append({"date": d, "page_views": pv, "unique_visitors": uv})
        if row:
            total_views += row.page_views
            mobile_views += row.mobile_views
            for source, count in (row.referrers or {}).items():
                referrer_totals[source] = referrer_totals.get(source, 0) + int(count)

    desktop_views = max(total_views - mobile_views, 0)
    top_referrers = [
        {"source": s, "count": c}
        for s, c in sorted(referrer_totals.items(), key=lambda kv: kv[1], reverse=True)
    ]

    return {
        "days": days,
        "max_days": max_days,
        "series": series,
        "mobile_ratio": {
            "mobile": mobile_views,
            "desktop": desktop_views,
            "total": total_views,
        },
        "top_referrers": top_referrers,
    }
