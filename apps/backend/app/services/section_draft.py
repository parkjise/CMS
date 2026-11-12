"""저장 전 미리보기 (T-206, 상위 기획서 AD-02 · 10.2 #13).

관리자가 섹션 편집 화면에서 [미리보기]를 누르면 저장하지 않은 설정을 Redis 에
10분 보관하고, 홈페이지 미리보기가 그 설정을 덮어 그린다. DB 에는 쓰지 않는다.
설정은 저장할 때와 같은 검사 · 정리(validate_settings)를 거친다 — 공개 주소라서.
"""

import json
import secrets
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.schemas.public_site import PublicSettingItem, PublicSiteResponse
from app.schemas.section import SectionSettingUpdate
from app.services import board_latest
from app.services import section as section_service

DRAFT_TTL_SECONDS = 600


def _key(token: str) -> str:
    return f"section-draft:{token}"


async def create_draft(
    db: AsyncSession,
    tenant_id: UUID,
    section_id: UUID,
    settings: list[SectionSettingUpdate],
) -> tuple[str, str] | None:
    """미리볼 설정을 보관 → (토큰, 섹션이 있는 페이지). 섹션이 없으면 None.

    검사에 걸리면 ValueError — 저장과 같은 문구.
    """
    section = await section_service.get_section_by_id(db, section_id, tenant_id)
    if section is None:
        return None
    current = {s.field_key: s.field_value for s in section.settings}
    section_service.validate_settings(settings, current)
    if section.section_type in board_latest.LATEST_SECTION_TYPES:
        await board_latest.validate_settings(db, tenant_id, settings)

    token = secrets.token_urlsafe(24)
    payload = {
        "tenant_id": str(tenant_id),
        "section_id": str(section_id),
        "settings": [s.model_dump() for s in settings],
    }
    redis = await get_redis()
    await redis.setex(_key(token), DRAFT_TTL_SECONDS, json.dumps(payload))
    return token, section.page_key


async def load_draft(token: str) -> dict | None:
    if not token or len(token) > 64:
        return None
    redis = await get_redis()
    raw = await redis.get(_key(token))
    return json.loads(raw) if raw else None


def apply_draft(site: PublicSiteResponse, draft: dict) -> PublicSiteResponse:
    """사이트 응답의 그 섹션 설정을 미리볼 값으로 덮는다.

    숨긴 섹션도 미리보기에서는 보이게 한다 — 고치는 중인 화면을 확인하려는 것이라.
    """
    changed = [PublicSettingItem(**s) for s in draft["settings"]]
    keys = {s.field_key for s in changed}
    for section in site.sections:
        if str(section.id) == draft["section_id"]:
            section.is_active = True
            kept = [s for s in section.settings if s.field_key not in keys]
            section.settings = kept + changed
    return site
