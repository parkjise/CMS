"""공통 블록 (T-260, 콘텐츠 관리 기획서 CM-04).

- 섹션 하나의 값을 '공통 블록'으로 저장하고, 다른 페이지에서 그 블록으로 섹션을 더한다.
- 참조형: 섹션이 블록을 가리킨다(sections.block_id). 이어진 섹션 하나를 고치면 블록과
  다른 이어진 섹션 값이 함께 바뀐다 — 섹션 값을 그대로 복사해 두므로 홈페이지 · 인라인
  편집 · 미리보기는 바뀌지 않는다.
- 복사형: 값만 복사하고 이후 따로.
- 쓰는 섹션이 있는 블록은 지울 수 없다. 템플릿이 그릴 수 없는 종류는 더할 수 없다
  (섹션 추가 규칙 그대로).
"""

import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import ContentBlock
from app.models.section import Section, SectionSetting
from app.services import content_section, section_manage, site_cache

NAME_MAX = 40
MODE_REFERENCE = "reference"
MODE_COPY = "copy"

MSG_NOT_FOUND = "공통 블록을 찾을 수 없습니다."
MSG_SECTION_NOT_FOUND = "섹션을 찾을 수 없습니다."
MSG_IN_USE = "이 블록을 쓰는 섹션이 있어요. 섹션에서 연결을 먼저 끊어 주세요."
MSG_ALREADY_LINKED = "이미 공통 블록에 이어진 섹션이에요."
MSG_NOT_LINKED = "공통 블록에 이어진 섹션이 아니에요."


def _now() -> datetime:
    return datetime.now(UTC)


def _not_found(message: str = MSG_NOT_FOUND) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)


def _conflict(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "CONFLICT", "message": message},
    )


async def _get(db: AsyncSession, tenant_id: UUID, block_id: UUID) -> ContentBlock:
    row = (
        await db.execute(
            select(ContentBlock).where(
                ContentBlock.tenant_id == tenant_id,
                ContentBlock.id == block_id,
                ContentBlock.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise _not_found()
    return row


async def _section(db: AsyncSession, tenant_id: UUID, section_id: UUID) -> Section:
    row = (
        await db.execute(
            select(Section).where(
                Section.tenant_id == tenant_id,
                Section.id == section_id,
                Section.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise _not_found(MSG_SECTION_NOT_FOUND)
    return row


async def _settings_of(db: AsyncSession, section_id: UUID) -> list[dict[str, Any]]:
    result = await db.execute(
        select(SectionSetting)
        .where(SectionSetting.section_id == section_id)
        .order_by(SectionSetting.field_key)
    )
    return [
        {
            "field_key": s.field_key,
            "field_value": s.field_value,
            "value_type": s.value_type,
        }
        for s in result.scalars()
    ]


async def _write_settings(
    db: AsyncSession, tenant_id: UUID, section_id: UUID, values: list[dict[str, Any]]
) -> None:
    """섹션 칸 값을 이 목록으로 — 샘플 표시는 지운다. 커밋은 부른 쪽."""
    await db.execute(
        delete(SectionSetting).where(SectionSetting.section_id == section_id)
    )
    now = _now()
    for value in values:
        db.add(
            SectionSetting(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                section_id=section_id,
                field_key=value["field_key"],
                field_value=value["field_value"],
                value_type=value["value_type"],
                is_sample=False,
                created_at=now,
                updated_at=now,
            )
        )
    await db.flush()


async def _linked_sections(
    db: AsyncSession, tenant_id: UUID, block_ids: list[UUID]
) -> dict[UUID, list[Section]]:
    grouped: dict[UUID, list[Section]] = {b: [] for b in block_ids}
    if not block_ids:
        return grouped
    result = await db.execute(
        select(Section)
        .where(
            Section.tenant_id == tenant_id,
            Section.block_id.in_(block_ids),
            Section.deleted_at.is_(None),
        )
        .order_by(Section.page_key, Section.display_order)
    )
    for section in result.scalars():
        if section.block_id is not None:
            grouped[section.block_id].append(section)
    return grouped


def _usage(sections: list[Section]) -> list[dict]:
    return [
        {
            "section_id": s.id,
            "label": s.label,
            "page_key": s.page_key or "home",
            "is_active": s.is_active,
        }
        for s in sections
    ]


def _view(block: ContentBlock, sections: list[Section]) -> dict:
    return {
        "id": block.id,
        "name": block.name,
        "section_type": block.section_type,
        "type_label": section_manage.THEME_SECTION_TYPES.get(
            block.section_type, block.section_type
        ),
        "usage": _usage(sections),
        "updated_at": block.updated_at,
    }


async def list_blocks(db: AsyncSession, tenant_id: UUID) -> list[dict]:
    result = await db.execute(
        select(ContentBlock)
        .where(ContentBlock.tenant_id == tenant_id, ContentBlock.deleted_at.is_(None))
        .order_by(ContentBlock.created_at)
    )
    blocks = list(result.scalars())
    linked = await _linked_sections(db, tenant_id, [b.id for b in blocks])
    return [_view(b, linked[b.id]) for b in blocks]


async def get_block_view(db: AsyncSession, tenant_id: UUID, block_id: UUID) -> dict:
    block = await _get(db, tenant_id, block_id)
    return _view(block, (await _linked_sections(db, tenant_id, [block.id]))[block.id])


async def create_from_section(
    db: AsyncSession, tenant_id: UUID, section_id: UUID, name: str
) -> dict:
    """섹션 값으로 블록을 만들고 그 섹션을 참조형으로 잇는다."""
    section = await _section(db, tenant_id, section_id)
    if section.block_id is not None:
        raise _conflict(MSG_ALREADY_LINKED)
    block = ContentBlock(
        tenant_id=tenant_id,
        name=name,
        section_type=section.section_type,
        settings=await _settings_of(db, section.id),
    )
    db.add(block)
    await db.flush()
    section.block_id = block.id
    await db.commit()
    return await get_block_view(db, tenant_id, block.id)


async def rename_block(
    db: AsyncSession, tenant_id: UUID, block_id: UUID, name: str
) -> dict:
    block = await _get(db, tenant_id, block_id)
    block.name = name
    await db.commit()
    return await get_block_view(db, tenant_id, block.id)


async def delete_block(db: AsyncSession, tenant_id: UUID, block_id: UUID) -> None:
    block = await _get(db, tenant_id, block_id)
    if (await _linked_sections(db, tenant_id, [block.id]))[block.id]:
        raise _conflict(MSG_IN_USE)
    block.deleted_at = _now()
    await db.commit()


async def add_section(
    db: AsyncSession, tenant_id: UUID, block_id: UUID, page_key: str, mode: str
) -> UUID:
    """블록으로 섹션 더하기 — 한도 · 그릴 수 있는 종류는 섹션 추가와 같은 규칙.

    섹션 추가가 ValueError 계열(SectionLimitError · SectionTypeError)을 내면 부른 쪽이
    섹션 추가 API 와 같은 응답으로 바꾼다.
    """
    block = await _get(db, tenant_id, block_id)
    limits = await section_manage.get_limits(db, tenant_id, page_key)
    kind = next(
        (t for t in limits.addable_types if t["section_type"] == block.section_type),
        None,
    )
    section_id = await section_manage.add_section(
        db,
        tenant_id,
        block.section_type,
        block.name,
        page_key=page_key,
        variant=kind.get("variant") if kind else None,
    )
    await _write_settings(db, tenant_id, section_id, block.settings)
    if mode == MODE_REFERENCE:
        section = await _section(db, tenant_id, section_id)
        section.block_id = block.id
    await db.commit()
    await site_cache.purge_site(db, tenant_id)
    return section_id


async def unlink(db: AsyncSession, tenant_id: UUID, section_id: UUID) -> None:
    """연결 끊기 — 값은 그대로 두고 이후 이 섹션만 따로."""
    section = await _section(db, tenant_id, section_id)
    if section.block_id is None:
        raise _conflict(MSG_NOT_LINKED)
    section.block_id = None
    await db.commit()


async def sync_from_section(db: AsyncSession, tenant_id: UUID, section_id: UUID) -> int:
    """이어진 섹션을 고쳤다 — 블록 · 다른 이어진 섹션 값을 같게. 바꾼 섹션 수.

    섹션 저장 · 인라인 편집이 커밋한 뒤 부른다.
    """
    section = (
        await db.execute(
            select(Section).where(
                Section.tenant_id == tenant_id,
                Section.id == section_id,
                Section.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if section is None or section.block_id is None:
        return 0
    block = (
        await db.execute(
            select(ContentBlock).where(
                ContentBlock.id == section.block_id,
                ContentBlock.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if block is None:
        return 0
    values = await _settings_of(db, section.id)
    block.settings = values
    block.updated_at = _now()
    others = [
        s
        for s in (await _linked_sections(db, tenant_id, [block.id]))[block.id]
        if s.id != section.id
    ]
    for other in others:
        await _write_settings(db, tenant_id, other.id, values)
        other.updated_at = _now()
    await db.commit()
    if others:
        await content_section.purge(db, tenant_id)
    return len(others)
