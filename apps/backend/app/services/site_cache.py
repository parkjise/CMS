"""홈페이지 캐시 비우기 (T-066-A) — 콘텐츠를 저장하면 홈페이지에 바로 반영.

캐시는 두 겹이다.
1. 백엔드 Redis — 섹션 목록 `sections:{tenant_id}`, 공개 사이트 `site:{slug}` (10분)
2. 홈페이지(Next.js) 데이터 캐시 — 태그 `site:{slug}` (60초)

`purge_site()` 가 둘 다 비운다. 2는 홈페이지의 POST /api/revalidate 를 비밀 키와 함께
호출한다 (CLIENT_INTERNAL_URL · REVALIDATE_SECRET, 비어 있으면 건너뜀).
캐시 비우기 실패가 저장을 실패시키면 안 되므로 모두 best-effort.
"""

import logging
from collections.abc import Sequence
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import get_redis
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

REVALIDATE_PATH = "/api/revalidate"
REVALIDATE_TIMEOUT_SECONDS = 2.0
SECRET_HEADER = "x-revalidate-secret"


def sections_key(tenant_id: UUID | str) -> str:
    return f"sections:{tenant_id}"


def site_key(slug: str) -> str:
    return f"site:{slug}"


async def revalidate_client(slugs: list[str]) -> bool:
    """홈페이지(Next.js) 데이터 캐시를 비운다 — 성공하면 True."""
    if not slugs or not settings.revalidate_secret:
        return False
    url = settings.client_internal_url.rstrip("/") + REVALIDATE_PATH
    try:
        async with httpx.AsyncClient(timeout=REVALIDATE_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                url,
                json={"slugs": slugs},
                headers={SECRET_HEADER: settings.revalidate_secret},
            )
        resp.raise_for_status()
        return True
    except httpx.HTTPError:
        logger.warning("홈페이지 캐시 비우기 실패: %s", url, exc_info=True)
        return False


async def purge_slugs(slugs: list[str], tenant_ids: Sequence[UUID | str] = ()) -> bool:
    """Redis 캐시 + 홈페이지 캐시를 비운다 (슬러그를 이미 알 때)."""
    redis_ok = True
    keys = [sections_key(t) for t in tenant_ids] + [site_key(s) for s in slugs]
    if keys:
        try:
            redis = await get_redis()
            await redis.delete(*keys)
        except Exception:  # noqa: BLE001 - 캐시 비우기는 best-effort
            logger.warning("Redis 사이트 캐시 비우기 실패", exc_info=True)
            redis_ok = False
    await revalidate_client(slugs)
    return redis_ok


async def purge_site(db: AsyncSession, tenant_id: UUID) -> bool:
    """테넌트 하나의 섹션 · 공개 사이트 캐시를 비운다 — Redis 성공 여부 반환."""
    try:
        tenant = await db.get(Tenant, tenant_id)
    except Exception:  # noqa: BLE001
        logger.warning("캐시 비우기용 테넌트 조회 실패", exc_info=True)
        tenant = None
    slugs = [tenant.slug] if tenant else []
    return await purge_slugs(slugs, [tenant_id])
