"""테마형 템플릿 내용 맞추기 (T-055-A).

코드형 템플릿(하스피털 A)용 내용은 칸 이름이 달라 테마형 섹션이 읽지 못한다.
테마형으로 바꿀 때 홈에 '제대로 보일' 섹션이 없는 종류만 시작 문구 섹션으로 채운다.
기존 내용은 지우지 않는다 — 되돌리면 추가한 섹션만 정리 (template.rollback_template).
"""

import uuid
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.section import Section, SectionSetting
from app.models.template import Template
from app.services.section_manage import (
    HOME_PAGE,
    STARTER_SETTINGS,
    THEME_SECTION_TYPES,
    add_starter_section,
    next_home_order,
)

# 테마형 섹션이 읽는 칸 (apps/client components/sections · lib/themeSections.ts 와 같음)
THEME_FIELDS: dict[str, frozenset[str]] = {
    "HERO_BANNER": frozenset(
        {"main_title", "sub_copy", "bg_image_url", "cta_text", "cta_url"}
    ),
    "INTRO": frozenset({"intro_text", "intro_image_url"}),
    "SERVICES": frozenset({"section_title", "services_list"}),
    "GALLERY": frozenset({"section_title", "gallery_items"}),
    "CONTACT": frozenset(
        {"section_title", "description", "require_phone", "require_email"}
    ),
    "MAP": frozenset({"address", "address_detail", "latitude", "longitude"}),
}

# 값이 없어도 화면이 그려지는 섹션 — 문의 폼은 제목이 없으면 기본 제목으로 나온다
_RENDERS_WHEN_EMPTY = frozenset({"CONTACT"})


def _filled_keys(section: Section) -> set[str]:
    return {
        s.field_key
        for s in section.settings
        if s.field_value is not None and s.field_value.strip() not in ("", "[]")
    }


def shows_in_theme(section: Section) -> bool:
    """테마형 홈에 실제로 내용이 보이는 섹션인지."""
    fields = THEME_FIELDS.get(section.section_type)
    if fields is None or not section.is_active:
        return False
    if (section.page_key or HOME_PAGE) != HOME_PAGE:
        return False
    filled = _filled_keys(section)
    if filled & fields:
        return True
    return section.section_type in _RENDERS_WHEN_EMPTY and not filled


def _is_empty_slot(section: Section) -> bool:
    """홈의 그릴 수 있는 종류인데 값이 하나도 없는 섹션 — 새로 만들지 않고 채운다"""
    return (
        section.is_active
        and section.section_type in THEME_FIELDS
        and (section.page_key or HOME_PAGE) == HOME_PAGE
        and not _filled_keys(section)
    )


def _fill_starter(db: AsyncSession, section: Section) -> None:
    now = datetime.now(UTC)
    have = {s.field_key for s in section.settings}
    for key, value in STARTER_SETTINGS.get(section.section_type, {}).items():
        if key in have:
            # 빈 값으로 있던 칸
            row = next(s for s in section.settings if s.field_key == key)
            row.field_value = value
            row.is_sample = True
            row.updated_at = now
            continue
        db.add(
            SectionSetting(
                id=uuid.uuid4(),
                tenant_id=section.tenant_id,
                section_id=section.id,
                field_key=key,
                field_value=value,
                value_type="JSON" if value.startswith("[") else "STRING",
                is_sample=True,
                created_at=now,
                updated_at=now,
            )
        )


async def ensure_theme_sections(
    db: AsyncSession, tenant_id: UUID, template: Template
) -> tuple[list[UUID], int]:
    """템플릿 기본 섹션 중 그릴 수 있고 홈에 보일 섹션이 없는 종류를 채운다.

    - 그 종류의 빈 섹션(값 없음)이 있으면 새로 만들지 않고 시작 문구를 채운다
    - 없으면 시작 문구 섹션을 맨 아래에 추가한다
    - 팀 · FAQ 처럼 아직 그릴 수 없는 종류는 건너뛴다
    (추가한 섹션 id, 채운 빈 섹션 수) 를 돌려준다.
    """
    rows = await db.execute(
        select(Section)
        .where(Section.tenant_id == tenant_id, Section.deleted_at.is_(None))
        .order_by(Section.display_order)
        .options(selectinload(Section.settings))
    )
    sections = list(rows.scalars().all())
    present = {s.section_type for s in sections if shows_in_theme(s)}
    empty_slots: dict[str, Section] = {}
    for s in sections:
        if _is_empty_slot(s):
            empty_slots.setdefault(s.section_type, s)

    created: list[UUID] = []
    filled = 0
    order = await next_home_order(db, tenant_id)
    for section_type in template.section_layouts or []:
        if section_type not in THEME_FIELDS or section_type in present:
            continue
        slot = empty_slots.get(section_type)
        if slot is not None:
            _fill_starter(db, slot)
            filled += 1
        else:
            created.append(
                await add_starter_section(
                    db,
                    tenant_id,
                    section_type,
                    THEME_SECTION_TYPES[section_type],
                    order,
                )
            )
            order += 1
        present.add(section_type)
    await db.flush()
    return created, filled
