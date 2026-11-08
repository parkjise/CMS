"""게시판 카테고리 — 1단계 분류 (T-149, 게시판 모듈 기획서 BM-09).

규칙:
- 이름은 게시판 안에서 겹치지 않는다
- 기본 게시판(공지)은 화면이 템플릿 페이지라 쓰지 않는다
- 숨긴 분류는 홈페이지 탭에서만 빠진다. 글은 '전체'에 그대로 보인다
- 삭제는 소프트 삭제. 그 분류의 글(휴지통 글 포함)은 고른 분류나 분류 없음으로 옮긴다
"""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.models.board import Board, BoardCategory, BoardPost
from app.models.user import User
from app.schemas.board import CategoryCreate, CategoryMergeRequest, CategoryUpdate
from app.services import site_cache

MAX_CATEGORIES = 30

MSG_SYSTEM_BOARD = "기본 게시판에는 카테고리를 만들 수 없습니다."
MSG_TOO_MANY = f"카테고리는 게시판당 {MAX_CATEGORIES}개까지 만들 수 있습니다."
MSG_NAME_TAKEN = "이미 있는 카테고리 이름입니다."
MSG_ORDER_MISMATCH = "카테고리 목록이 바뀌었습니다. 화면을 새로 고쳐 주세요."
MSG_UNKNOWN_CATEGORY = "없는 카테고리입니다. 화면을 새로 고쳐 주세요."
MSG_MOVE_TO_SELF = "지우는 카테고리로는 옮길 수 없습니다."


def _conflict(message: str, field: str | None = None) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "CONFLICT", "message": message, "field": field},
    )


def _invalid(message: str, field: str | None = None) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": "VALIDATION_ERROR", "message": message, "field": field},
    )


async def list_categories(db: AsyncSession, board_id: UUID) -> list[BoardCategory]:
    result = await db.execute(
        select(BoardCategory)
        .where(BoardCategory.board_id == board_id, BoardCategory.deleted_at.is_(None))
        .order_by(
            BoardCategory.display_order, BoardCategory.created_at, BoardCategory.id
        )
    )
    return list(result.scalars().all())


async def get_category(
    db: AsyncSession, board_id: UUID, category_id: UUID
) -> BoardCategory | None:
    result = await db.execute(
        select(BoardCategory).where(
            BoardCategory.id == category_id,
            BoardCategory.board_id == board_id,
            BoardCategory.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def post_counts(db: AsyncSession, board_id: UUID) -> dict[UUID, int]:
    """분류마다 글 수 — 휴지통 글은 세지 않는다."""
    rows = await db.execute(
        select(BoardPost.category_id, func.count())
        .where(
            BoardPost.board_id == board_id,
            BoardPost.deleted_at.is_(None),
            BoardPost.category_id.is_not(None),
        )
        .group_by(BoardPost.category_id)
    )
    return {category_id: count for category_id, count in rows.all()}


async def public_categories(
    db: AsyncSession, board_ids: list[UUID]
) -> dict[UUID, list[dict]]:
    """홈페이지 탭 — 게시판마다 사용 중인 분류 [{id, name}], 정한 순서대로."""
    if not board_ids:
        return {}
    result = await db.execute(
        select(BoardCategory)
        .where(
            BoardCategory.board_id.in_(board_ids),
            BoardCategory.deleted_at.is_(None),
            BoardCategory.is_active.is_(True),
        )
        .order_by(
            BoardCategory.display_order, BoardCategory.created_at, BoardCategory.id
        )
    )
    by_board: dict[UUID, list[dict]] = {}
    for category in result.scalars():
        by_board.setdefault(category.board_id, []).append(
            {"id": category.id, "name": category.name}
        )
    return by_board


async def check_post_category(
    db: AsyncSession, board_id: UUID, category_id: UUID | None
) -> None:
    """글에 붙일 분류가 이 게시판의 것인지 — 다른 게시판 · 지운 분류는 막는다."""
    if category_id is None:
        return
    if await get_category(db, board_id, category_id) is None:
        raise _invalid(MSG_UNKNOWN_CATEGORY, "category_id")


async def _commit(db: AsyncSession, board: Board) -> None:
    """같은 이름이 동시에 들어오면 인덱스가 막는다."""
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise _conflict(MSG_NAME_TAKEN, "name") from e
    await site_cache.purge_site(db, board.tenant_id)


async def _name_taken(
    db: AsyncSession, board_id: UUID, name: str, exclude: UUID | None = None
) -> bool:
    conditions = [
        BoardCategory.board_id == board_id,
        BoardCategory.name == name,
        BoardCategory.deleted_at.is_(None),
    ]
    if exclude is not None:
        conditions.append(BoardCategory.id != exclude)
    found = await db.execute(select(BoardCategory.id).where(*conditions).limit(1))
    return found.first() is not None


async def create_category(
    db: AsyncSession, board: Board, data: CategoryCreate
) -> BoardCategory:
    if board.system_key is not None:
        raise _conflict(MSG_SYSTEM_BOARD)
    categories = await list_categories(db, board.id)
    if len(categories) >= MAX_CATEGORIES:
        raise _conflict(MSG_TOO_MANY)
    if await _name_taken(db, board.id, data.name):
        raise _conflict(MSG_NAME_TAKEN, "name")
    category = BoardCategory(
        tenant_id=board.tenant_id,
        board_id=board.id,
        name=data.name,
        is_active=data.is_active,
        display_order=max((c.display_order for c in categories), default=-1) + 1,
    )
    db.add(category)
    await _commit(db, board)
    await db.refresh(category)
    return category


async def update_category(
    db: AsyncSession, board: Board, category: BoardCategory, data: CategoryUpdate
) -> BoardCategory:
    if data.name is not None and data.name != category.name:
        if await _name_taken(db, board.id, data.name, exclude=category.id):
            raise _conflict(MSG_NAME_TAKEN, "name")
        category.name = data.name
    if data.is_active is not None:
        category.is_active = data.is_active
    await _commit(db, board)
    await db.refresh(category)
    return category


async def delete_category(
    db: AsyncSession,
    board: Board,
    category: BoardCategory,
    move_to: UUID | None,
) -> int:
    """지우고 글을 옮긴다 — 옮긴 글 수를 돌려준다."""
    if move_to == category.id:
        raise _invalid(MSG_MOVE_TO_SELF, "move_to")
    await check_post_category(db, board.id, move_to)
    moved = await db.execute(
        update(BoardPost)
        .where(BoardPost.board_id == board.id, BoardPost.category_id == category.id)
        .values(category_id=move_to)
    )
    category.deleted_at = datetime.now(UTC)
    await _commit(db, board)
    return int(moved.rowcount or 0)  # type: ignore[attr-defined]


async def reorder_categories(
    db: AsyncSession, board: Board, category_ids: list[UUID]
) -> list[BoardCategory]:
    categories = await list_categories(db, board.id)
    if len(category_ids) != len(categories) or {c.id for c in categories} != set(
        category_ids
    ):
        raise _invalid(MSG_ORDER_MISMATCH, "category_ids")
    rank = {category_id: i for i, category_id in enumerate(category_ids)}
    for category in categories:
        category.display_order = rank[category.id]
    await _commit(db, board)
    return await list_categories(db, board.id)


async def merge_categories(
    db: AsyncSession, board: Board, data: CategoryMergeRequest, actor: User
) -> int:
    """여러 원본의 검증/글 이동/소프트 삭제/감사를 한 번에 커밋한다."""
    if board.system_key is not None:
        raise _conflict(MSG_SYSTEM_BOARD)
    ids = [*data.source_ids, data.target_id]
    result = await db.execute(
        select(BoardCategory)
        .where(
            BoardCategory.board_id == board.id,
            BoardCategory.tenant_id == board.tenant_id,
            BoardCategory.deleted_at.is_(None),
            BoardCategory.id.in_(ids),
        )
        .order_by(BoardCategory.id)
        .with_for_update()
    )
    categories = list(result.scalars())
    if len(categories) != len(ids):
        raise _invalid(MSG_UNKNOWN_CATEGORY, "source_ids")
    moved = await db.execute(
        update(BoardPost)
        .where(
            BoardPost.board_id == board.id,
            BoardPost.tenant_id == board.tenant_id,
            BoardPost.category_id.in_(data.source_ids),
        )
        .values(category_id=data.target_id)
    )
    now = datetime.now(UTC)
    for category in categories:
        if category.id != data.target_id:
            category.deleted_at = now
    count = int(moved.rowcount or 0)  # type: ignore[attr-defined]
    # log_action이 같은 세션의 변경과 감사 기록을 함께 커밋한다.
    await log_action(
        db,
        actor,
        "BOARD_CATEGORIES_MERGED",
        "board_category",
        data.target_id,
        before={"source_ids": [str(id_) for id_ in data.source_ids]},
        after={
            "board_id": str(board.id),
            "target_id": str(data.target_id),
            "merged": len(data.source_ids),
            "moved_posts": count,
        },
        tenant_id=board.tenant_id,
    )
    await site_cache.purge_site(db, board.tenant_id)
    return count


def copies_of(categories: list[BoardCategory], board_id: UUID) -> list[BoardCategory]:
    """게시판 복제용 분류 복사본 (D-02) — 글은 복제하지 않으니 이름 · 순서만."""
    return [
        BoardCategory(
            id=uuid4(),
            tenant_id=category.tenant_id,
            board_id=board_id,
            name=category.name,
            is_active=category.is_active,
            display_order=category.display_order,
        )
        for category in categories
    ]
