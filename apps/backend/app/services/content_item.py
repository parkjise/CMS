"""콘텐츠 항목 (T-254, 콘텐츠 관리 기획서 CM-01 · 02).

- 초안(DRAFT)은 필수 칸이 비어도 저장한다. 공개(PUBLISHED)로 바꿀 때 필수 칸을 검사하고
  처음 공개한 시각을 남긴다. 초안으로 되돌려도 그 시각은 그대로 둔다.
- 칸 값(data)은 유형 칸 정의로 서버가 검사한다 — 게시판 칸과 같은 함수.
  빈 값은 저장하지 않는다(칸 종류를 바꿀 수 있는지를 키로 판단하므로).
- 휴지통 · 복구만 있고 실제 삭제는 없다. 유형이 휴지통이면 복구할 수 없다.
"""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import (
    STATUS_DRAFT,
    STATUS_PUBLISHED,
    ContentCategory,
    ContentItem,
    ContentItemTag,
    ContentType,
    ContentTypeField,
)
from app.models.user import User
from app.schemas.content import ContentItemCreate, ContentItemUpdate
from app.services import board_field, content_section
from app.services import content_taxonomy as taxonomy

COPY_SUFFIX = " (복사본)"

MSG_NOT_FOUND = "콘텐츠를 찾을 수 없습니다."
MSG_TYPE_NOT_FOUND = "콘텐츠 유형을 찾을 수 없습니다."
MSG_TYPE_TRASHED = "유형이 휴지통에 있어 되살릴 수 없어요. 유형을 먼저 되살려 주세요."
MSG_UNKNOWN_FIELD = "없는 칸입니다. 화면을 새로 고쳐 주세요."
MSG_REQUIRED = "필수 칸입니다."
MSG_ORDER_MISMATCH = "콘텐츠 목록이 바뀌었습니다. 화면을 새로 고쳐 주세요."


def _now() -> datetime:
    return datetime.now(UTC)


def _invalid(message: str, field: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": "VALIDATION_ERROR", "message": message, "field": field},
    )


def _not_found(message: str = MSG_NOT_FOUND) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)


# ── 유형 · 칸 ──────────────────────────────────────────────────────────────


async def _live_type(db: AsyncSession, tenant_id: UUID, type_id: UUID) -> ContentType:
    row = (
        await db.execute(
            select(ContentType).where(
                ContentType.tenant_id == tenant_id,
                ContentType.id == type_id,
                ContentType.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise _invalid(MSG_TYPE_NOT_FOUND, "type_id")
    return row


async def _fields(db: AsyncSession, type_id: UUID) -> list[ContentTypeField]:
    result = await db.execute(
        select(ContentTypeField)
        .where(
            ContentTypeField.type_id == type_id,
            ContentTypeField.deleted_at.is_(None),
        )
        .order_by(ContentTypeField.display_order)
    )
    return list(result.scalars())


def _merge_data(
    fields: list[ContentTypeField], stored: dict[str, Any], incoming: dict[str, Any]
) -> dict[str, Any]:
    """보낸 칸만 검사해 합친다 — 빈 값은 그 칸을 비운다. 지운 칸의 값은 남긴다."""
    by_key = {f.field_key: f for f in fields}
    merged = dict(stored)
    for key, value in incoming.items():
        field = by_key.get(key)
        if field is None:
            raise _invalid(MSG_UNKNOWN_FIELD, f"data.{key}")
        cleaned = None
        if not board_field.is_empty(value):
            try:
                cleaned = board_field.clean_value(
                    field.field_type, field.field_options, value
                )
            except ValueError as e:
                raise _invalid(str(e), f"data.{key}") from e
        if board_field.is_empty(cleaned):
            merged.pop(key, None)
        else:
            merged[key] = cleaned
    return merged


def _check_required(fields: list[ContentTypeField], data: dict[str, Any]) -> None:
    for field in fields:
        if field.is_required and field.field_key not in data:
            raise _invalid(MSG_REQUIRED, f"data.{field.field_key}")


def _missing_required(fields: list[ContentTypeField], data: dict[str, Any]) -> bool:
    return any(f.is_required and f.field_key not in data for f in fields)


def _clean_thumbnail(value: str | None) -> str | None:
    if board_field.is_empty(value):
        return None
    try:
        return str(board_field.clean_value("IMAGE", {}, value))
    except ValueError as e:
        raise _invalid(str(e), "thumbnail_url") from e


def _set_status(item: ContentItem, target: str) -> None:
    item.status = target
    if target == STATUS_PUBLISHED and item.published_at is None:
        item.published_at = _now()


# ── 읽기 ──────────────────────────────────────────────────────────────────


async def _get(
    db: AsyncSession, tenant_id: UUID, item_id: UUID, *, include_deleted: bool = False
) -> ContentItem:
    conditions = [ContentItem.tenant_id == tenant_id, ContentItem.id == item_id]
    if not include_deleted:
        conditions.append(ContentItem.deleted_at.is_(None))
    row = (
        await db.execute(select(ContentItem).where(*conditions))
    ).scalar_one_or_none()
    if row is None:
        raise _not_found()
    return row


async def get_item(db: AsyncSession, tenant_id: UUID, item_id: UUID) -> ContentItem:
    """휴지통 밖 항목 — 없으면 404 (사용 위치 API 가 쓴다)."""
    return await _get(db, tenant_id, item_id)


async def _views(db: AsyncSession, rows: list[ContentItem]) -> list[dict]:
    if not rows:
        return []
    type_ids = {r.type_id for r in rows}
    types = {
        t.id: t
        for t in (
            await db.execute(select(ContentType).where(ContentType.id.in_(type_ids)))
        ).scalars()
    }
    category_ids = {r.category_id for r in rows if r.category_id}
    categories: dict[UUID, str] = {}
    if category_ids:
        categories = {
            row[0]: row[1]
            for row in (
                await db.execute(
                    select(ContentCategory.id, ContentCategory.name).where(
                        ContentCategory.id.in_(category_ids),
                        ContentCategory.deleted_at.is_(None),
                    )
                )
            ).all()
        }
    tags = await taxonomy.item_tags(db, [r.id for r in rows])
    views = []
    for r in rows:
        content_type = types[r.type_id]
        views.append(
            {
                "id": r.id,
                "type": {
                    "id": content_type.id,
                    "type_key": content_type.type_key,
                    "name": content_type.name,
                },
                "category_id": r.category_id if r.category_id in categories else None,
                "category_name": categories.get(r.category_id)
                if r.category_id
                else None,
                "title": r.title,
                "summary": r.summary,
                "body": r.body or [],
                "data": r.data or {},
                "thumbnail_url": r.thumbnail_url,
                "status": r.status,
                "published_at": r.published_at,
                "display_order": r.display_order,
                "tags": tags[r.id],
                "created_at": r.created_at,
                "updated_at": r.updated_at,
                "deleted_at": r.deleted_at,
            }
        )
    return views


async def get_item_view(db: AsyncSession, tenant_id: UUID, item_id: UUID) -> dict:
    row = await _get(db, tenant_id, item_id, include_deleted=True)
    return (await _views(db, [row]))[0]


def _contains(column: Any, q: str) -> ColumnElement[bool]:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return column.ilike(f"%{escaped}%", escape="\\")


async def list_items(
    db: AsyncSession,
    tenant_id: UUID,
    *,
    page: int,
    size: int,
    type_id: UUID | None = None,
    status_filter: str | None = None,
    category_id: UUID | None = None,
    tag_id: UUID | None = None,
    q: str | None = None,
    trash: bool = False,
) -> dict:
    """목록 — 정해 둔 순서(유형 · 순서), 휴지통은 지운 순. 상태별 수는 필터 전 기준."""
    base: list[Any] = [ContentItem.tenant_id == tenant_id]
    if type_id is not None:
        base.append(ContentItem.type_id == type_id)
    counts_row = (
        await db.execute(
            select(
                func.count().filter(ContentItem.deleted_at.is_(None)),
                func.count().filter(
                    ContentItem.deleted_at.is_(None),
                    ContentItem.status == STATUS_PUBLISHED,
                ),
                func.count().filter(
                    ContentItem.deleted_at.is_(None),
                    ContentItem.status == STATUS_DRAFT,
                ),
                func.count().filter(ContentItem.deleted_at.is_not(None)),
            ).where(*base)
        )
    ).one()
    conditions = list(base)
    conditions.append(
        ContentItem.deleted_at.is_not(None)
        if trash
        else ContentItem.deleted_at.is_(None)
    )
    if status_filter:
        conditions.append(ContentItem.status == status_filter)
    if category_id is not None:
        # 맨 위 카테고리를 고르면 하위 카테고리 항목도
        children = select(ContentCategory.id).where(
            ContentCategory.parent_id == category_id
        )
        conditions.append(
            or_(
                ContentItem.category_id == category_id,
                ContentItem.category_id.in_(children),
            )
        )
    if tag_id is not None:
        conditions.append(
            ContentItem.id.in_(
                select(ContentItemTag.item_id).where(ContentItemTag.tag_id == tag_id)
            )
        )
    if q:
        conditions.append(
            or_(_contains(ContentItem.title, q), _contains(ContentItem.summary, q))
        )
    total = (
        await db.execute(
            select(func.count()).select_from(ContentItem).where(*conditions)
        )
    ).scalar_one()
    order = (
        [ContentItem.deleted_at.desc()]
        if trash
        else [ContentItem.type_id, ContentItem.display_order, ContentItem.created_at]
    )
    rows = list(
        (
            await db.execute(
                select(ContentItem)
                .where(*conditions)
                .order_by(*order)
                .offset((page - 1) * size)
                .limit(size)
            )
        ).scalars()
    )
    return {
        "items": await _views(db, rows),
        "total": int(total),
        "page": page,
        "size": size,
        "counts": {
            "all": int(counts_row[0]),
            "published": int(counts_row[1]),
            "draft": int(counts_row[2]),
            "trash": int(counts_row[3]),
        },
    }


# ── 쓰기 ──────────────────────────────────────────────────────────────────


async def _next_order(db: AsyncSession, type_id: UUID) -> int:
    current = (
        await db.execute(
            select(func.max(ContentItem.display_order)).where(
                ContentItem.type_id == type_id
            )
        )
    ).scalar()
    return 0 if current is None else current + 1


async def create_item(
    db: AsyncSession, user: User, tenant_id: UUID, body: ContentItemCreate
) -> dict:
    content_type = await _live_type(db, tenant_id, body.type_id)
    fields = await _fields(db, content_type.id)
    data = _merge_data(fields, {}, body.data)
    for field in fields:
        if field.field_key not in body.data and field.default_value is not None:
            data[field.field_key] = field.default_value
    if body.status == STATUS_PUBLISHED:
        _check_required(fields, data)
    await taxonomy.ensure_category(db, tenant_id, content_type.id, body.category_id)
    item = ContentItem(
        tenant_id=tenant_id,
        type_id=content_type.id,
        category_id=body.category_id,
        title=body.title,
        summary=body.summary.strip(),
        body=body.body,
        data=data,
        thumbnail_url=_clean_thumbnail(body.thumbnail_url),
        display_order=await _next_order(db, content_type.id),
        created_by=user.id,
        updated_by=user.id,
    )
    _set_status(item, body.status)
    db.add(item)
    await db.flush()
    tags = await taxonomy.resolve_tags(db, tenant_id, body.tags)
    await taxonomy.set_item_tags(db, tenant_id, item.id, tags)
    await db.commit()
    await content_section.purge(db, tenant_id)
    return await get_item_view(db, tenant_id, item.id)


async def update_item(
    db: AsyncSession,
    user: User,
    tenant_id: UUID,
    item_id: UUID,
    body: ContentItemUpdate,
) -> dict:
    """보낸 값만 — 공개 상태로 남거나 바뀌면 필수 칸을 검사한다."""
    item = await _get(db, tenant_id, item_id)
    sent = body.model_fields_set
    fields = await _fields(db, item.type_id)
    data = _merge_data(fields, item.data or {}, body.data or {})
    target = body.status or item.status
    if target == STATUS_PUBLISHED:
        _check_required(fields, data)
    if "category_id" in sent:
        await taxonomy.ensure_category(db, tenant_id, item.type_id, body.category_id)
        item.category_id = body.category_id
    if body.title is not None:
        item.title = body.title
    if body.summary is not None:
        item.summary = body.summary.strip()
    if body.body is not None:
        item.body = body.body
    if "thumbnail_url" in sent:
        item.thumbnail_url = _clean_thumbnail(body.thumbnail_url)
    item.data = data
    _set_status(item, target)
    item.updated_by = user.id
    if body.tags is not None:
        tags = await taxonomy.resolve_tags(db, tenant_id, body.tags)
        await taxonomy.set_item_tags(db, tenant_id, item.id, tags)
    await db.commit()
    await content_section.purge(db, tenant_id)
    return await get_item_view(db, tenant_id, item.id)


async def delete_item(db: AsyncSession, tenant_id: UUID, item_id: UUID) -> None:
    item = await _get(db, tenant_id, item_id)
    item.deleted_at = _now()
    await db.commit()
    await content_section.purge(db, tenant_id)


async def restore_item(db: AsyncSession, tenant_id: UUID, item_id: UUID) -> dict:
    item = await _get(db, tenant_id, item_id, include_deleted=True)
    if item.deleted_at is not None:
        content_type = await db.get(ContentType, item.type_id)
        if content_type is None or content_type.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "CONFLICT", "message": MSG_TYPE_TRASHED},
            )
        item.deleted_at = None
        await db.commit()
        await content_section.purge(db, tenant_id)
    await content_section.purge(db, tenant_id)
    return await get_item_view(db, tenant_id, item.id)


async def duplicate_item(
    db: AsyncSession, user: User, tenant_id: UUID, item_id: UUID
) -> dict:
    """같은 유형에 초안으로 — 제목 뒤에 '(복사본)', 태그 · 카테고리도 그대로."""
    source = await _get(db, tenant_id, item_id)
    await _live_type(db, tenant_id, source.type_id)
    title = source.title[: 100 - len(COPY_SUFFIX)] + COPY_SUFFIX
    copy = ContentItem(
        tenant_id=tenant_id,
        type_id=source.type_id,
        category_id=source.category_id,
        title=title,
        summary=source.summary,
        body=source.body,
        data=dict(source.data or {}),
        thumbnail_url=source.thumbnail_url,
        status=STATUS_DRAFT,
        display_order=await _next_order(db, source.type_id),
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(copy)
    await db.flush()
    tag_ids = (await taxonomy.item_tags(db, [source.id]))[source.id]
    for tag in tag_ids:
        db.add(ContentItemTag(tenant_id=tenant_id, item_id=copy.id, tag_id=tag["id"]))
    await db.commit()
    await content_section.purge(db, tenant_id)
    return await get_item_view(db, tenant_id, copy.id)


async def bulk_update(
    db: AsyncSession, user: User, tenant_id: UUID, ids: list[UUID], action: str
) -> dict:
    """여러 개 공개 · 초안 · 휴지통 · 복구 — 필수 칸이 빈 항목은 공개하지 않는다."""
    trash_view = action == "restore"
    rows = list(
        (
            await db.execute(
                select(ContentItem).where(
                    ContentItem.tenant_id == tenant_id,
                    ContentItem.id.in_(ids),
                    ContentItem.deleted_at.is_not(None)
                    if trash_view
                    else ContentItem.deleted_at.is_(None),
                )
            )
        ).scalars()
    )
    changed = 0
    skipped: list[UUID] = []
    fields_cache: dict[UUID, list[ContentTypeField]] = {}
    live_types: set[UUID] = set()
    if trash_view:
        live_types = set(
            (
                await db.execute(
                    select(ContentType.id).where(
                        ContentType.tenant_id == tenant_id,
                        ContentType.deleted_at.is_(None),
                    )
                )
            ).scalars()
        )
    now = _now()
    for item in rows:
        if action == "publish":
            if item.type_id not in fields_cache:
                fields_cache[item.type_id] = await _fields(db, item.type_id)
            if _missing_required(fields_cache[item.type_id], item.data or {}):
                skipped.append(item.id)
                continue
            _set_status(item, STATUS_PUBLISHED)
        elif action == "draft":
            _set_status(item, STATUS_DRAFT)
        elif action == "trash":
            item.deleted_at = now
        else:
            if item.type_id not in live_types:
                skipped.append(item.id)
                continue
            item.deleted_at = None
        item.updated_by = user.id
        changed += 1
    await db.commit()
    await content_section.purge(db, tenant_id)
    return {"changed": changed, "skipped": skipped}


async def reorder_items(
    db: AsyncSession, tenant_id: UUID, type_id: UUID, ids: list[UUID]
) -> None:
    """한 유형 안의 순서 — 휴지통 밖 항목 전부가 한 번씩."""
    result = await db.execute(
        select(ContentItem).where(
            ContentItem.tenant_id == tenant_id,
            ContentItem.type_id == type_id,
            ContentItem.deleted_at.is_(None),
        )
    )
    rows = {r.id: r for r in result.scalars()}
    if set(ids) != set(rows) or len(ids) != len(rows):
        raise _invalid(MSG_ORDER_MISMATCH, "ids")
    for order, item_id in enumerate(ids):
        rows[item_id].display_order = order
    await db.commit()
    await content_section.purge(db, tenant_id)
