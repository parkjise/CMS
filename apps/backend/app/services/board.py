"""게시판 · 게시글 (T-139, 게시판 모듈 기획서 2.2 · 8장).

샘플 규칙: 샘플 글은 섹션 JSON(items)에 두고, 글을 처음 공개하면 '[]' 로 비운다. 칸을
지우면 화면이 템플릿 샘플로 다시 채우므로(resolvePageSections) 빈 목록으로 남긴다.
"""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import ColumnElement, UnaryExpression, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.db.session import set_rls_context, set_super_admin_context
from app.models.board import Board, BoardPost
from app.models.section import Section, SectionSetting
from app.models.tenant import Tenant
from app.schemas.board import PostCreate, PostUpdate
from app.services import site_cache

NOTICE_KEY = "notice"
STATUS_PUBLISHED = "PUBLISHED"
SAMPLE_ITEMS_KEY = "items"
EMPTY_ITEMS = "[]"


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


async def list_boards(db: AsyncSession, tenant_id: UUID) -> list[dict]:
    await _ensure_system_boards(db, tenant_id)
    counts = (
        select(BoardPost.board_id, func.count().label("post_count"))
        .where(BoardPost.tenant_id == tenant_id, BoardPost.deleted_at.is_(None))
        .group_by(BoardPost.board_id)
        .subquery()
    )
    rows = await db.execute(
        select(Board, func.coalesce(counts.c.post_count, 0))
        .outerjoin(counts, counts.c.board_id == Board.id)
        .where(Board.tenant_id == tenant_id, Board.deleted_at.is_(None))
        .order_by(Board.created_at)
    )
    has_samples = await _has_samples(db, tenant_id)
    return [
        {
            "id": board.id,
            "name": board.name,
            "slug": board.slug,
            "board_type": board.board_type,
            "status": board.status,
            "system_key": board.system_key,
            "post_count": count,
            "has_samples": has_samples and board.system_key == NOTICE_KEY,
        }
        for board, count in rows.all()
    ]


async def get_board(db: AsyncSession, tenant_id: UUID, board_id: UUID) -> Board | None:
    result = await db.execute(
        select(Board).where(
            Board.id == board_id,
            Board.tenant_id == tenant_id,
            Board.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


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


# ── 공개 ──────────────────────────────────────────────────────────────────


async def open_public_board(
    db: AsyncSession, tenant_slug: str, board_slug: str
) -> Board | None:
    """주소의 사업체 · 게시판을 찾고 그 사업체로 RLS 를 건다. 없거나 중단이면 None."""
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
    if tenant is None:
        return None
    await set_rls_context(db, tenant.id)
    result = await db.execute(
        select(Board).where(
            Board.tenant_id == tenant.id,
            Board.slug == board_slug,
            Board.status == "ACTIVE",
            Board.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


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
