import uuid
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.section import Section, SectionSetting
from app.schemas.section import SectionOrderItem, SectionSettingUpdate, SectionUpdate
from app.services.gallery_settings import (
    GALLERY_FIELD,
    GALLERY_VALUE_TYPE,
    normalize_gallery_items,
)
from app.services.link_settings import is_url_field, validate_link_url
from app.services.rich_text import RICH_TEXT_VALUE_TYPE, normalize_rich_text

# main_title 필드 최대 길이
MAIN_TITLE_MAX_LEN = 40


async def get_sections(db: AsyncSession, tenant_id: UUID) -> list[Section]:
    result = await db.execute(
        select(Section)
        .where(Section.tenant_id == tenant_id, Section.deleted_at.is_(None))
        .order_by(Section.display_order)
        .options(selectinload(Section.settings))
    )
    return list(result.scalars().all())


async def count_sample_settings(db: AsyncSession, tenant_id: UUID) -> int:
    """아직 템플릿 샘플 값 그대로인 설정 수 — 숨긴 · 지운 섹션은 세지 않는다.

    대시보드 할 일 안내용 (기획서 11.8). 관리자 `countSampleSettings` 와 같은 기준이며,
    대시보드가 섹션 전체 목록을 받지 않아도 되게 한다 (T-043-A).
    """
    result = await db.execute(
        select(func.count(SectionSetting.id))
        .join(Section, Section.id == SectionSetting.section_id)
        .where(
            Section.tenant_id == tenant_id,
            Section.deleted_at.is_(None),
            Section.is_active.is_(True),
            SectionSetting.is_sample.is_(True),
        )
    )
    return int(result.scalar_one())


async def get_section_by_id(
    db: AsyncSession, section_id: UUID, tenant_id: UUID
) -> Section | None:
    result = await db.execute(
        select(Section)
        .where(
            Section.id == section_id,
            Section.tenant_id == tenant_id,
            Section.deleted_at.is_(None),
        )
        .options(selectinload(Section.settings))
    )
    return result.scalar_one_or_none()


async def update_section_settings(
    db: AsyncSession,
    section_id: UUID,
    tenant_id: UUID,
    data: SectionUpdate,
) -> Section | None:
    section = await get_section_by_id(db, section_id, tenant_id)
    if not section:
        return None

    # label 수정
    if data.label is not None:
        await db.execute(
            update(Section)
            .where(Section.id == section_id, Section.tenant_id == tenant_id)
            .values(label=data.label, updated_at=datetime.now(UTC))
        )

    # settings upsert
    if data.settings:
        _validate_settings(data.settings)
        for s in data.settings:
            existing_result = await db.execute(
                select(SectionSetting).where(
                    SectionSetting.section_id == section_id,
                    SectionSetting.field_key == s.field_key,
                )
            )
            existing = existing_result.scalar_one_or_none()
            if existing:
                existing.field_value = s.field_value
                existing.value_type = s.value_type
                existing.is_sample = False
                existing.updated_at = datetime.now(UTC)
            else:
                db.add(
                    SectionSetting(
                        id=uuid.uuid4(),
                        tenant_id=tenant_id,
                        section_id=section_id,
                        field_key=s.field_key,
                        field_value=s.field_value,
                        value_type=s.value_type,
                        created_at=datetime.now(UTC),
                        updated_at=datetime.now(UTC),
                    )
                )

    await db.commit()
    db.expire_all()
    return await get_section_by_id(db, section_id, tenant_id)


# 모바일 설정 (T-037-D) — 휴대폰에서 숨기기
MOBILE_HIDDEN_FIELD = "mobile_hidden"
_TRUE = {"true", "1", "on", "yes"}
_FALSE = {"false", "0", "off", "no", ""}


def _normalize_bool(field: str, value: str | None) -> str:
    v = (value or "").strip().lower()
    if v in _TRUE:
        return "true"
    if v in _FALSE:
        return "false"
    raise ValueError(f"{field} 값은 true 또는 false 여야 합니다.")


def _validate_settings(settings: list[SectionSettingUpdate]) -> None:
    for s in settings:
        if s.field_key == MOBILE_HIDDEN_FIELD:
            s.field_value = _normalize_bool(s.field_key, s.field_value)
            s.value_type = "BOOLEAN"
            continue
        if s.field_key == GALLERY_FIELD:
            # 갤러리 목록 검사 · 정리 (T-064-A) — GallerySettingError 는 ValueError
            s.field_value = normalize_gallery_items(s.field_value)
            s.value_type = GALLERY_VALUE_TYPE
            continue
        if is_url_field(s.field_key):
            # 주소 칸 — javascript: 등 차단 (T-065-B)
            s.field_value = validate_link_url(s.field_key, s.field_value)
            continue
        if s.value_type == RICH_TEXT_VALUE_TYPE and s.field_value is not None:
            # 서식 글 (T-065-A) — 허용 태그만, 한도는 태그를 뺀 글자 수
            limit = MAIN_TITLE_MAX_LEN if s.field_key == "main_title" else None
            s.field_value = normalize_rich_text(s.field_key, s.field_value, limit)
            continue
        too_long = s.field_value and len(s.field_value) > MAIN_TITLE_MAX_LEN
        if s.field_key == "main_title" and too_long:
            raise ValueError(f"main_title은 {MAIN_TITLE_MAX_LEN}자 이하여야 합니다.")


async def update_sections_order(
    db: AsyncSession,
    order_items: list[SectionOrderItem],
    tenant_id: UUID,
) -> None:
    for item in order_items:
        await db.execute(
            update(Section)
            .where(
                Section.id == item.id,
                Section.tenant_id == tenant_id,
                Section.deleted_at.is_(None),
            )
            .values(display_order=item.display_order, updated_at=datetime.now(UTC))
        )
    await db.commit()


async def toggle_section(
    db: AsyncSession,
    section_id: UUID,
    is_active: bool,
    tenant_id: UUID,
) -> Section | None:
    result = await db.execute(
        update(Section)
        .where(
            Section.id == section_id,
            Section.tenant_id == tenant_id,
            Section.deleted_at.is_(None),
        )
        .values(is_active=is_active, updated_at=datetime.now(UTC))
        .returning(Section.id)
    )
    if not result.scalar_one_or_none():
        return None
    await db.commit()
    return await get_section_by_id(db, section_id, tenant_id)
