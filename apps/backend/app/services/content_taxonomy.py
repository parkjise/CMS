"""콘텐츠 카테고리 · 태그 (T-254, 콘텐츠 관리 기획서 CM-05).

- 카테고리는 유형별 2단계. 지우면 하위도 함께 휴지통, 그 항목은 고른 카테고리로
  옮기거나 카테고리 없음으로.
- 태그는 사업체 공통. 같은 이름(띄어쓰기 · 대소문자 무시)은 하나. 합치면 항목 연결을
  남는 태그로 옮기고 나머지 태그는 지운다.
- 항목 ↔ 태그 연결 표는 관계만 담으므로 연결을 끊을 때 행을 지운다.
"""

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import (
    ContentCategory,
    ContentItem,
    ContentItemTag,
    ContentTag,
)

MAX_CATEGORIES = 200

MSG_CATEGORY_NOT_FOUND = "카테고리를 찾을 수 없습니다."
MSG_CATEGORY_TAKEN = "같은 이름의 카테고리가 이미 있어요."
MSG_PARENT_DEPTH = "카테고리는 두 단계까지만 만들 수 있어요."
MSG_PARENT_SELF = "자기 자신 아래로 옮길 수 없어요."
MSG_HAS_CHILDREN = (
    "하위 카테고리가 있는 카테고리는 다른 카테고리 아래로 옮길 수 없어요."
)
MSG_MOVE_TARGET = "옮길 카테고리를 다시 골라 주세요."
MSG_TREE_MISMATCH = "카테고리 목록이 바뀌었습니다. 화면을 새로 고쳐 주세요."
MSG_TOO_MANY_CATEGORIES = f"카테고리는 유형당 {MAX_CATEGORIES}개까지 만들 수 있어요."
MSG_TAG_NOT_FOUND = "태그를 찾을 수 없습니다."
MSG_TAG_TAKEN = "같은 이름의 태그가 이미 있어요."
MSG_MERGE_SELF = "합칠 태그와 남길 태그가 같아요."


def _now() -> datetime:
    return datetime.now(UTC)


def same_name(name: str) -> str:
    """이름 비교 — 띄어쓰기 · 대소문자 무시."""
    return "".join(name.split()).lower()


def _invalid(message: str, field: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": "VALIDATION_ERROR", "message": message, "field": field},
    )


def _conflict(message: str, field: str = "name") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "CONFLICT", "message": message, "field": field},
    )


# ── 카테고리 ──────────────────────────────────────────────────────────────


async def _categories(
    db: AsyncSession, tenant_id: UUID, type_id: UUID
) -> list[ContentCategory]:
    result = await db.execute(
        select(ContentCategory)
        .where(
            ContentCategory.tenant_id == tenant_id,
            ContentCategory.type_id == type_id,
            ContentCategory.deleted_at.is_(None),
        )
        .order_by(ContentCategory.display_order, ContentCategory.created_at)
    )
    return list(result.scalars())


async def get_category(
    db: AsyncSession, tenant_id: UUID, category_id: UUID
) -> ContentCategory:
    row = (
        await db.execute(
            select(ContentCategory).where(
                ContentCategory.tenant_id == tenant_id,
                ContentCategory.id == category_id,
                ContentCategory.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=MSG_CATEGORY_NOT_FOUND
        )
    return row


async def ensure_category(
    db: AsyncSession, tenant_id: UUID, type_id: UUID, category_id: UUID | None
) -> None:
    """항목에 붙일 카테고리 — 같은 유형의 살아 있는 카테고리만."""
    if category_id is None:
        return
    row = (
        await db.execute(
            select(ContentCategory.id).where(
                ContentCategory.tenant_id == tenant_id,
                ContentCategory.id == category_id,
                ContentCategory.type_id == type_id,
                ContentCategory.deleted_at.is_(None),
            )
        )
    ).first()
    if row is None:
        raise _invalid(MSG_CATEGORY_NOT_FOUND, "category_id")


async def list_categories(db: AsyncSession, tenant_id: UUID, type_id: UUID) -> list:
    """2단계 트리 — 항목 수는 휴지통 항목을 빼고 그 카테고리에 직접 붙은 것."""
    rows = await _categories(db, tenant_id, type_id)
    counts: dict[UUID | None, int] = {
        row[0]: int(row[1])
        for row in (
            await db.execute(
                select(ContentItem.category_id, func.count())
                .where(
                    ContentItem.tenant_id == tenant_id,
                    ContentItem.type_id == type_id,
                    ContentItem.deleted_at.is_(None),
                    ContentItem.category_id.is_not(None),
                )
                .group_by(ContentItem.category_id)
            )
        ).all()
    }
    nodes: dict[UUID, dict[str, Any]] = {
        r.id: {
            "id": r.id,
            "name": r.name,
            "parent_id": r.parent_id,
            "display_order": r.display_order,
            "item_count": int(counts.get(r.id, 0)),
            "children": [],
        }
        for r in rows
    }
    tree: list[dict[str, Any]] = []
    for r in rows:
        node = nodes[r.id]
        parent = nodes.get(r.parent_id) if r.parent_id else None
        (parent["children"] if parent else tree).append(node)
    return tree


def _ensure_unique_name(
    rows: Iterable[ContentCategory], name: str, *, exclude: UUID | None = None
) -> None:
    wanted = same_name(name)
    if any(r.id != exclude and same_name(r.name) == wanted for r in rows):
        raise _conflict(MSG_CATEGORY_TAKEN)


def _check_parent(
    rows: list[ContentCategory], parent_id: UUID | None, moving: UUID | None
) -> None:
    if parent_id is None:
        return
    if parent_id == moving:
        raise _invalid(MSG_PARENT_SELF, "parent_id")
    parent = next((r for r in rows if r.id == parent_id), None)
    if parent is None:
        raise _invalid(MSG_CATEGORY_NOT_FOUND, "parent_id")
    if parent.parent_id is not None:
        raise _invalid(MSG_PARENT_DEPTH, "parent_id")
    if moving is not None and any(r.parent_id == moving for r in rows):
        raise _invalid(MSG_HAS_CHILDREN, "parent_id")


async def create_category(
    db: AsyncSession,
    tenant_id: UUID,
    type_id: UUID,
    name: str,
    parent_id: UUID | None,
) -> ContentCategory:
    rows = await _categories(db, tenant_id, type_id)
    if len(rows) >= MAX_CATEGORIES:
        raise _invalid(MSG_TOO_MANY_CATEGORIES, "name")
    _ensure_unique_name(rows, name)
    _check_parent(rows, parent_id, None)
    siblings = [r.display_order for r in rows if r.parent_id == parent_id]
    row = ContentCategory(
        tenant_id=tenant_id,
        type_id=type_id,
        parent_id=parent_id,
        name=name,
        display_order=max(siblings, default=-1) + 1,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def rename_category(
    db: AsyncSession, tenant_id: UUID, category_id: UUID, name: str
) -> ContentCategory:
    row = await get_category(db, tenant_id, category_id)
    _ensure_unique_name(
        await _categories(db, tenant_id, row.type_id), name, exclude=row.id
    )
    row.name = name
    await db.commit()
    await db.refresh(row)
    return row


async def save_tree(
    db: AsyncSession, tenant_id: UUID, type_id: UUID, nodes: list[dict]
) -> None:
    """끌어서 바꾼 트리 전체 — 모든 카테고리가 한 번씩, 하위는 맨 위 아래만."""
    rows = {r.id: r for r in await _categories(db, tenant_id, type_id)}
    ids = [n["id"] for n in nodes]
    if set(ids) != set(rows) or len(ids) != len(rows):
        raise _invalid(MSG_TREE_MISMATCH, "nodes")
    parents = {n["id"]: n.get("parent_id") for n in nodes}
    for node_id, parent_id in parents.items():
        if parent_id is None:
            continue
        if parent_id == node_id:
            raise _invalid(MSG_PARENT_SELF, "nodes")
        if parent_id not in parents or parents[parent_id] is not None:
            raise _invalid(MSG_PARENT_DEPTH, "nodes")
    order: dict[UUID | None, int] = {}
    for node_id in ids:
        parent_id = parents[node_id]
        rows[node_id].parent_id = parent_id
        rows[node_id].display_order = order.get(parent_id, 0)
        order[parent_id] = order.get(parent_id, 0) + 1
    await db.commit()


async def delete_category(
    db: AsyncSession, tenant_id: UUID, category_id: UUID, move_to: UUID | None
) -> int:
    """휴지통으로 (하위 포함) — 그 항목은 move_to 로, 없으면 카테고리 없음. 옮긴 수."""
    row = await get_category(db, tenant_id, category_id)
    rows = await _categories(db, tenant_id, row.type_id)
    removed = {row.id} | {r.id for r in rows if r.parent_id == row.id}
    if move_to is not None and (
        move_to in removed or move_to not in {r.id for r in rows}
    ):
        raise _invalid(MSG_MOVE_TARGET, "move_to")
    moved = await db.execute(
        update(ContentItem)
        .where(
            ContentItem.tenant_id == tenant_id,
            ContentItem.category_id.in_(removed),
        )
        .values(category_id=move_to)
    )
    now = _now()
    for r in rows:
        if r.id in removed:
            r.deleted_at = now
    await db.commit()
    return int(getattr(moved, "rowcount", 0) or 0)


# ── 태그 ──────────────────────────────────────────────────────────────────


async def _tags(db: AsyncSession, tenant_id: UUID) -> list[ContentTag]:
    result = await db.execute(
        select(ContentTag)
        .where(ContentTag.tenant_id == tenant_id, ContentTag.deleted_at.is_(None))
        .order_by(ContentTag.name)
    )
    return list(result.scalars())


async def get_tag(db: AsyncSession, tenant_id: UUID, tag_id: UUID) -> ContentTag:
    row = (
        await db.execute(
            select(ContentTag).where(
                ContentTag.tenant_id == tenant_id,
                ContentTag.id == tag_id,
                ContentTag.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=MSG_TAG_NOT_FOUND
        )
    return row


async def list_tags(db: AsyncSession, tenant_id: UUID) -> list[dict]:
    """태그와 쓰는 항목 수 (휴지통 항목 빼고)."""
    counts: dict[UUID | None, int] = {
        row[0]: int(row[1])
        for row in (
            await db.execute(
                select(ContentItemTag.tag_id, func.count())
                .join(ContentItem, ContentItem.id == ContentItemTag.item_id)
                .where(
                    ContentItemTag.tenant_id == tenant_id,
                    ContentItem.deleted_at.is_(None),
                )
                .group_by(ContentItemTag.tag_id)
            )
        ).all()
    }
    return [
        {"id": t.id, "name": t.name, "item_count": int(counts.get(t.id, 0))}
        for t in await _tags(db, tenant_id)
    ]


def _find(tags: list[ContentTag], name: str, *, exclude: UUID | None = None):
    wanted = same_name(name)
    # 아직 flush 하지 않은 새 태그는 id 가 없으므로 exclude 가 있을 때만 id 를 본다
    return next(
        (
            t
            for t in tags
            if (exclude is None or t.id != exclude) and same_name(t.name) == wanted
        ),
        None,
    )


async def create_tag(db: AsyncSession, tenant_id: UUID, name: str) -> ContentTag:
    if _find(await _tags(db, tenant_id), name):
        raise _conflict(MSG_TAG_TAKEN)
    row = ContentTag(tenant_id=tenant_id, name=name)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def rename_tag(
    db: AsyncSession, tenant_id: UUID, tag_id: UUID, name: str
) -> ContentTag:
    row = await get_tag(db, tenant_id, tag_id)
    if _find(await _tags(db, tenant_id), name, exclude=row.id):
        raise _conflict(MSG_TAG_TAKEN)
    row.name = name
    await db.commit()
    await db.refresh(row)
    return row


async def delete_tag(db: AsyncSession, tenant_id: UUID, tag_id: UUID) -> None:
    """태그는 휴지통으로, 항목 연결은 끊는다."""
    row = await get_tag(db, tenant_id, tag_id)
    await db.execute(delete(ContentItemTag).where(ContentItemTag.tag_id == row.id))
    row.deleted_at = _now()
    await db.commit()


async def merge_tags(
    db: AsyncSession, tenant_id: UUID, source_ids: list[UUID], target_id: UUID
) -> int:
    """source 태그들의 항목 연결을 target 으로 옮기고 source 는 지운다. 옮긴 연결 수."""
    if target_id in source_ids:
        raise _invalid(MSG_MERGE_SELF, "target_id")
    target = await get_tag(db, tenant_id, target_id)
    sources = [await get_tag(db, tenant_id, s) for s in dict.fromkeys(source_ids)]
    source_set = [s.id for s in sources]
    already = set(
        (
            await db.execute(
                select(ContentItemTag.item_id).where(ContentItemTag.tag_id == target.id)
            )
        ).scalars()
    )
    links = list(
        (
            await db.execute(
                select(ContentItemTag).where(ContentItemTag.tag_id.in_(source_set))
            )
        ).scalars()
    )
    moved = 0
    for link in links:
        if link.item_id in already:
            await db.delete(link)
        else:
            link.tag_id = target.id
            already.add(link.item_id)
            moved += 1
    now = _now()
    for source in sources:
        source.deleted_at = now
    await db.commit()
    return moved


async def resolve_tags(
    db: AsyncSession, tenant_id: UUID, names: list[str]
) -> list[ContentTag]:
    """태그 이름 → 태그 (없으면 만들고 같은 이름은 하나로). 커밋은 부른 쪽."""
    existing = await _tags(db, tenant_id)
    result: list[ContentTag] = []
    for name in names:
        tag = _find(existing + result, name)
        if tag is None:
            tag = ContentTag(tenant_id=tenant_id, name=name)
            db.add(tag)
            existing.append(tag)
        if tag not in result:
            result.append(tag)
    await db.flush()
    return result


async def set_item_tags(
    db: AsyncSession, tenant_id: UUID, item_id: UUID, tags: list[ContentTag]
) -> None:
    """항목 태그를 이 목록으로. 커밋은 부른 쪽."""
    await db.execute(delete(ContentItemTag).where(ContentItemTag.item_id == item_id))
    for tag in tags:
        db.add(ContentItemTag(tenant_id=tenant_id, item_id=item_id, tag_id=tag.id))
    await db.flush()


async def item_tags(
    db: AsyncSession, item_ids: list[UUID]
) -> dict[UUID, list[dict[str, Any]]]:
    """항목마다 [{id, name}] — 지운 태그는 빼고 이름순."""
    grouped: dict[UUID, list[dict[str, Any]]] = {i: [] for i in item_ids}
    if not item_ids:
        return grouped
    result = await db.execute(
        select(ContentItemTag.item_id, ContentTag.id, ContentTag.name)
        .join(ContentTag, ContentTag.id == ContentItemTag.tag_id)
        .where(ContentItemTag.item_id.in_(item_ids), ContentTag.deleted_at.is_(None))
        .order_by(ContentTag.name)
    )
    for item_id, tag_id, name in result.all():
        grouped[item_id].append({"id": tag_id, "name": name})
    return grouped
