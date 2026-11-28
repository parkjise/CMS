"""콘텐츠 연결 섹션 (T-258, 콘텐츠 관리 기획서 5장 '콘텐츠 연결 섹션').

- 테마형 템플릿 섹션 `CONTENT_LIST` — 고른 유형의 공개 콘텐츠를 카드 · 목록 · FAQ ·
  연혁 · 로고 줄로 보여 준다. 코드형 템플릿은 후속 (게시판 연결과 같음)
- 유형 · 카테고리 · 태그는 id 로 저장한다 — 이름 · 키를 바꿔도 연결이 끊기지 않는다
- 비운 유형은 허용 — 홈페이지는 섹션을 그리지 않는다
- 사용 위치: 유형을 보여 주는 섹션, 항목은 그 섹션의 카테고리 · 태그 조건에 맞을 때
- 저장 전 미리보기(T-261)는 초안도 함께 — 미리보기 토큰이 그 사업체 것일 때만
- 못 보여 주는 이유(스위치 꺼짐 · 유형 없음)를 구분해 돌려준다
  — 홈페이지가 관리자에게만 안내 (T-261)
"""

import re
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import (
    STATUS_DRAFT,
    STATUS_PUBLISHED,
    ContentCategory,
    ContentItem,
    ContentItemTag,
    ContentTag,
    ContentType,
    ContentTypeField,
)
from app.models.page import Page
from app.models.section import Section, SectionSetting
from app.models.tenant import Tenant
from app.schemas.section import SectionSettingUpdate
from app.services import board_field, site_cache
from app.services import feature as feature_service

CONTENT_LIST = "CONTENT_LIST"
FEATURE_KEY = "CONTENT_MANAGE"
TYPE_FIELD = "content_type"
CATEGORY_FIELD = "category_id"
TAG_FIELD = "tag_id"
SORT_FIELD = "sort"
COUNT_FIELD = "item_count"
DISPLAY_FIELD = "display_mode"
EMPTY_TEXT_FIELD = "empty_text"
TITLE_FIELD = "section_title"

# 공개 콘텐츠를 못 보여 주는 이유 (T-261) — 공개 API 의 에러 코드
UNAVAILABLE_FEATURE_OFF = "CONTENT_FEATURE_OFF"
UNAVAILABLE_TYPE_MISSING = "CONTENT_TYPE_MISSING"

COUNT_MIN = 3
COUNT_MAX = 24
DEFAULT_COUNT = 6
DISPLAY_MODES = frozenset({"CARD", "LIST", "FAQ", "TIMELINE", "LOGO"})
SORTS = frozenset({"order", "latest", "title"})
EMPTY_TEXT_MAX = 100

MSG_TYPE = "보여 줄 콘텐츠 유형을 찾을 수 없습니다. 유형을 다시 골라 주세요."
MSG_CATEGORY = "고른 유형의 카테고리가 아닙니다. 카테고리를 다시 골라 주세요."
MSG_TAG = "태그를 찾을 수 없습니다. 태그를 다시 골라 주세요."
MSG_COUNT = f"개수는 {COUNT_MIN}~{COUNT_MAX}개로 정해 주세요."
MSG_DISPLAY = "보여 주는 방식을 다시 골라 주세요."
MSG_SORT = "정렬을 다시 골라 주세요."
MSG_EMPTY_TEXT = f"빈 결과 문구는 {EMPTY_TEXT_MAX}자 이하로 적어 주세요."

HOME_PAGE = "home"
HOME_TITLE = "홈"
_TAG = re.compile(r"<[^>]+>")


def _uuid(value: str, message: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as e:
        raise ValueError(message) from e


async def _check_type(db: AsyncSession, tenant_id: UUID, value: str) -> str:
    type_id = _uuid(value, MSG_TYPE)
    found = (
        await db.execute(
            select(ContentType.id).where(
                ContentType.tenant_id == tenant_id,
                ContentType.id == type_id,
                ContentType.deleted_at.is_(None),
            )
        )
    ).first()
    if found is None:
        raise ValueError(MSG_TYPE)
    return str(type_id)


async def _check_category(db: AsyncSession, type_id: str, value: str) -> str:
    """카테고리는 고른 유형의 것만 — 유형이 비었으면 카테고리도 비운다."""
    if not type_id:
        return ""
    category_id = _uuid(value, MSG_CATEGORY)
    found = (
        await db.execute(
            select(ContentCategory.id).where(
                ContentCategory.id == category_id,
                ContentCategory.type_id == UUID(type_id),
                ContentCategory.deleted_at.is_(None),
            )
        )
    ).first()
    if found is None:
        raise ValueError(MSG_CATEGORY)
    return str(category_id)


async def _check_tag(db: AsyncSession, tenant_id: UUID, value: str) -> str:
    tag_id = _uuid(value, MSG_TAG)
    found = (
        await db.execute(
            select(ContentTag.id).where(
                ContentTag.tenant_id == tenant_id,
                ContentTag.id == tag_id,
                ContentTag.deleted_at.is_(None),
            )
        )
    ).first()
    if found is None:
        raise ValueError(MSG_TAG)
    return str(tag_id)


def _check_count(value: str) -> str:
    try:
        count = int(value)
    except ValueError as e:
        raise ValueError(MSG_COUNT) from e
    if not COUNT_MIN <= count <= COUNT_MAX:
        raise ValueError(MSG_COUNT)
    return str(count)


async def validate_settings(
    db: AsyncSession,
    tenant_id: UUID,
    settings: list[SectionSettingUpdate],
    *,
    current: dict[str, str | None] | None = None,
) -> None:
    """콘텐츠 연결 칸 검사 · 정리 — 잘못된 값은 ValueError (400).

    current — 저장된 값. 카테고리만 바꿀 때 어느 유형의 카테고리인지 알려고 쓴다.
    """
    by_key = {s.field_key: s for s in settings}
    type_id = (current or {}).get(TYPE_FIELD) or ""
    if (content_type := by_key.get(TYPE_FIELD)) is not None:
        value = (content_type.field_value or "").strip()
        content_type.field_value = (
            await _check_type(db, tenant_id, value) if value else ""
        )
        content_type.value_type = "STRING"
        type_id = content_type.field_value
    if (category := by_key.get(CATEGORY_FIELD)) is not None:
        value = (category.field_value or "").strip()
        category.field_value = (
            await _check_category(db, type_id, value) if value else ""
        )
        category.value_type = "STRING"
    if (tag := by_key.get(TAG_FIELD)) is not None:
        value = (tag.field_value or "").strip()
        tag.field_value = await _check_tag(db, tenant_id, value) if value else ""
        tag.value_type = "STRING"
    if (count := by_key.get(COUNT_FIELD)) is not None:
        value = (count.field_value or "").strip()
        count.field_value = _check_count(value) if value else ""
        count.value_type = "INTEGER"
    for key, allowed, message in (
        (DISPLAY_FIELD, DISPLAY_MODES, MSG_DISPLAY),
        (SORT_FIELD, SORTS, MSG_SORT),
    ):
        if (choice := by_key.get(key)) is not None:
            value = (choice.field_value or "").strip()
            if value and value not in allowed:
                raise ValueError(message)
            choice.field_value = value
            choice.value_type = "STRING"
    if (empty := by_key.get(EMPTY_TEXT_FIELD)) is not None:
        value = (empty.field_value or "").strip()
        if len(value) > EMPTY_TEXT_MAX:
            raise ValueError(MSG_EMPTY_TEXT)
        empty.field_value = value
        empty.value_type = "STRING"


# ── 사용 위치 ──────────────────────────────────────────────────────────────


async def _connected_sections(
    db: AsyncSession, tenant_id: UUID, type_id: UUID
) -> list[tuple[Section, dict[str, str]]]:
    """이 유형을 보여 주는 섹션과 그 칸 값 — 지운 섹션은 빼고 페이지 순서로."""
    result = await db.execute(
        select(Section)
        .join(SectionSetting, SectionSetting.section_id == Section.id)
        .where(
            Section.tenant_id == tenant_id,
            Section.deleted_at.is_(None),
            Section.section_type == CONTENT_LIST,
            SectionSetting.field_key == TYPE_FIELD,
            SectionSetting.field_value == str(type_id),
        )
        .order_by(Section.page_key, Section.display_order, Section.id)
    )
    sections = list(result.scalars().unique())
    if not sections:
        return []
    rows = await db.execute(
        select(
            SectionSetting.section_id,
            SectionSetting.field_key,
            SectionSetting.field_value,
        ).where(SectionSetting.section_id.in_([s.id for s in sections]))
    )
    values: dict[UUID, dict[str, str]] = {s.id: {} for s in sections}
    for section_id, key, value in rows.all():
        values[section_id][key] = value or ""
    return [(s, values[s.id]) for s in sections]


async def _describe(
    db: AsyncSession,
    tenant_id: UUID,
    sections: list[tuple[Section, dict[str, str]]],
) -> list[dict]:
    keys = {s.page_key or HOME_PAGE for s, _ in sections}
    titles = {HOME_PAGE: HOME_TITLE}
    if keys:
        rows = await db.execute(
            select(Page.page_key, Page.title).where(
                Page.tenant_id == tenant_id,
                Page.page_key.in_(keys),
                Page.deleted_at.is_(None),
            )
        )
        titles.update({key: title for key, title in rows.all()})
    return [
        {
            "section_id": s.id,
            "label": _TAG.sub("", values.get(TITLE_FIELD, "")).strip() or s.label,
            "page_key": s.page_key or HOME_PAGE,
            "page_title": titles.get(s.page_key or HOME_PAGE, s.page_key),
            "is_active": s.is_active,
        }
        for s, values in sections
    ]


async def type_usage(db: AsyncSession, tenant_id: UUID, type_id: UUID) -> list[dict]:
    return await _describe(
        db, tenant_id, await _connected_sections(db, tenant_id, type_id)
    )


async def item_usage(
    db: AsyncSession, tenant_id: UUID, item: ContentItem
) -> list[dict]:
    """이 항목이 걸리는 섹션 — 섹션의 카테고리(하위 포함) · 태그 조건에 맞을 때."""
    sections = await _connected_sections(db, tenant_id, item.type_id)
    if not sections:
        return []
    categories: set[str] = set()
    if item.category_id is not None:
        categories.add(str(item.category_id))
        parent = (
            await db.execute(
                select(ContentCategory.parent_id).where(
                    ContentCategory.id == item.category_id
                )
            )
        ).scalar()
        if parent is not None:
            categories.add(str(parent))
    tags = {
        str(t)
        for t in (
            await db.execute(
                select(ContentItemTag.tag_id).where(ContentItemTag.item_id == item.id)
            )
        ).scalars()
    }
    matched = [
        (s, values)
        for s, values in sections
        if (not values.get(CATEGORY_FIELD) or values[CATEGORY_FIELD] in categories)
        and (not values.get(TAG_FIELD) or values[TAG_FIELD] in tags)
    ]
    return await _describe(db, tenant_id, matched)


# ── 공개 ──────────────────────────────────────────────────────────────────


async def purge(db: AsyncSession, tenant_id: UUID) -> None:
    """공개 콘텐츠가 바뀌었다 — 홈페이지 캐시를 비운다 (best-effort)."""
    await site_cache.purge_site(db, tenant_id)


def _public_fields(
    fields: list[ContentTypeField], data: dict[str, Any]
) -> list[dict[str, Any]]:
    """값이 있는 칸만 칸 순서대로 — 게시판 공개 칸과 같은 모양, 선택지는 이름."""
    result = []
    for field in fields:
        if field.field_key not in data:
            continue
        value = board_field.public_value(field, data[field.field_key])  # type: ignore[arg-type]
        if board_field.is_empty(value):
            continue
        result.append(
            {
                "key": field.field_key,
                "label": field.label,
                "field_type": field.field_type,
                "value": value,
            }
        )
    return result


async def public_items(
    db: AsyncSession,
    tenant: Tenant,
    type_id: UUID,
    *,
    limit: int,
    sort: str,
    category_id: UUID | None,
    tag_id: UUID | None,
    with_body: bool,
    include_drafts: bool = False,
) -> list[dict] | str:
    """공개 콘텐츠 — 못 보여 주면 이유(`UNAVAILABLE_*`).

    include_drafts: 저장 전 미리보기 — 초안도 함께, 항목마다 `is_draft`.
    """
    if not await feature_service.is_enabled(db, tenant.id, FEATURE_KEY):
        return UNAVAILABLE_FEATURE_OFF
    content_type = (
        await db.execute(
            select(ContentType).where(
                ContentType.tenant_id == tenant.id,
                ContentType.id == type_id,
                ContentType.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if content_type is None:
        return UNAVAILABLE_TYPE_MISSING
    statuses = [STATUS_PUBLISHED]
    if include_drafts:
        statuses.append(STATUS_DRAFT)
    conditions: list[Any] = [
        ContentItem.tenant_id == tenant.id,
        ContentItem.type_id == type_id,
        ContentItem.deleted_at.is_(None),
        ContentItem.status.in_(statuses),
    ]
    if category_id is not None:
        children = select(ContentCategory.id).where(
            ContentCategory.parent_id == category_id,
            ContentCategory.deleted_at.is_(None),
        )
        conditions.append(
            (ContentItem.category_id == category_id)
            | ContentItem.category_id.in_(children)
        )
    if tag_id is not None:
        conditions.append(
            ContentItem.id.in_(
                select(ContentItemTag.item_id).where(ContentItemTag.tag_id == tag_id)
            )
        )
    orders: dict[str, list[Any]] = {
        # 초안(공개 시각 없음)은 만든 시각으로 — 미리보기에서만 섞인다
        "latest": [
            func.coalesce(ContentItem.published_at, ContentItem.created_at).desc(),
            ContentItem.created_at.desc(),
        ],
        "title": [ContentItem.title, ContentItem.created_at],
    }
    order = orders.get(sort, [ContentItem.display_order, ContentItem.created_at])
    items = list(
        (
            await db.execute(
                select(ContentItem).where(*conditions).order_by(*order).limit(limit)
            )
        ).scalars()
    )
    fields = list(
        (
            await db.execute(
                select(ContentTypeField)
                .where(
                    ContentTypeField.type_id == type_id,
                    ContentTypeField.deleted_at.is_(None),
                )
                .order_by(ContentTypeField.display_order)
            )
        ).scalars()
    )
    return [
        {
            "id": item.id,
            "title": item.title,
            "summary": item.summary,
            "thumbnail": item.thumbnail_url,
            "body": (item.body or []) if with_body else None,
            "fields": _public_fields(fields, item.data or {}),
            "published_at": item.published_at,
            "is_draft": item.status == STATUS_DRAFT,
        }
        for item in items
    ]
