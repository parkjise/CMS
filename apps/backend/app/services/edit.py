import uuid
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.section import Section, SectionSetting
from app.schemas.edit import BatchChangeItem
from app.services import site_cache
from app.services.gallery_settings import (
    GALLERY_FIELD,
    GALLERY_VALUE_TYPE,
    normalize_gallery_items,
)
from app.services.link_settings import is_url_field, validate_link_url
from app.services.rich_text import RICH_TEXT_VALUE_TYPE, normalize_rich_text

# Per-field max lengths; any field not listed falls back to _DEFAULT_MAX_LEN
_FIELD_MAX_LENGTHS: dict[str, int] = {
    "main_title": 40,
    "sub_title": 100,
    "button_text": 30,
    "label": 50,
    "description": 500,
    "address": 200,
    "phone": 20,
    "email": 100,
}
_DEFAULT_MAX_LEN = 1000


def _max_len(field: str) -> int:
    return _FIELD_MAX_LENGTHS.get(field, _DEFAULT_MAX_LEN)


def _value_type(field: str) -> str:
    if field == GALLERY_FIELD:
        return GALLERY_VALUE_TYPE
    if field.endswith("_url") or "image" in field:
        return "url"
    return "text"


def _validate(field: str, value: str | None, rich: bool = False) -> str | None:
    """검사 후 저장할 값 — 갤러리 목록은 정리된 JSON 으로 (T-064-A)."""
    if value is None:
        return None
    if field == GALLERY_FIELD:
        # 장수 · 캡션 · 주소를 따로 검사 — 글자 수 한도(1000자) 대신
        return normalize_gallery_items(value)
    if is_url_field(field) and not rich:
        # 버튼 링크 · 이미지 주소 — javascript: 등 차단 (T-065-B)
        return validate_link_url(field, value)
    limit = _max_len(field)
    if rich:
        # 서식 글은 허용 태그만 남기고, 한도는 태그를 뺀 글자 수로 (T-065-A)
        return normalize_rich_text(field, value, limit)
    if len(value) > limit:
        raise ValueError(f"{field}은(는) {limit}자 이하여야 합니다.")
    return value


async def batch_save(
    db: AsyncSession,
    tenant_id: UUID,
    changes: list[BatchChangeItem],
) -> dict:
    saved_count = 0
    failed_count = 0

    for change in changes:
        try:
            rich = change.format == "rich"
            value = _validate(change.field, change.value, rich)

            section_row = await db.execute(
                select(Section).where(
                    Section.id == change.section_id,
                    Section.deleted_at.is_(None),
                )
            )
            section = section_row.scalar_one_or_none()
            if not section:
                failed_count += 1
                continue

            existing_row = await db.execute(
                select(SectionSetting).where(
                    SectionSetting.section_id == change.section_id,
                    SectionSetting.field_key == change.field,
                )
            )
            existing = existing_row.scalar_one_or_none()
            if existing:
                existing.field_value = value
                if change.field == GALLERY_FIELD:
                    existing.value_type = GALLERY_VALUE_TYPE
                elif rich:
                    existing.value_type = RICH_TEXT_VALUE_TYPE
                elif existing.value_type == RICH_TEXT_VALUE_TYPE:
                    # 서식을 모두 지운 글 — 다시 일반 글자로 보여야 한다
                    existing.value_type = _value_type(change.field)
                existing.is_sample = False
                existing.updated_at = datetime.now(UTC)
            else:
                db.add(
                    SectionSetting(
                        id=uuid.uuid4(),
                        tenant_id=tenant_id,
                        section_id=change.section_id,
                        field_key=change.field,
                        field_value=value,
                        value_type=(
                            RICH_TEXT_VALUE_TYPE if rich else _value_type(change.field)
                        ),
                        created_at=datetime.now(UTC),
                        updated_at=datetime.now(UTC),
                    )
                )
            saved_count += 1
        except Exception:
            failed_count += 1

    cache_purged = False
    if saved_count > 0:
        await db.commit()
        db.expire_all()
        cache_purged = await _purge_cache(db, tenant_id)

    return {
        "saved_count": saved_count,
        "failed_count": failed_count,
        "cache_purged": cache_purged,
    }


async def _purge_cache(db: AsyncSession, tenant_id: UUID) -> bool:
    # Redis + 홈페이지(Next.js) 캐시 — services/site_cache.py (T-066-A)
    return await site_cache.purge_site(db, tenant_id)
