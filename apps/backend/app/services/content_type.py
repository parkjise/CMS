"""콘텐츠 유형 · 칸 (T-253, 콘텐츠 관리 기획서 CM-03).

- CONTENT_MANAGE 스위치 · 요금제 한도(유형 수) 안에서만 만들고 복구한다.
- 유형 키는 휴지통을 포함해 사업체 안에서 하나 — 공개 API 주소에 쓴다.
- 칸 종류 · 선택지 · 기본값 검사는 게시판 칸(board_field)과 같은 함수를 쓴다.
- 칸은 화면이 목록 전체를 보내 한 번에 저장한다. 빠진 칸은 휴지통(값은 항목에 남음).
- 항목 칸 값은 비어 있으면 저장하지 않으므로 값이 있는지는 키가 있는지로 본다.
"""

import re
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.models.content import (
    STATUS_PUBLISHED,
    ContentItem,
    ContentType,
    ContentTypeField,
)
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.content import (
    ContentFieldInput,
    ContentTypeCreate,
    ContentTypeUpdate,
)
from app.services import board_field
from app.services import feature as feature_service
from app.services.content_presets import CONTENT_PRESETS, preset_options

FEATURE_KEY = "CONTENT_MANAGE"
TARGET_TYPE = "content_type"

# 유형 수 — None 은 제한 없음. FREE · BASIC 은 섹션을 더할 수 없어 보여 줄 곳이 없다
# (기획서 1장 결정 4, 직접 만든 페이지와 같은 모양)
CONTENT_TYPE_LIMITS: dict[str, int | None] = {
    "FREE": 0,
    "BASIC": 0,
    "STANDARD": 10,
    "PREMIUM": None,
}

KEY_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
KEY_MIN_LENGTH = 2
KEY_MAX_LENGTH = 40
MAX_FIELDS = 20

# 항목의 기본 칸 · 시스템 값과 헷갈리는 이름
RESERVED_FIELD_KEYS = frozenset(
    {
        "id",
        "title",
        "summary",
        "body",
        "data",
        "thumbnail_url",
        "category",
        "category_id",
        "tags",
        "status",
        "published_at",
        "display_order",
        "type_id",
        "tenant_id",
        "created_at",
        "updated_at",
        "deleted_at",
        "created_by",
        "updated_by",
    }
)

MSG_NOT_FOUND = "콘텐츠 유형을 찾을 수 없습니다."
MSG_PLAN_BLOCKED = "콘텐츠 관리는 STANDARD 요금제부터 쓸 수 있습니다."
MSG_KEY_FORMAT = (
    f"영문 소문자 · 숫자 · 하이픈으로 {KEY_MIN_LENGTH}~{KEY_MAX_LENGTH}자"
    " 입력해 주세요."
)
MSG_KEY_TAKEN = "이미 다른 유형이 쓰는 키예요. 다른 키를 입력해 주세요."
MSG_KEY_TRASH = "휴지통에 있는 유형이 쓰는 키예요."
MSG_NAME_REQUIRED = "유형 이름을 입력해 주세요."
MSG_UNKNOWN_PRESET = "없는 시작용 유형입니다."
MSG_HAS_ITEMS = "콘텐츠가 남아 있는 유형은 지울 수 없어요. 콘텐츠를 먼저 지워 주세요."
MSG_ORDER_MISMATCH = "유형 목록이 바뀌었습니다. 화면을 새로 고쳐 주세요."
MSG_TOO_MANY_FIELDS = f"칸은 유형당 {MAX_FIELDS}개까지 만들 수 있습니다."
MSG_UNKNOWN_FIELD = "없는 칸입니다. 화면을 새로 고쳐 주세요."
MSG_FIELD_KEY_FIXED = "만든 칸의 키는 바꿀 수 없습니다."
MSG_FIELD_KEY_DUPLICATE = "같은 칸 키가 두 번 들어 있습니다."
MSG_FIELD_KEY_TAKEN = "이미 쓴 적 있는 칸 키입니다. 다른 키를 입력해 주세요."
MSG_FIELD_KEY_RESERVED = "기본 칸이 쓰는 이름이라 쓸 수 없습니다."
MSG_TYPE_IN_USE = "이 칸에 값이 있는 콘텐츠가 있어 종류를 바꿀 수 없습니다."
MSG_OPTION_IN_USE = "이 선택지를 고른 콘텐츠가 있어 뺄 수 없습니다."


def _now() -> datetime:
    return datetime.now(UTC)


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=MSG_NOT_FOUND)


def _invalid(message: str, field: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": "VALIDATION_ERROR", "message": message, "field": field},
    )


def _conflict(message: str, field: str | None = None) -> HTTPException:
    detail: dict[str, Any] = {"code": "CONFLICT", "message": message}
    if field:
        detail["field"] = field
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


# ── 한도 · 키 ──────────────────────────────────────────────────────────────


async def get_limits(db: AsyncSession, tenant_id: UUID) -> dict:
    """휴지통 유형은 세지 않는다. 모르는 요금제는 만들 수 없다."""
    plan = (
        await db.execute(select(Tenant.plan_type).where(Tenant.id == tenant_id))
    ).scalar_one_or_none() or ""
    limit = CONTENT_TYPE_LIMITS.get(plan.upper(), 0)
    used = (
        await db.execute(
            select(func.count())
            .select_from(ContentType)
            .where(ContentType.tenant_id == tenant_id, ContentType.deleted_at.is_(None))
        )
    ).scalar_one()
    can_create = limit is None or used < limit
    reason = None
    if not can_create:
        reason = (
            MSG_PLAN_BLOCKED
            if limit == 0
            else f"현재 요금제는 콘텐츠 유형을 {limit}개까지 만들 수 있습니다."
        )
    return {
        "plan": plan,
        "limit": limit,
        "used": used,
        "can_create": can_create,
        "reason": reason,
    }


async def _ensure_can_create(db: AsyncSession, tenant_id: UUID) -> None:
    """만들 · 복구할 때만 — 요금제를 내려도 있던 유형은 그대로 쓴다."""
    limits = await get_limits(db, tenant_id)
    if not limits["can_create"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "PLAN_LIMIT_EXCEEDED", "message": limits["reason"]},
        )


def key_format_ok(key: str) -> bool:
    return (
        KEY_MIN_LENGTH <= len(key) <= KEY_MAX_LENGTH
        and KEY_PATTERN.match(key) is not None
    )


async def _ensure_key(
    db: AsyncSession, tenant_id: UUID, key: str, *, exclude: UUID | None = None
) -> None:
    if not key_format_ok(key):
        raise _invalid(MSG_KEY_FORMAT, "type_key")
    conditions = [ContentType.tenant_id == tenant_id, ContentType.type_key == key]
    if exclude is not None:
        conditions.append(ContentType.id != exclude)
    row = (await db.execute(select(ContentType).where(*conditions).limit(1))).scalar()
    if row is not None:
        trashed = row.deleted_at is not None
        raise _conflict(MSG_KEY_TRASH if trashed else MSG_KEY_TAKEN, "type_key")


# ── 읽기 ──────────────────────────────────────────────────────────────────


async def _get(
    db: AsyncSession, tenant_id: UUID, type_id: UUID, *, include_deleted: bool = False
) -> ContentType:
    conditions = [ContentType.tenant_id == tenant_id, ContentType.id == type_id]
    if not include_deleted:
        conditions.append(ContentType.deleted_at.is_(None))
    row = (
        await db.execute(select(ContentType).where(*conditions))
    ).scalar_one_or_none()
    if row is None:
        raise _not_found()
    return row


async def _live_fields(
    db: AsyncSession, tenant_id: UUID, type_ids: list[UUID]
) -> dict[UUID, list[ContentTypeField]]:
    if not type_ids:
        return {}
    result = await db.execute(
        select(ContentTypeField)
        .where(
            ContentTypeField.tenant_id == tenant_id,
            ContentTypeField.type_id.in_(type_ids),
            ContentTypeField.deleted_at.is_(None),
        )
        .order_by(ContentTypeField.display_order, ContentTypeField.created_at)
    )
    grouped: dict[UUID, list[ContentTypeField]] = {t: [] for t in type_ids}
    for field in result.scalars():
        grouped[field.type_id].append(field)
    return grouped


async def _item_counts(
    db: AsyncSession, tenant_id: UUID
) -> dict[UUID, tuple[int, int]]:
    """유형마다 (전체, 공개) 항목 수 — 휴지통 항목은 빼고."""
    result = await db.execute(
        select(
            ContentItem.type_id,
            func.count(),
            func.count().filter(ContentItem.status == STATUS_PUBLISHED),
        )
        .where(ContentItem.tenant_id == tenant_id, ContentItem.deleted_at.is_(None))
        .group_by(ContentItem.type_id)
    )
    return {row[0]: (int(row[1]), int(row[2])) for row in result.all()}


def _view(
    row: ContentType,
    fields: list[ContentTypeField],
    counts: dict[UUID, tuple[int, int]],
) -> dict:
    total, published = counts.get(row.id, (0, 0))
    return {
        "id": row.id,
        "type_key": row.type_key,
        "name": row.name,
        "description": row.description,
        "preset_key": row.preset_key,
        "display_order": row.display_order,
        "fields": fields,
        "item_count": total,
        "published_count": published,
        "updated_at": row.updated_at,
        "deleted_at": row.deleted_at,
    }


async def _views(db: AsyncSession, tenant_id: UUID, rows: list[ContentType]) -> list:
    fields = await _live_fields(db, tenant_id, [r.id for r in rows])
    counts = await _item_counts(db, tenant_id)
    return [_view(r, fields[r.id], counts) for r in rows]


async def list_types(db: AsyncSession, tenant_id: UUID) -> dict:
    """유형 목록 · 휴지통 · 한도 · 스위치 · 시작용 유형."""
    result = await db.execute(
        select(ContentType)
        .where(ContentType.tenant_id == tenant_id)
        .order_by(ContentType.display_order, ContentType.created_at)
    )
    rows = list(result.scalars())
    views = await _views(db, tenant_id, rows)
    return {
        "enabled": await feature_service.is_enabled(db, tenant_id, FEATURE_KEY),
        "types": [v for v in views if v["deleted_at"] is None],
        "trash": [v for v in views if v["deleted_at"] is not None],
        "limits": await get_limits(db, tenant_id),
        "presets": preset_options(),
    }


async def get_type_view(db: AsyncSession, tenant_id: UUID, type_id: UUID) -> dict:
    row = await _get(db, tenant_id, type_id, include_deleted=True)
    return (await _views(db, tenant_id, [row]))[0]


# ── 감사 로그 ─────────────────────────────────────────────────────────────


def _audit_value(row: ContentType, fields: list[ContentTypeField]) -> dict:
    return {
        "name": row.name,
        "type_key": row.type_key,
        "fields": [
            {"key": f.field_key, "label": f.label, "type": f.field_type} for f in fields
        ],
    }


async def _audit(
    db: AsyncSession,
    user: User,
    action: str,
    row: ContentType,
    *,
    before: dict | None = None,
) -> None:
    fields = (await _live_fields(db, row.tenant_id, [row.id]))[row.id]
    await log_action(
        db,
        user,
        action,
        TARGET_TYPE,
        row.id,
        before=before,
        after=_audit_value(row, fields),
        tenant_id=row.tenant_id,
    )


# ── 만들기 · 고치기 · 지우기 ──────────────────────────────────────────────


async def _next_order(db: AsyncSession, tenant_id: UUID) -> int:
    current = (
        await db.execute(
            select(func.max(ContentType.display_order)).where(
                ContentType.tenant_id == tenant_id
            )
        )
    ).scalar()
    return 0 if current is None else current + 1


async def create_type(
    db: AsyncSession, user: User, tenant_id: UUID, body: ContentTypeCreate
) -> dict:
    """빈 유형 또는 시작용 유형 — 한도 초과 422, 키 충돌 409."""
    preset = None
    if body.preset_key is not None:
        preset = CONTENT_PRESETS.get(body.preset_key)
        if preset is None:
            raise _invalid(MSG_UNKNOWN_PRESET, "preset_key")
    name = body.name or (preset["name"] if preset else "")
    if not name:
        raise _invalid(MSG_NAME_REQUIRED, "name")
    key = body.type_key or (body.preset_key if preset else "") or ""
    await _ensure_can_create(db, tenant_id)
    await _ensure_key(db, tenant_id, key)
    description = body.description or (preset["description"] if preset else "")
    row = ContentType(
        tenant_id=tenant_id,
        type_key=key,
        name=name,
        description=description,
        preset_key=body.preset_key if preset else None,
        display_order=await _next_order(db, tenant_id),
    )
    db.add(row)
    await db.flush()
    if preset:
        inputs = [ContentFieldInput.model_validate(f) for f in preset["fields"]]
        await _apply_fields(db, row, inputs)
    await db.commit()
    await db.refresh(row)
    await _audit(db, user, "CONTENT_TYPE_CREATED", row)
    return await get_type_view(db, tenant_id, row.id)


async def update_type(
    db: AsyncSession,
    user: User,
    tenant_id: UUID,
    type_id: UUID,
    body: ContentTypeUpdate,
) -> dict:
    row = await _get(db, tenant_id, type_id)
    fields = (await _live_fields(db, tenant_id, [row.id]))[row.id]
    before = _audit_value(row, fields)
    sent = body.model_fields_set
    if "name" in sent:
        if not body.name:
            raise _invalid(MSG_NAME_REQUIRED, "name")
        row.name = body.name
    if "type_key" in sent and body.type_key != row.type_key:
        await _ensure_key(db, tenant_id, body.type_key or "", exclude=row.id)
        row.type_key = body.type_key or ""
    if "description" in sent and body.description is not None:
        row.description = body.description
    await db.commit()
    await db.refresh(row)
    await _audit(db, user, "CONTENT_TYPE_UPDATED", row, before=before)
    return await get_type_view(db, tenant_id, row.id)


async def delete_type(
    db: AsyncSession, user: User, tenant_id: UUID, type_id: UUID
) -> None:
    """휴지통으로 — 휴지통 밖 항목이 남아 있으면 막는다."""
    row = await _get(db, tenant_id, type_id)
    total, _ = (await _item_counts(db, tenant_id)).get(row.id, (0, 0))
    if total:
        raise _conflict(MSG_HAS_ITEMS)
    row.deleted_at = _now()
    await db.commit()
    await db.refresh(row)
    await _audit(db, user, "CONTENT_TYPE_DELETED", row)


async def restore_type(
    db: AsyncSession, user: User, tenant_id: UUID, type_id: UUID
) -> dict:
    row = await _get(db, tenant_id, type_id, include_deleted=True)
    if row.deleted_at is None:
        return await get_type_view(db, tenant_id, row.id)
    await _ensure_can_create(db, tenant_id)
    row.deleted_at = None
    row.display_order = await _next_order(db, tenant_id)
    await db.commit()
    await db.refresh(row)
    await _audit(db, user, "CONTENT_TYPE_RESTORED", row)
    return await get_type_view(db, tenant_id, row.id)


async def reorder_types(db: AsyncSession, tenant_id: UUID, ids: list[UUID]) -> None:
    result = await db.execute(
        select(ContentType).where(
            ContentType.tenant_id == tenant_id, ContentType.deleted_at.is_(None)
        )
    )
    rows = {r.id: r for r in result.scalars()}
    if set(ids) != set(rows) or len(ids) != len(rows):
        raise _invalid(MSG_ORDER_MISMATCH, "ids")
    for order, type_id in enumerate(ids):
        rows[type_id].display_order = order
    await db.commit()


# ── 칸 ────────────────────────────────────────────────────────────────────


async def _has_values(db: AsyncSession, type_id: UUID, key: str) -> bool:
    """이 칸에 값이 있는 항목 — 휴지통 항목도 센다 (복구할 수 있으므로)."""
    result = await db.execute(
        select(ContentItem.id)
        .where(ContentItem.type_id == type_id, ContentItem.data.has_key(key))
        .limit(1)
    )
    return result.first() is not None


async def _option_in_use(db: AsyncSession, field: ContentTypeField, value: str) -> bool:
    needle: Any = [value] if field.field_type == "MULTI_SELECT" else value
    result = await db.execute(
        select(ContentItem.id)
        .where(
            ContentItem.type_id == field.type_id,
            ContentItem.data.contains({field.field_key: needle}),
        )
        .limit(1)
    )
    return result.first() is not None


def _choice_values(options: dict[str, Any]) -> set[str]:
    return {c["value"] for c in options.get("choices", [])}


def _next_auto_key(used: set[str]) -> str:
    number = 1
    while f"field_{number}" in used:
        number += 1
    return f"field_{number}"


async def _check_existing(
    db: AsyncSession, field: ContentTypeField, data: ContentFieldInput, index: int
) -> None:
    if data.field_key is not None and data.field_key != field.field_key:
        raise _invalid(MSG_FIELD_KEY_FIXED, f"fields.{index}.field_key")
    if data.field_type != field.field_type:
        if await _has_values(db, field.type_id, field.field_key):
            raise _conflict(MSG_TYPE_IN_USE, f"fields.{index}.field_type")
        return
    if data.field_type in board_field.CHOICE_TYPES:
        kept = _choice_values({"choices": [o.model_dump() for o in data.options or []]})
        for value in _choice_values(field.field_options) - kept:
            if await _option_in_use(db, field, value):
                raise _conflict(MSG_OPTION_IN_USE, f"fields.{index}.options")


async def _apply_fields(
    db: AsyncSession, row: ContentType, inputs: list[ContentFieldInput]
) -> None:
    """칸 전체를 이 목록으로 — 순서는 목록 순서, 빠진 칸은 휴지통. 커밋은 부른 쪽."""
    if len(inputs) > MAX_FIELDS:
        raise _invalid(MSG_TOO_MANY_FIELDS, "fields")
    result = await db.execute(
        select(ContentTypeField).where(ContentTypeField.type_id == row.id)
    )
    every = list(result.scalars())
    live = {f.id: f for f in every if f.deleted_at is None}
    used_keys = {f.field_key for f in every}
    seen_keys: set[str] = set()
    kept: set[UUID] = set()
    for index, data in enumerate(inputs):
        prefix = f"fields.{index}"
        if data.id is not None:
            field = live.get(data.id)
            if field is None:
                raise _invalid(MSG_UNKNOWN_FIELD, f"{prefix}.id")
            await _check_existing(db, field, data, index)
            kept.add(field.id)
        else:
            key = data.field_key or _next_auto_key(used_keys | seen_keys)
            if key in RESERVED_FIELD_KEYS:
                raise _invalid(MSG_FIELD_KEY_RESERVED, f"{prefix}.field_key")
            if key in used_keys:
                raise _conflict(MSG_FIELD_KEY_TAKEN, f"{prefix}.field_key")
            field = ContentTypeField(
                tenant_id=row.tenant_id, type_id=row.id, field_key=key
            )
            db.add(field)
        if field.field_key in seen_keys:
            raise _invalid(MSG_FIELD_KEY_DUPLICATE, f"{prefix}.field_key")
        seen_keys.add(field.field_key)
        try:
            options = board_field.build_options(
                data.field_type, data.options, data.min, data.max
            )
            default = board_field.clean_default(
                data.field_type, options, data.default_value
            )
        except HTTPException as e:
            detail = e.detail if isinstance(e.detail, dict) else {"message": e.detail}
            raise _invalid(
                str(detail.get("message")), f"{prefix}.{detail.get('field', 'options')}"
            ) from e
        field.label = data.label
        field.field_type = data.field_type
        field.is_required = data.is_required
        field.help_text = data.help_text
        field.placeholder = data.placeholder
        field.field_options = options
        field.default_value = default
        field.display_order = index
    now = _now()
    for field_id, field in live.items():
        if field_id not in kept:
            field.deleted_at = now
    await db.flush()


async def save_fields(
    db: AsyncSession,
    user: User,
    tenant_id: UUID,
    type_id: UUID,
    inputs: list[ContentFieldInput],
) -> dict:
    row = await _get(db, tenant_id, type_id)
    fields = (await _live_fields(db, tenant_id, [row.id]))[row.id]
    before = _audit_value(row, fields)
    await _apply_fields(db, row, inputs)
    row.updated_at = _now()
    await db.commit()
    await db.refresh(row)
    await _audit(db, user, "CONTENT_TYPE_UPDATED", row, before=before)
    return await get_type_view(db, tenant_id, row.id)
