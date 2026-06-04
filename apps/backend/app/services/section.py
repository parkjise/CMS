import uuid
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.section import Section, SectionSetting
from app.schemas.section import SectionOrderItem, SectionSettingUpdate, SectionUpdate

# 템플릿 유형별 기본 섹션 정의
_DEFAULT_SECTIONS: dict[str, list[tuple[str, str]]] = {
    "HOSPITAL": [
        ("HERO_BANNER", "메인 배너"),
        ("INTRO", "병원 소개"),
        ("SERVICES", "진료 과목"),
        ("GALLERY", "시설 갤러리"),
        ("CONTACT", "오시는 길"),
        ("MAP", "지도"),
    ],
    "PENSION": [
        ("HERO_BANNER", "메인 배너"),
        ("INTRO", "펜션 소개"),
        ("GALLERY", "객실 갤러리"),
        ("RESERVATION", "예약 안내"),
        ("CONTACT", "오시는 길"),
        ("MAP", "지도"),
    ],
    "STARTUP": [
        ("HERO_BANNER", "메인 배너"),
        ("INTRO", "서비스 소개"),
        ("SERVICES", "핵심 기능"),
        ("PORTFOLIO", "포트폴리오"),
        ("TEAM", "팀 소개"),
        ("CONTACT", "문의하기"),
    ],
    "GENERAL": [
        ("HERO_BANNER", "메인 배너"),
        ("INTRO", "소개"),
        ("SERVICES", "서비스"),
        ("GALLERY", "갤러리"),
        ("CONTACT", "연락처"),
    ],
}

# main_title 필드 최대 길이
MAIN_TITLE_MAX_LEN = 40


async def get_sections(db: AsyncSession) -> list[Section]:
    result = await db.execute(
        select(Section)
        .where(Section.deleted_at.is_(None))
        .order_by(Section.display_order)
        .options(selectinload(Section.settings))
    )
    return list(result.scalars().all())


async def get_section_by_id(db: AsyncSession, section_id: UUID) -> Section | None:
    result = await db.execute(
        select(Section)
        .where(Section.id == section_id, Section.deleted_at.is_(None))
        .options(selectinload(Section.settings))
    )
    return result.scalar_one_or_none()


async def update_section_settings(
    db: AsyncSession,
    section_id: UUID,
    tenant_id: UUID,
    data: SectionUpdate,
) -> Section | None:
    section = await get_section_by_id(db, section_id)
    if not section:
        return None

    # label 수정
    if data.label is not None:
        await db.execute(
            update(Section)
            .where(Section.id == section_id)
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
    return await get_section_by_id(db, section_id)


def _validate_settings(settings: list[SectionSettingUpdate]) -> None:
    for s in settings:
        too_long = s.field_value and len(s.field_value) > MAIN_TITLE_MAX_LEN
        if s.field_key == "main_title" and too_long:
            raise ValueError(f"main_title은 {MAIN_TITLE_MAX_LEN}자 이하여야 합니다.")


async def update_sections_order(
    db: AsyncSession,
    order_items: list[SectionOrderItem],
) -> None:
    for item in order_items:
        await db.execute(
            update(Section)
            .where(Section.id == item.id, Section.deleted_at.is_(None))
            .values(display_order=item.display_order, updated_at=datetime.now(UTC))
        )
    await db.commit()


async def toggle_section(
    db: AsyncSession,
    section_id: UUID,
    is_active: bool,
) -> Section | None:
    result = await db.execute(
        update(Section)
        .where(Section.id == section_id, Section.deleted_at.is_(None))
        .values(is_active=is_active, updated_at=datetime.now(UTC))
        .returning(Section.id)
    )
    if not result.scalar_one_or_none():
        return None
    await db.commit()
    return await get_section_by_id(db, section_id)


async def create_default_sections(
    db: AsyncSession,
    tenant_id: UUID,
    template_type: str,
) -> list[Section]:
    defaults = _DEFAULT_SECTIONS.get(template_type, _DEFAULT_SECTIONS["GENERAL"])
    now = datetime.now(UTC)
    sections = []

    for order, (section_type, label) in enumerate(defaults):
        section = Section(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            section_type=section_type,
            label=label,
            display_order=order,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        db.add(section)
        sections.append(section)

    await db.commit()
    return sections
