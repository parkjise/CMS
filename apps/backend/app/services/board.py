"""게시판 · 게시글 (T-139, 게시판 모듈 기획서 2.2 · 8장).

샘플 규칙: 샘플 글은 섹션 JSON(items)에 두고, 글을 처음 공개하면 '[]' 로 비운다. 칸을
지우면 화면이 템플릿 샘플로 다시 채우므로(resolvePageSections) 빈 목록으로 남긴다.
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import ColumnElement, UnaryExpression, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.db.session import set_rls_context, set_super_admin_context
from app.models.board import Board, BoardPost
from app.models.section import Section, SectionSetting
from app.models.tenant import Tenant
from app.schemas.board import (
    SLUG_MAX_LENGTH,
    BoardCreate,
    BoardUpdate,
    PostBulkAction,
    PostCreate,
    PostUpdate,
)
from app.services import site_cache

NOTICE_KEY = "notice"
STATUS_PUBLISHED = "PUBLISHED"
STATUS_PRIVATE = "PRIVATE"
SAMPLE_ITEMS_KEY = "items"
EMPTY_ITEMS = "[]"
MSG_BULK_MISMATCH = "처리할 수 없는 글이 섞여 있습니다. 화면을 새로 고쳐 주세요."
SITEMAP_POST_LIMIT = 5000
DESCRIPTION_KEY = "description"
AUTO_SLUG_PREFIX = "board"

# 기본 게시판을 뺀 추가 게시판 수 (기획서 4장 · D-01). None 은 제한 없음
BOARD_LIMITS: dict[str, int | None] = {
    "FREE": 0,
    "BASIC": 0,
    "STANDARD": 5,
    "PREMIUM": None,
}
# /{slug}/b/{게시판} 아래 주소 · 관리자 주소와 헷갈리는 이름 · 기본 게시판 키
RESERVED_BOARD_SLUGS = frozenset(
    {"notice", "consult", "reservation", "new", "trash", "write", "settings", "posts"}
)

MSG_BOARD_PLAN_BLOCKED = "게시판 추가는 STANDARD 요금제부터 쓸 수 있습니다."
MSG_SLUG_RESERVED = "쓸 수 없는 주소입니다. 다른 주소를 입력해 주세요."
MSG_SLUG_TAKEN = "이미 쓰고 있는 주소입니다."
MSG_SYSTEM_SLUG_LOCKED = "기본 게시판의 주소는 바꿀 수 없습니다."
MSG_SYSTEM_TYPE_LOCKED = "기본 게시판의 유형은 바꿀 수 없습니다."
MSG_SYSTEM_DELETE_LOCKED = "기본 게시판은 삭제할 수 없습니다. 비활성으로 바꿔 주세요."


def _active_post(tenant_id: UUID, board_id: UUID) -> list[ColumnElement[bool]]:
    return [
        BoardPost.tenant_id == tenant_id,
        BoardPost.board_id == board_id,
        BoardPost.deleted_at.is_(None),
    ]


def _title_contains(column: InstrumentedAttribute[str], q: str) -> ColumnElement[bool]:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return column.ilike(f"%{escaped}%", escape="\\")


async def _notice_sections(db: AsyncSession, tenant_id: UUID) -> list[Section]:
    """공지 샘플을 가진 섹션 — 공지 페이지 BOARD · 메인 최신 공지."""
    result = await db.execute(
        select(Section).where(
            Section.tenant_id == tenant_id,
            Section.deleted_at.is_(None),
            or_(
                Section.section_type == "NOTICE_LATEST",
                (Section.section_type == "BOARD") & (Section.page_key == NOTICE_KEY),
            ),
        )
    )
    return list(result.scalars().all())


async def _sample_settings(
    db: AsyncSession, section_ids: list[UUID]
) -> dict[UUID, SectionSetting]:
    if not section_ids:
        return {}
    result = await db.execute(
        select(SectionSetting).where(
            SectionSetting.section_id.in_(section_ids),
            SectionSetting.field_key == SAMPLE_ITEMS_KEY,
        )
    )
    return {s.section_id: s for s in result.scalars().all()}


async def _has_samples(db: AsyncSession, tenant_id: UUID) -> bool:
    sections = await _notice_sections(db, tenant_id)
    rows = await _sample_settings(db, [s.id for s in sections])
    # 칸이 없는 섹션은 화면이 템플릿 샘플로 채운다
    return any(
        s.id not in rows or rows[s.id].field_value not in (None, "", EMPTY_ITEMS)
        for s in sections
    )


async def _clear_samples(db: AsyncSession, tenant_id: UUID) -> None:
    sections = await _notice_sections(db, tenant_id)
    rows = await _sample_settings(db, [s.id for s in sections])
    for section in sections:
        row = rows.get(section.id)
        if row is None:
            db.add(
                SectionSetting(
                    tenant_id=tenant_id,
                    section_id=section.id,
                    field_key=SAMPLE_ITEMS_KEY,
                    field_value=EMPTY_ITEMS,
                    value_type="JSON",
                )
            )
        elif row.field_value != EMPTY_ITEMS:
            row.field_value = EMPTY_ITEMS
            row.value_type = "JSON"
            row.is_sample = False


async def clear_samples(db: AsyncSession, tenant_id: UUID) -> None:
    """고객이 직접 샘플 글을 치운다 — 공지가 아직 없어도 가짜 글을 내리도록."""
    await _clear_samples(db, tenant_id)
    await db.commit()
    await site_cache.purge_site(db, tenant_id)


async def _ensure_system_boards(db: AsyncSession, tenant_id: UUID) -> None:
    """템플릿에 공지 페이지가 있으면 공지 게시판을 만든다 (이미 있으면 그대로)."""
    has_notice = (
        await db.execute(
            select(Section.id)
            .where(
                Section.tenant_id == tenant_id,
                Section.deleted_at.is_(None),
                Section.section_type == "BOARD",
                Section.page_key == NOTICE_KEY,
            )
            .limit(1)
        )
    ).first()
    if not has_notice:
        return
    await db.execute(
        insert(Board)
        .values(
            tenant_id=tenant_id,
            name="공지사항",
            slug=NOTICE_KEY,
            system_key=NOTICE_KEY,
            board_type="LIST",
            status="ACTIVE",
            settings={},
        )
        .on_conflict_do_nothing()
    )
    await db.commit()


async def _post_counts(db: AsyncSession, board_ids: list[UUID]) -> dict[UUID, int]:
    if not board_ids:
        return {}
    rows = await db.execute(
        select(BoardPost.board_id, func.count())
        .where(BoardPost.board_id.in_(board_ids), BoardPost.deleted_at.is_(None))
        .group_by(BoardPost.board_id)
    )
    return {board_id: count for board_id, count in rows.all()}


def _board_response(board: Board, post_count: int, has_samples: bool) -> dict:
    return {
        "id": board.id,
        "name": board.name,
        "slug": board.slug,
        "description": (board.settings or {}).get(DESCRIPTION_KEY, ""),
        "board_type": board.board_type,
        "status": board.status,
        "system_key": board.system_key,
        "post_count": post_count,
        "has_samples": has_samples and board.system_key == NOTICE_KEY,
        "deleted_at": board.deleted_at,
    }


async def board_response(db: AsyncSession, board: Board) -> dict:
    counts = await _post_counts(db, [board.id])
    has_samples = board.system_key == NOTICE_KEY and await _has_samples(
        db, board.tenant_id
    )
    return _board_response(board, counts.get(board.id, 0), has_samples)


async def list_boards(
    db: AsyncSession, tenant_id: UUID, *, trash: bool = False
) -> list[dict]:
    if not trash:
        await _ensure_system_boards(db, tenant_id)
    result = await db.execute(
        select(Board)
        .where(
            Board.tenant_id == tenant_id,
            Board.deleted_at.is_not(None) if trash else Board.deleted_at.is_(None),
        )
        .order_by(Board.created_at)
    )
    boards = list(result.scalars().all())
    counts = await _post_counts(db, [b.id for b in boards])
    has_samples = not trash and await _has_samples(db, tenant_id)
    return [_board_response(b, counts.get(b.id, 0), has_samples) for b in boards]


async def get_board(db: AsyncSession, tenant_id: UUID, board_id: UUID) -> Board | None:
    result = await db.execute(
        select(Board).where(
            Board.id == board_id,
            Board.tenant_id == tenant_id,
            Board.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def get_trashed_board(
    db: AsyncSession, tenant_id: UUID, board_id: UUID
) -> Board | None:
    result = await db.execute(
        select(Board).where(
            Board.id == board_id,
            Board.tenant_id == tenant_id,
            Board.deleted_at.is_not(None),
        )
    )
    return result.scalar_one_or_none()


# ── 게시판 생성 · 설정 (T-140-A, 기획서 4장 · 5.1 · 5.4) ─────────────────────


async def get_limits(db: AsyncSession, tenant_id: UUID) -> dict:
    """기본 게시판과 휴지통은 세지 않는다. 모르는 요금제는 추가 불가."""
    plan = (
        await db.execute(select(Tenant.plan_type).where(Tenant.id == tenant_id))
    ).scalar_one_or_none() or ""
    limit = BOARD_LIMITS.get(plan.upper(), 0)
    used = (
        await db.execute(
            select(func.count())
            .select_from(Board)
            .where(
                Board.tenant_id == tenant_id,
                Board.deleted_at.is_(None),
                Board.system_key.is_(None),
            )
        )
    ).scalar_one()
    can_create = limit is None or used < limit
    reason = None
    if not can_create:
        reason = (
            MSG_BOARD_PLAN_BLOCKED
            if limit == 0
            else f"현재 요금제는 게시판을 {limit}개까지 추가할 수 있습니다."
        )
    return {
        "plan": plan,
        "limit": limit,
        "used": used,
        "can_create": can_create,
        "reason": reason,
    }


async def _ensure_can_create(db: AsyncSession, tenant_id: UUID) -> None:
    """만들 때만 검사 — 요금제를 내려도 있던 게시판 · 글은 그대로 쓴다."""
    limits = await get_limits(db, tenant_id)
    if not limits["can_create"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "PLAN_LIMIT_EXCEEDED", "message": limits["reason"]},
        )


async def _slug_taken(
    db: AsyncSession, tenant_id: UUID, slug: str, *, exclude: UUID | None = None
) -> bool:
    conditions = [
        Board.tenant_id == tenant_id,
        Board.slug == slug,
        Board.deleted_at.is_(None),
    ]
    if exclude is not None:
        conditions.append(Board.id != exclude)
    found = await db.execute(select(Board.id).where(*conditions).limit(1))
    return found.first() is not None


async def _used_slugs(db: AsyncSession, tenant_id: UUID) -> set[str]:
    """휴지통 슬러그도 포함 — 나중에 복원할 때 주소가 바뀌지 않게."""
    rows = await db.execute(select(Board.slug).where(Board.tenant_id == tenant_id))
    return set(rows.scalars().all())


async def _next_auto_slug(db: AsyncSession, tenant_id: UUID) -> str:
    used = await _used_slugs(db, tenant_id)
    number = 1
    while f"{AUTO_SLUG_PREFIX}-{number}" in used:
        number += 1
    return f"{AUTO_SLUG_PREFIX}-{number}"


def _check_slug(slug: str) -> None:
    if slug in RESERVED_BOARD_SLUGS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=MSG_SLUG_RESERVED
        )


async def _commit_board(db: AsyncSession) -> None:
    """같은 슬러그가 동시에 들어오면 인덱스가 막는다."""
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=MSG_SLUG_TAKEN
        ) from e


async def create_board(db: AsyncSession, tenant_id: UUID, data: BoardCreate) -> Board:
    await _ensure_can_create(db, tenant_id)
    if data.slug:
        _check_slug(data.slug)
        if await _slug_taken(db, tenant_id, data.slug):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail=MSG_SLUG_TAKEN
            )
    board = Board(
        tenant_id=tenant_id,
        name=data.name,
        slug=data.slug or await _next_auto_slug(db, tenant_id),
        board_type=data.board_type,
        status=data.status,
        settings={DESCRIPTION_KEY: data.description},
    )
    db.add(board)
    await _commit_board(db)
    await db.refresh(board)
    await site_cache.purge_site(db, tenant_id)
    return board


async def update_board(db: AsyncSession, board: Board, data: BoardUpdate) -> Board:
    is_system = board.system_key is not None
    if is_system and data.slug is not None and data.slug != board.slug:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=MSG_SYSTEM_SLUG_LOCKED
        )
    if (
        is_system
        and data.board_type is not None
        and data.board_type != board.board_type
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=MSG_SYSTEM_TYPE_LOCKED
        )
    if data.slug is not None and data.slug != board.slug:
        _check_slug(data.slug)
        if await _slug_taken(db, board.tenant_id, data.slug, exclude=board.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail=MSG_SLUG_TAKEN
            )
        board.slug = data.slug
    if data.name is not None:
        board.name = data.name
    if data.board_type is not None:
        board.board_type = data.board_type
    if data.description is not None:
        board.settings = {**(board.settings or {}), DESCRIPTION_KEY: data.description}
    if data.status is not None:
        board.status = data.status
        # 비활성이면 공개 글을 읽지 못해 화면이 샘플로 돌아가므로 함께 비운다
        if data.status == "INACTIVE" and board.system_key == NOTICE_KEY:
            await _clear_samples(db, board.tenant_id)
    await _commit_board(db)
    await db.refresh(board)
    await site_cache.purge_site(db, board.tenant_id)
    return board


async def duplicate_board(db: AsyncSession, board: Board) -> Board:
    """설정만 복제하고 글은 복제하지 않는다 (D-02). 복제본은 기본 게시판이 아니다."""
    await _ensure_can_create(db, board.tenant_id)
    copy = Board(
        tenant_id=board.tenant_id,
        name=f"{board.name} 복사본"[:100],
        slug=await _next_auto_slug(db, board.tenant_id),
        board_type=board.board_type,
        status=board.status,
        settings=dict(board.settings or {}),
    )
    db.add(copy)
    await _commit_board(db)
    await db.refresh(copy)
    await site_cache.purge_site(db, board.tenant_id)
    return copy


async def delete_board(db: AsyncSession, board: Board) -> None:
    if board.system_key is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=MSG_SYSTEM_DELETE_LOCKED
        )
    board.deleted_at = datetime.now(UTC)
    await db.commit()
    await site_cache.purge_site(db, board.tenant_id)


async def restore_board(db: AsyncSession, board: Board) -> tuple[Board, bool]:
    """슬러그가 그사이 쓰였으면 번호를 붙여 복원한다 — 고객이 막히지 않게."""
    await _ensure_can_create(db, board.tenant_id)
    slug = board.slug
    number = 2
    while await _slug_taken(db, board.tenant_id, slug, exclude=board.id):
        suffix = f"-{number}"
        slug = f"{board.slug[: SLUG_MAX_LENGTH - len(suffix)]}{suffix}"
        number += 1
    changed = slug != board.slug
    board.slug = slug
    board.deleted_at = None
    await _commit_board(db)
    await db.refresh(board)
    await site_cache.purge_site(db, board.tenant_id)
    return board, changed


# ── 게시글 ────────────────────────────────────────────────────────────────


async def list_posts(
    db: AsyncSession,
    tenant_id: UUID,
    board_id: UUID,
    *,
    page: int,
    size: int,
    status: str | None = None,
    q: str | None = None,
    trash: bool = False,
) -> tuple[list[BoardPost], int]:
    conditions: list[ColumnElement[bool]] = [
        BoardPost.tenant_id == tenant_id,
        BoardPost.board_id == board_id,
        BoardPost.deleted_at.is_not(None) if trash else BoardPost.deleted_at.is_(None),
    ]
    if status:
        conditions.append(BoardPost.status == status)
    if q:
        conditions.append(_title_contains(BoardPost.title, q))
    total = (
        await db.execute(select(func.count()).select_from(BoardPost).where(*conditions))
    ).scalar_one()
    result = await db.execute(
        select(BoardPost)
        .where(*conditions)
        .order_by(
            BoardPost.is_pinned.desc(),
            func.coalesce(BoardPost.published_at, BoardPost.created_at).desc(),
        )
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(result.scalars().all()), total


async def get_post(
    db: AsyncSession, tenant_id: UUID, board_id: UUID, post_id: UUID
) -> BoardPost | None:
    """삭제된 글도 돌려준다 — 휴지통 복원에 쓴다."""
    result = await db.execute(
        select(BoardPost).where(
            BoardPost.id == post_id,
            BoardPost.board_id == board_id,
            BoardPost.tenant_id == tenant_id,
        )
    )
    return result.scalar_one_or_none()


async def _after_write(db: AsyncSession, post: BoardPost) -> None:
    if post.status == STATUS_PUBLISHED and post.deleted_at is None:
        post.published_at = post.published_at or datetime.now(UTC)
        # 샘플은 공지 것뿐 — 다른 게시판 글로 공지 샘플이 사라지면 안 된다
        board = await db.get(Board, post.board_id)
        if board is not None and board.system_key == NOTICE_KEY:
            await _clear_samples(db, post.tenant_id)
    await db.commit()
    await db.refresh(post)
    await site_cache.purge_site(db, post.tenant_id)


async def create_post(
    db: AsyncSession,
    tenant_id: UUID,
    board_id: UUID,
    author_id: UUID,
    data: PostCreate,
) -> BoardPost:
    post = BoardPost(
        tenant_id=tenant_id,
        board_id=board_id,
        author_id=author_id,
        title=data.title,
        body=[b.model_dump() for b in data.body],
        status=data.status,
        is_pinned=data.is_pinned,
    )
    db.add(post)
    await _after_write(db, post)
    return post


async def update_post(db: AsyncSession, post: BoardPost, data: PostUpdate) -> BoardPost:
    if data.title is not None:
        post.title = data.title
    if data.body is not None:
        post.body = [b.model_dump() for b in data.body]
    if data.status is not None:
        post.status = data.status
    if data.is_pinned is not None:
        post.is_pinned = data.is_pinned
    await _after_write(db, post)
    return post


async def delete_post(db: AsyncSession, post: BoardPost) -> None:
    post.deleted_at = datetime.now(UTC)
    await _after_write(db, post)


async def restore_post(db: AsyncSession, post: BoardPost) -> BoardPost:
    post.deleted_at = None
    await _after_write(db, post)
    return post


# ── 전체 글 (BM-05, T-140-C) ─────────────────────────────────────────────


async def list_all_posts(
    db: AsyncSession,
    tenant_id: UUID,
    *,
    page: int,
    size: int,
    board_id: UUID | None = None,
    status: str | None = None,
    q: str | None = None,
    trash: bool = False,
) -> tuple[list[tuple[BoardPost, str]], int]:
    """여러 게시판의 글. 휴지통에 있는 게시판의 글은 나오지 않는다."""
    conditions: list[ColumnElement[bool]] = [
        BoardPost.tenant_id == tenant_id,
        Board.deleted_at.is_(None),
        BoardPost.deleted_at.is_not(None) if trash else BoardPost.deleted_at.is_(None),
    ]
    if board_id:
        conditions.append(BoardPost.board_id == board_id)
    if status:
        conditions.append(BoardPost.status == status)
    if q:
        conditions.append(_title_contains(BoardPost.title, q))
    joined = select(BoardPost, Board.name).join(Board, Board.id == BoardPost.board_id)
    total = (
        await db.execute(
            select(func.count())
            .select_from(BoardPost)
            .join(Board, Board.id == BoardPost.board_id)
            .where(*conditions)
        )
    ).scalar_one()
    result = await db.execute(
        joined.where(*conditions)
        .order_by(
            func.coalesce(BoardPost.published_at, BoardPost.created_at).desc(),
            BoardPost.id.desc(),
        )
        .offset((page - 1) * size)
        .limit(size)
    )
    return [(post, name) for post, name in result.all()], total


async def bulk_update_posts(
    db: AsyncSession, tenant_id: UUID, post_ids: list[UUID], action: PostBulkAction
) -> list[UUID]:
    """전부 처리하거나 전부 취소한다 — 처리할 수 없는 글이 섞이면 그대로 둔다."""
    ids = set(post_ids)
    in_trash = action == "RESTORE"
    result = await db.execute(
        select(BoardPost, Board)
        .join(Board, Board.id == BoardPost.board_id)
        .where(
            BoardPost.tenant_id == tenant_id,
            BoardPost.id.in_(ids),
            Board.deleted_at.is_(None),
            BoardPost.deleted_at.is_not(None)
            if in_trash
            else BoardPost.deleted_at.is_(None),
        )
    )
    rows = result.all()
    if len(rows) != len(ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=MSG_BULK_MISMATCH
        )
    now = datetime.now(UTC)
    for post, _board in rows:
        if action == "TRASH":
            post.deleted_at = now
        elif action == "RESTORE":
            post.deleted_at = None
        elif action == "PRIVATE":
            post.status = STATUS_PRIVATE
        else:
            post.status = STATUS_PUBLISHED
    # 낱개 저장(_after_write)과 같은 규칙 — 공개 글의 공개일, 공지 글이면 샘플 비우기
    public = [
        (post, board)
        for post, board in rows
        if post.status == STATUS_PUBLISHED and post.deleted_at is None
    ]
    for post, _board in public:
        post.published_at = post.published_at or now
    if any(board.system_key == NOTICE_KEY for _post, board in public):
        await _clear_samples(db, tenant_id)
    await db.commit()
    await site_cache.purge_site(db, tenant_id)
    return [post.id for post, _board in rows]


# ── 공개 ──────────────────────────────────────────────────────────────────


async def _open_public_tenant(db: AsyncSession, tenant_slug: str) -> Tenant | None:
    """주소의 사업체를 찾고 그 사업체로 RLS 를 건다. 없거나 중단이면 None."""
    await set_super_admin_context(db)
    tenant = (
        await db.execute(
            select(Tenant).where(
                Tenant.slug == tenant_slug,
                Tenant.deleted_at.is_(None),
                Tenant.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if tenant is not None:
        await set_rls_context(db, tenant.id)
    return tenant


async def open_public_board(
    db: AsyncSession, tenant_slug: str, board_slug: str
) -> Board | None:
    """주소의 사업체 · 게시판을 찾는다. 없거나 중단이면 None."""
    tenant = await _open_public_tenant(db, tenant_slug)
    if tenant is None:
        return None
    result = await db.execute(
        select(Board).where(
            Board.tenant_id == tenant.id,
            Board.slug == board_slug,
            Board.status == "ACTIVE",
            Board.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def list_public_boards(db: AsyncSession, tenant_id: UUID) -> list[dict]:
    """홈페이지에 나가는 새 게시판 — 기본 게시판은 템플릿 페이지가 따로 있다 (5.3)."""
    result = await db.execute(
        select(Board)
        .where(
            Board.tenant_id == tenant_id,
            Board.system_key.is_(None),
            Board.status == "ACTIVE",
            Board.deleted_at.is_(None),
        )
        .order_by(Board.created_at, Board.id)
    )
    return [
        {
            "id": board.id,
            "name": board.name,
            "slug": board.slug,
            "description": (board.settings or {}).get(DESCRIPTION_KEY, ""),
            "board_type": board.board_type,
        }
        for board in result.scalars()
    ]


async def list_sitemap_posts(db: AsyncSession, tenant_slug: str) -> list[dict] | None:
    """사이트맵용 공개 글, 최근 수정 순. 사업체가 없으면 None."""
    tenant = await _open_public_tenant(db, tenant_slug)
    if tenant is None:
        return None
    result = await db.execute(
        select(BoardPost.id, BoardPost.updated_at, Board.slug, Board.system_key)
        .join(Board, Board.id == BoardPost.board_id)
        .where(
            BoardPost.tenant_id == tenant.id,
            BoardPost.status == STATUS_PUBLISHED,
            BoardPost.deleted_at.is_(None),
            Board.status == "ACTIVE",
            Board.deleted_at.is_(None),
        )
        .order_by(BoardPost.updated_at.desc(), BoardPost.id.desc())
        .limit(SITEMAP_POST_LIMIT)
    )
    return [
        {
            "id": row.id,
            "updated_at": row.updated_at,
            "board_slug": row.slug,
            "is_system": row.system_key is not None,
        }
        for row in result
    ]


def public_post_item(board: Board, post: BoardPost) -> dict:
    """공개 목록의 글 한 줄 — 유형별로 화면이 더 필요한 값까지."""
    blocks = post.body or []
    return {
        "id": post.id,
        "title": post.title,
        "is_pinned": post.is_pinned,
        "published_at": post.published_at,
        "thumbnail": next((b["src"] for b in blocks if b.get("type") == "image"), None),
        "body": blocks if board.board_type == "FAQ" else None,
    }


def _public_conditions(board: Board) -> list[ColumnElement[bool]]:
    return [
        *_active_post(board.tenant_id, board.id),
        BoardPost.status == STATUS_PUBLISHED,
    ]


def _public_order(latest: bool = False) -> list[UnaryExpression]:
    newest: list[UnaryExpression] = [
        BoardPost.published_at.desc(),
        BoardPost.id.desc(),
    ]
    return newest if latest else [BoardPost.is_pinned.desc(), *newest]


async def list_public_posts(
    db: AsyncSession,
    board: Board,
    *,
    page: int,
    size: int,
    q: str | None = None,
    latest: bool = False,
) -> tuple[list[BoardPost], int, bool]:
    public = _public_conditions(board)
    has_posts = (
        await db.execute(select(BoardPost.id).where(*public).limit(1))
    ).first() is not None
    conditions = [*public, _title_contains(BoardPost.title, q)] if q else public
    total = (
        await db.execute(select(func.count()).select_from(BoardPost).where(*conditions))
    ).scalar_one()
    result = await db.execute(
        select(BoardPost)
        .where(*conditions)
        .order_by(*_public_order(latest))
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(result.scalars().all()), total, has_posts


async def get_public_post(
    db: AsyncSession, board: Board, post_id: UUID
) -> tuple[BoardPost, UUID | None, UUID | None] | None:
    """글과 목록 순서의 이전(더 오래된) · 다음(더 새로운) 글 id."""
    ids = list(
        (
            await db.execute(
                select(BoardPost.id)
                .where(*_public_conditions(board))
                .order_by(*_public_order())
            )
        )
        .scalars()
        .all()
    )
    if post_id not in ids:
        return None
    post = await db.get(BoardPost, post_id)
    if post is None:
        return None
    index = ids.index(post_id)
    prev_id = ids[index + 1] if index + 1 < len(ids) else None
    next_id = ids[index - 1] if index > 0 else None
    return post, prev_id, next_id
