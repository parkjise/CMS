"""사업체가 보는 변경 기록 (T-186) — audit_logs 중 자기 사업체 것만.

읽기는 RLS(0039)로도 막히지만, 슈퍼 어드민 컨텍스트로 불려도 섞이지 않게
tenant_id 조건을 직접 건다. IP · 이전 · 이후 원본 값은 내보내지 않고
게시판 이름 · 대상 이름 · 개수만 꺼낸다.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.board import Board, BoardCategory, BoardField
from app.models.user import User

# 화면의 종류 필터 → target_type
KIND_TARGETS: dict[str, tuple[str, ...]] = {
    "board": ("board",),
    "post": ("board_post",),
    "setup": ("board_field", "board_category"),
}
ACTOR_OPERATOR = "운영사"
ACTOR_UNKNOWN = "삭제된 계정"
SUPER_ADMIN_ROLE = "SUPER_ADMIN"


@dataclass
class TenantAuditEntry:
    id: uuid.UUID
    action: str
    target_type: str
    actor: str
    board_name: str | None
    target_name: str | None
    count: int | None
    created_at: datetime


def _uuid(value: Any) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


def _count(after: dict) -> int | None:
    """여러 개를 한 번에 처리한 기록의 개수."""
    if isinstance(after.get("post_ids"), list):
        return len(after["post_ids"])
    for key in ("moved", "merged"):
        if isinstance(after.get(key), int):
            return after[key]
    return None


async def _names(
    db: AsyncSession, tenant_id: uuid.UUID, model: Any, label: Any, ids: set
) -> dict[uuid.UUID, str]:
    """지운 것도 포함해 이름을 찾는다 — 기록은 지운 뒤에도 남기 때문."""
    if not ids:
        return {}
    rows = await db.execute(
        select(model.id, label).where(model.tenant_id == tenant_id, model.id.in_(ids))
    )
    return {row[0]: row[1] for row in rows}


async def list_entries(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    kind: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[TenantAuditEntry], int]:
    conditions = [AuditLog.tenant_id == tenant_id]
    if kind:
        conditions.append(AuditLog.target_type.in_(KIND_TARGETS[kind]))
    total = int(
        (
            await db.execute(
                select(func.count()).select_from(AuditLog).where(*conditions)
            )
        ).scalar_one()
    )
    logs = list(
        (
            await db.execute(
                select(AuditLog)
                .where(*conditions)
                .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        ).scalars()
    )

    board_ids: set[uuid.UUID] = set()
    field_ids: set[uuid.UUID] = set()
    category_ids: set[uuid.UUID] = set()
    for log in logs:
        after = log.after_value or {}
        target = _uuid(log.target_id)
        if log.target_type == "board" and target:
            board_ids.add(target)
        elif board_id := _uuid(after.get("board_id")):
            board_ids.add(board_id)
        if log.target_type == "board_field" and target and "label" not in after:
            field_ids.add(target)
        if log.target_type == "board_category" and target and "name" not in after:
            category_ids.add(target)
    actor_ids = {log.actor_id for log in logs}

    boards = await _names(db, tenant_id, Board, Board.name, board_ids)
    fields = await _names(db, tenant_id, BoardField, BoardField.label, field_ids)
    categories = await _names(
        db, tenant_id, BoardCategory, BoardCategory.name, category_ids
    )
    actors: dict[uuid.UUID, str] = {}
    if actor_ids:
        rows = await db.execute(
            select(User.id, User.email).where(
                User.tenant_id == tenant_id, User.id.in_(actor_ids)
            )
        )
        actors = {row[0]: row[1] for row in rows}

    entries = []
    for log in logs:
        after = log.after_value or {}
        before = log.before_value or {}
        target = _uuid(log.target_id)
        if log.target_type == "board":
            board_name = after.get("name") or before.get("name")
            if board_name is None and target:
                board_name = boards.get(target)
            target_name = None
        else:
            board_id = _uuid(after.get("board_id"))
            board_name = boards.get(board_id) if board_id else None
            if log.target_type == "board_post":
                target_name = after.get("title")
            elif log.target_type == "board_field":
                target_name = after.get("label") or (
                    fields.get(target) if target else None
                )
            else:
                target_name = after.get("name") or (
                    categories.get(target) if target else None
                )
        if log.actor_role == SUPER_ADMIN_ROLE:
            actor = ACTOR_OPERATOR
        else:
            actor = actors.get(log.actor_id, ACTOR_UNKNOWN)
        entries.append(
            TenantAuditEntry(
                id=log.id,
                action=log.action,
                target_type=log.target_type,
                actor=actor,
                board_name=board_name,
                target_name=target_name,
                count=_count(after),
                created_at=log.created_at,
            )
        )
    return entries, total
