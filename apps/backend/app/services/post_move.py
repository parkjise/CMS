"""다른 게시판으로 글 옮기기 (T-184, 게시판 모듈 기획서 BM-05).

미리보기와 실행이 같은 계산을 쓴다 — 미리보기에서 본 결과 그대로 옮긴다.

규칙:
- 추가 칸 값은 받을 게시판에 이름 · 유형이 같은 칸이 있을 때만 따라간다.
  선택지는 이름이 같은 선택지로 옮기고, 받을 칸의 규칙(최솟값 등)에 맞지 않으면 뺀다.
  빠진 값은 감사 기록(before)에 원래대로 남긴다
- 공개 글은 받을 게시판의 필수 칸이 채워져야 한다 — 하나라도 걸리면 전체 취소
- 공지(기본 게시판)는 관리자 글만 받는다 — 비밀글 · 회원 글 · 비회원 글은 막는다
- 상단 고정 · 공개 상태 · 작성일 · 작성자 · 신고 기록은 그대로. 분류는 고른 것으로
- 글 변경과 감사 기록을 한 번에 커밋한다
"""

from dataclasses import dataclass
from dataclasses import field as dc_field
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.models.board import Board, BoardField, BoardPost
from app.models.user import User
from app.schemas.board import PostMoveRequest
from app.services import board as board_service
from app.services import board_category as category_service
from app.services import board_field as field_service
from app.services import site_cache

BLOCKED_LIST_SIZE = 20

MSG_TARGET_NOT_FOUND = "옮길 게시판을 찾을 수 없습니다. 화면을 새로 고쳐 주세요."
MSG_SAME_BOARD = "이미 이 게시판에 있는 글입니다."
MSG_NOTICE_SECRET = "비밀글은 공지로 옮길 수 없습니다."
MSG_NOTICE_VISITOR = "회원 · 비회원이 쓴 글은 공지로 옮길 수 없습니다."
MSG_REQUIRED_EMPTY = "필수 칸 '{label}'이 비어 있어 공개 글로 옮길 수 없습니다."
MSG_HAS_BLOCKED = (
    "옮길 수 없는 글이 {count}개 있습니다. 미리보기에서 이유를 확인해 주세요."
)


def _conflict(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "CONFLICT", "message": message},
    )


@dataclass
class _Plan:
    target: Board
    posts: list[BoardPost]
    # 글 id → 옮긴 뒤의 custom_data
    values: dict[UUID, dict[str, Any]]
    # 칸 이름 → 값이 따라가는 · 빠지는 글 수
    carried: dict[str, int] = dc_field(default_factory=dict)
    dropped: dict[str, int] = dc_field(default_factory=dict)
    # 빠진 값이 있는 글 id → 원래 custom_data (감사 기록용)
    lost: dict[UUID, dict[str, Any]] = dc_field(default_factory=dict)
    blocked: list[dict[str, Any]] = dc_field(default_factory=list)


def _labels(field: BoardField) -> dict[str, str]:
    return {
        choice["value"]: choice["label"]
        for choice in (field.field_options or {}).get("choices", [])
    }


def _carry(source: BoardField, target: BoardField, value: Any) -> Any:
    """받을 칸에 맞춘 값 — 맞지 않으면 None. 선택지는 이름으로 찾는다."""
    if source.field_type in field_service.CHOICE_TYPES:
        by_label = {label: v for v, label in _labels(target).items()}
        names = _labels(source)
        picked = value if isinstance(value, list) else [value]
        mapped = [by_label.get(names.get(item, "")) for item in picked]
        if None in mapped:
            return None
        value = mapped if source.field_type == "MULTI_SELECT" else mapped[0]
    try:
        return field_service.clean_value(
            target.field_type, target.field_options or {}, value
        )
    except ValueError:
        return None


def _match(source: BoardField, targets: list[BoardField]) -> BoardField | None:
    for target in targets:
        if (
            target.label.strip() == source.label.strip()
            and target.field_type == source.field_type
        ):
            return target
    return None


def _move_values(
    plan: _Plan,
    post: BoardPost,
    sources: list[BoardField],
    targets: list[BoardField],
) -> dict[str, Any]:
    stored = post.custom_data or {}
    moved: dict[str, Any] = {}
    for source in sources:
        if source.field_key not in stored:
            continue
        target = _match(source, targets)
        value = (
            _carry(source, target, stored[source.field_key])
            if target is not None
            else None
        )
        tally = plan.dropped if value is None else plan.carried
        tally[source.label] = tally.get(source.label, 0) + 1
        if target is not None and value is not None:
            moved[target.field_key] = value
    # 지운 칸의 값처럼 화면에 안 보이던 값도 빠진다 — 감사 기록에 남긴다
    if len(moved) < len(stored):
        plan.lost[post.id] = dict(stored)
    return moved


def _block_reason(
    post: BoardPost, target: Board, values: dict[str, Any], fields: list[BoardField]
) -> str | None:
    if post.board_id == target.id:
        return MSG_SAME_BOARD
    if target.system_key is not None:
        if post.is_secret:
            return MSG_NOTICE_SECRET
        if post.author_member_id is not None or post.guest_password_hash is not None:
            return MSG_NOTICE_VISITOR
    if post.status == board_service.STATUS_PUBLISHED:
        for field in fields:
            if field.is_required and field.field_key not in values:
                return MSG_REQUIRED_EMPTY.format(label=field.label)
    return None


async def _plan(
    db: AsyncSession, tenant_id: UUID, data: PostMoveRequest, *, lock: bool = False
) -> _Plan:
    target = await db.get(Board, data.target_board_id)
    if target is None or target.tenant_id != tenant_id or target.deleted_at:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=MSG_TARGET_NOT_FOUND
        )
    await category_service.check_post_category(db, target.id, data.category_id)
    ids = set(data.post_ids)
    query = (
        select(BoardPost)
        .join(Board, Board.id == BoardPost.board_id)
        .where(
            BoardPost.tenant_id == tenant_id,
            BoardPost.id.in_(ids),
            BoardPost.deleted_at.is_(None),
            Board.deleted_at.is_(None),
        )
        .order_by(BoardPost.created_at, BoardPost.id)
    )
    if lock:
        query = query.with_for_update(of=BoardPost)
    posts = list((await db.execute(query)).scalars().all())
    if len(posts) != len(ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=board_service.MSG_BULK_MISMATCH,
        )
    targets = await field_service.list_fields(db, target.id)
    sources: dict[UUID, list[BoardField]] = {}
    plan = _Plan(target=target, posts=posts, values={})
    for post in posts:
        if post.board_id not in sources:
            sources[post.board_id] = await field_service.list_fields(db, post.board_id)
        values = _move_values(plan, post, sources[post.board_id], targets)
        plan.values[post.id] = values
        reason = _block_reason(post, target, values, targets)
        if reason is not None:
            plan.blocked.append(
                {"post_id": post.id, "title": post.title, "reason": reason}
            )
    return plan


def _counts(tally: dict[str, int]) -> list[dict[str, Any]]:
    return [{"label": label, "posts": n} for label, n in tally.items()]


async def preview(
    db: AsyncSession, tenant_id: UUID, data: PostMoveRequest
) -> dict[str, Any]:
    plan = await _plan(db, tenant_id, data)
    return {
        "posts": len(plan.posts),
        "target_name": plan.target.name,
        "carried": _counts(plan.carried),
        "dropped": _counts(plan.dropped),
        "blocked_count": len(plan.blocked),
        "blocked": plan.blocked[:BLOCKED_LIST_SIZE],
    }


async def move(
    db: AsyncSession, tenant_id: UUID, data: PostMoveRequest, actor: User
) -> dict[str, int]:
    """글을 옮긴다 — 옮긴 글 수 · 값이 빠진 글 수."""
    plan = await _plan(db, tenant_id, data, lock=True)
    if plan.blocked:
        raise _conflict(MSG_HAS_BLOCKED.format(count=len(plan.blocked)))
    origins = {str(post.id): str(post.board_id) for post in plan.posts}
    for post in plan.posts:
        post.board_id = plan.target.id
        post.category_id = data.category_id
        # JSONB 는 새 dict 를 넣어야 바뀐 것으로 본다
        post.custom_data = plan.values[post.id]
    if plan.target.system_key == board_service.NOTICE_KEY and any(
        post.status == board_service.STATUS_PUBLISHED for post in plan.posts
    ):
        await board_service.drop_notice_samples(db, tenant_id)
    result = {"moved": len(plan.posts), "values_dropped": len(plan.lost)}
    # log_action 이 같은 세션의 글 변경과 감사 기록을 함께 커밋한다
    await log_action(
        db,
        actor,
        "POST_MOVED",
        "board_post",
        before={
            "board_ids": origins,
            "custom_data": {str(k): v for k, v in plan.lost.items()},
        },
        after={
            "board_id": str(plan.target.id),
            "category_id": str(data.category_id) if data.category_id else None,
            **result,
        },
        tenant_id=tenant_id,
    )
    await site_cache.purge_site(db, tenant_id)
    return result
