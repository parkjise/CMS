"""게시판 · 게시글 (T-139, 게시판 모듈 기획서 2.2 · 8장).

샘플 규칙: 샘플 글은 섹션 JSON(items)에 두고, 글을 처음 공개하면 '[]' 로 비운다. 칸을
지우면 화면이 템플릿 샘플로 다시 채우므로(resolvePageSections) 빈 목록으로 남긴다.
"""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import ColumnElement, UnaryExpression, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.db.session import set_rls_context, set_super_admin_context
from app.models.board import Board, BoardField, BoardPost
from app.models.section import Section, SectionSetting
from app.models.site_member import SiteMember
from app.models.tenant import Tenant
from app.schemas.board import (
    SLUG_MAX_LENGTH,
    BoardCreate,
    BoardDesign,
    BoardOperation,
    BoardPermissions,
    BoardUpdate,
    PostBulkAction,
    PostCreate,
    PostUpdate,
)
from app.schemas.rich_body import body_summary, first_image
from app.services import board_access, member_features, site_cache
from app.services import board_category as category_service
from app.services import board_field as field_service

NOTICE_KEY = "notice"
STATUS_PUBLISHED = "PUBLISHED"
STATUS_PRIVATE = "PRIVATE"
SAMPLE_ITEMS_KEY = "items"
EMPTY_ITEMS = "[]"
MSG_DATE_RANGE = "작성일 시작은 종료 범위보다 빨라야 합니다."
MSG_UPDATED_DATE_RANGE = "수정일 시작은 종료 범위보다 빨라야 합니다."
MSG_PUBLISHED_DATE_RANGE = "공개일 시작은 종료 범위보다 빨라야 합니다."
MSG_BULK_MISMATCH = "처리할 수 없는 글이 섞여 있습니다. 화면을 새로 고쳐 주세요."
SITEMAP_POST_LIMIT = 5000
DESCRIPTION_KEY = "description"
SORT_ORDER_KEY = "sort_order"
PAGE_SIZE_KEY = "page_size"
SEO_TITLE_KEY = "seo_title"
SEO_DESCRIPTION_KEY = "seo_description"
SEO_INDEX_KEY = "seo_index"
DESIGN_KEY = "design"
PERMISSIONS_KEY = "permissions"
OPERATION_KEY = "operation"
READ_MEMBER = "MEMBER"
OPTION_KEYS = {
    PERMISSIONS_KEY,
    OPERATION_KEY,
    SORT_ORDER_KEY,
    PAGE_SIZE_KEY,
    SEO_TITLE_KEY,
    SEO_DESCRIPTION_KEY,
    SEO_INDEX_KEY,
    DESIGN_KEY,
}
CARD_SUMMARY_LIMIT = 120
DEFAULT_SORT_ORDER = "LATEST"
DEFAULT_PUBLIC_PAGE_SIZE = 10
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
MSG_SYSTEM_PERMISSIONS_LOCKED = "기본 게시판의 권한은 바꿀 수 없습니다."
MSG_SYSTEM_OPERATION_LOCKED = "기본 게시판에는 운영 설정이 없습니다."
MSG_SYSTEM_SECRET_LOCKED = "기본 게시판에는 비밀글을 쓸 수 없습니다."


def _active_post(tenant_id: UUID, board_id: UUID) -> list[ColumnElement[bool]]:
    return [
        BoardPost.tenant_id == tenant_id,
        BoardPost.board_id == board_id,
        BoardPost.deleted_at.is_(None),
    ]


def _title_contains(
    column: InstrumentedAttribute[str] | InstrumentedAttribute[str | None], q: str
) -> ColumnElement[bool]:
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


def board_options(board: Board) -> dict:
    """목록 표시 · 검색 노출 설정 (BM-03, T-146) — 저장하지 않은 값은 기본값."""
    settings = board.settings or {}
    return {
        SORT_ORDER_KEY: settings.get(SORT_ORDER_KEY, DEFAULT_SORT_ORDER),
        PAGE_SIZE_KEY: settings.get(PAGE_SIZE_KEY),
        SEO_TITLE_KEY: settings.get(SEO_TITLE_KEY, ""),
        SEO_DESCRIPTION_KEY: settings.get(SEO_DESCRIPTION_KEY, ""),
        SEO_INDEX_KEY: settings.get(SEO_INDEX_KEY, True),
        DESIGN_KEY: BoardDesign(**settings.get(DESIGN_KEY, {})).model_dump(),
        PERMISSIONS_KEY: BoardPermissions(
            **settings.get(PERMISSIONS_KEY, {})
        ).model_dump(),
        OPERATION_KEY: BoardOperation(**settings.get(OPERATION_KEY, {})).model_dump(),
    }


def operation_of(board: Board) -> BoardOperation:
    """운영 설정 (T-151-A) — 비밀글 허용 · 새 글 알림."""
    return BoardOperation(**(board.settings or {}).get(OPERATION_KEY, {}))


def is_member_only(board: Board) -> bool:
    """회원만 읽는 게시판 (T-150) — 공개 캐시 · 사이트맵 · 검색에서 뺀다."""
    return board_options(board)[PERMISSIONS_KEY]["read"] == READ_MEMBER


def _board_response(board: Board, post_count: int, has_samples: bool) -> dict:
    return {
        "updated_at": board.updated_at,
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
        **board_options(board),
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


def _merged_options(settings: dict, data: BoardUpdate) -> dict:
    """보낸 값만 바꾼다. 글 수의 null 은 유형별 기본값으로 되돌리기."""
    merged = dict(settings)
    sent = data.model_dump(include=OPTION_KEYS, exclude_unset=True)
    for key, value in sent.items():
        if value is not None:
            merged[key] = value
        elif key == PAGE_SIZE_KEY:
            merged.pop(key, None)
    return merged


async def _check_permissions(
    db: AsyncSession, board: Board, permissions: BoardPermissions
) -> None:
    """기본 게시판은 화면이 템플릿 페이지라 권한이 없다.

    회원 권한은 방문자 회원 기능이 켜진 사업체만, 회원 글쓰기는 병원 업종 · 필수 칸이
    있는 게시판이 아닐 때만 (board_access). 이미 켜 둔 값은 다시 저장할 수 있다.
    """
    if permissions == BoardPermissions():
        return
    if board.system_key is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=MSG_SYSTEM_PERMISSIONS_LOCKED
        )
    current = board_access.permissions_of(board)
    blocked = None
    if permissions.read == READ_MEMBER and current.read != READ_MEMBER:
        blocked = await board_access.member_read_blocked(db, board)
    turning_on_write = permissions.write == READ_MEMBER and current.write != READ_MEMBER
    if not blocked and turning_on_write:
        blocked = await board_access.member_write_blocked(db, board)
    if blocked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "CONFLICT", "message": blocked},
        )


def ensure_secret_allowed(board: Board, is_secret: bool | None) -> None:
    """기본 게시판(공지)은 화면이 템플릿 페이지라 비밀글을 그리지 못한다 (T-152)."""
    if is_secret and board.system_key is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "CONFLICT", "message": MSG_SYSTEM_SECRET_LOCKED},
        )


async def update_board(db: AsyncSession, board: Board, data: BoardUpdate) -> Board:
    is_system = board.system_key is not None
    if is_system and data.operation is not None and data.operation != BoardOperation():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "CONFLICT", "message": MSG_SYSTEM_OPERATION_LOCKED},
        )
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
    if data.permissions is not None:
        await _check_permissions(db, board, data.permissions)
    if (
        data.operation is not None
        and data.operation.allow_guest
        and not operation_of(board).allow_guest
    ):
        # 비회원 글쓰기도 회원 글쓰기와 같은 이유로 막는다 (병원 · 필수 칸, T-151-B)
        blocked = await board_access.member_write_blocked(db, board)
        if blocked:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "CONFLICT", "message": blocked},
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
    board.settings = _merged_options(board.settings or {}, data)
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
    fields = await field_service.list_fields(db, board.id)
    categories = await category_service.list_categories(db, board.id)
    copy = Board(
        id=uuid4(),
        tenant_id=board.tenant_id,
        name=f"{board.name} 복사본"[:100],
        slug=await _next_auto_slug(db, board.tenant_id),
        board_type=board.board_type,
        status=board.status,
        settings=dict(board.settings or {}),
    )
    db.add(copy)
    db.add_all(field_service.copies_of(fields, copy.id))
    db.add_all(category_service.copies_of(categories, copy.id))
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
    category_id: UUID | None = None,
) -> tuple[list[BoardPost], int]:
    conditions: list[ColumnElement[bool]] = [
        BoardPost.tenant_id == tenant_id,
        BoardPost.board_id == board_id,
        BoardPost.deleted_at.is_not(None) if trash else BoardPost.deleted_at.is_(None),
    ]
    if status:
        conditions.append(BoardPost.status == status)
    if category_id:
        conditions.append(BoardPost.category_id == category_id)
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


async def after_member_write(db: AsyncSession, post: BoardPost) -> None:
    """홈페이지 회원 글 저장 뒤 — 관리자 글과 같은 공개일 · 캐시 비우기 (T-150-B)."""
    await _after_write(db, post)


async def create_post(
    db: AsyncSession,
    tenant_id: UUID,
    board_id: UUID,
    author_id: UUID,
    data: PostCreate,
) -> BoardPost:
    custom_data = await field_service.resolve_custom_data(
        db, board_id, None, data.custom_data, data.status
    )
    await category_service.check_post_category(db, board_id, data.category_id)
    post = BoardPost(
        tenant_id=tenant_id,
        board_id=board_id,
        author_id=author_id,
        title=data.title,
        body=data.body,
        status=data.status,
        is_pinned=data.is_pinned,
        is_secret=data.is_secret,
        custom_data=custom_data,
        category_id=data.category_id,
    )
    db.add(post)
    await _after_write(db, post)
    return post


async def update_post(db: AsyncSession, post: BoardPost, data: PostUpdate) -> BoardPost:
    post.custom_data = await field_service.resolve_custom_data(
        db, post.board_id, post, data.custom_data, data.status or post.status
    )
    if "category_id" in data.model_fields_set:
        await category_service.check_post_category(db, post.board_id, data.category_id)
        post.category_id = data.category_id
    if data.title is not None:
        post.title = data.title
    if data.body is not None:
        post.body = data.body
    if data.status is not None:
        post.status = data.status
    if data.is_pinned is not None:
        post.is_pinned = data.is_pinned
    if data.is_secret is not None:
        post.is_secret = data.is_secret
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
    category_id: UUID | None = None,
    status: str | None = None,
    q: str | None = None,
    author: str | None = None,
    trash: bool = False,
    created_from: datetime | None = None,
    created_before: datetime | None = None,
    updated_from: datetime | None = None,
    updated_before: datetime | None = None,
    published_from: datetime | None = None,
    published_before: datetime | None = None,
) -> tuple[list[tuple[BoardPost, str]], int]:
    """여러 게시판의 글. 날짜 범위는 시작 포함 · 끝 제외다."""
    if created_from and created_before and created_from >= created_before:
        raise HTTPException(status_code=400, detail=MSG_DATE_RANGE)
    if updated_from and updated_before and updated_from >= updated_before:
        raise HTTPException(status_code=400, detail=MSG_UPDATED_DATE_RANGE)
    if published_from and published_before and published_from >= published_before:
        raise HTTPException(status_code=400, detail=MSG_PUBLISHED_DATE_RANGE)
    conditions: list[ColumnElement[bool]] = [
        BoardPost.tenant_id == tenant_id,
        Board.deleted_at.is_(None),
        BoardPost.deleted_at.is_not(None) if trash else BoardPost.deleted_at.is_(None),
    ]
    if board_id:
        conditions.append(BoardPost.board_id == board_id)
    if category_id:
        conditions.append(BoardPost.category_id == category_id)
    if status:
        conditions.append(BoardPost.status == status)
    if q:
        conditions.append(_title_contains(BoardPost.title, q))
    if author and author.strip():
        name = author.strip()
        # 목록에 표시하는 이름만 검색한다. 탈퇴 회원 이름 표시 정책도 동일하다.
        member_match = (
            select(SiteMember.id)
            .where(
                SiteMember.id == BoardPost.author_member_id,
                SiteMember.tenant_id == tenant_id,
                _title_contains(SiteMember.name, name),
            )
            .exists()
        )
        conditions.append(
            or_(_title_contains(BoardPost.guest_name, name), member_match)
        )
    if created_from:
        conditions.append(BoardPost.created_at >= created_from)
    if created_before:
        conditions.append(BoardPost.created_at < created_before)
    if updated_from:
        conditions.append(BoardPost.updated_at >= updated_from)
    if updated_before:
        conditions.append(BoardPost.updated_at < updated_before)
    if published_from:
        conditions.append(BoardPost.published_at >= published_from)
    if published_before:
        conditions.append(BoardPost.published_at < published_before)
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
    if action == "PUBLISH":
        await field_service.ensure_publishable(db, [(p, b) for p, b in rows])
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


def _public_board(
    board: Board, categories: list[dict], hospital: bool, member_on: bool
) -> dict:
    """홈페이지가 받는 게시판 — 쓰기 값은 지금 실제로 열리는지로 (T-152).

    저장값이 회원도 · 비회원 허용이어도 병원 업종 · 회원 기능 꺼짐 · 회원만 읽기면
    서버가 막으므로, 홈페이지가 [글쓰기] · 비회원 폼을 그리지 않게 꺼서 내보낸다.
    """
    options = board_options(board)
    permissions = options[PERMISSIONS_KEY]
    member_write = permissions["write"] == READ_MEMBER and member_on and not hospital
    guest_write = (
        permissions["write"] == READ_MEMBER
        and permissions["read"] != READ_MEMBER
        and options[OPERATION_KEY]["allow_guest"]
        and not hospital
    )
    return {
        "id": board.id,
        "name": board.name,
        "slug": board.slug,
        "description": (board.settings or {}).get(DESCRIPTION_KEY, ""),
        "board_type": board.board_type,
        PAGE_SIZE_KEY: options[PAGE_SIZE_KEY],
        SEO_TITLE_KEY: options[SEO_TITLE_KEY],
        SEO_DESCRIPTION_KEY: options[SEO_DESCRIPTION_KEY],
        SEO_INDEX_KEY: options[SEO_INDEX_KEY],
        DESIGN_KEY: options[DESIGN_KEY],
        "read_access": permissions["read"],
        "write_access": READ_MEMBER if member_write or guest_write else "ADMIN",
        "allow_secret": options[OPERATION_KEY]["allow_secret"],
        "allow_guest": guest_write,
        "categories": categories,
    }


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
    boards = list(result.scalars())
    categories = await category_service.public_categories(db, [b.id for b in boards])
    tenant = await db.get(Tenant, tenant_id)
    hospital = tenant is None or tenant.template_type == board_access.HOSPITAL
    member_on = tenant is not None and (
        (await member_features.flags_for(db, tenant)).enabled
    )
    return [
        _public_board(board, categories.get(board.id, []), hospital, member_on)
        for board in boards
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
            # 비밀글 (T-151-A) · 회원만 읽는 게시판 (T-150) 의 글은 넣지 않는다
            BoardPost.is_secret.is_(False),
            func.coalesce(Board.settings[PERMISSIONS_KEY]["read"].astext, "PUBLIC")
            != READ_MEMBER,
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


def public_post_item(
    board: Board, post: BoardPost, list_fields: list[BoardField] | None = None
) -> dict:
    """공개 목록의 글 한 줄 — 유형별로 화면이 더 필요한 값까지."""
    # 비밀글은 목록에 제목만 — 요약 · 사진 · 본문 · 칸은 내보내지 않는다 (T-151-A)
    blocks = [] if post.is_secret else post.body or []
    is_card = board.board_type == "CARD" and not post.is_secret
    return {
        "is_secret": post.is_secret,
        "is_guest": post.guest_password_hash is not None,
        "summary": body_summary(blocks, CARD_SUMMARY_LIMIT) if is_card else None,
        "card_fields": (
            field_service.field_values(list_fields or [], post.custom_data or {})
            if is_card
            else None
        ),
        "list_fields": (
            field_service.field_values(list_fields or [], post.custom_data or {})
            if board.board_type in {"LIST", "GALLERY", "FAQ"} and not post.is_secret
            else None
        ),
        "id": post.id,
        "title": post.title,
        "is_pinned": post.is_pinned,
        "published_at": post.published_at,
        "category_id": post.category_id,
        "thumbnail": first_image(blocks),
        "body": blocks if board.board_type == "FAQ" and not post.is_secret else None,
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


def _list_order(board: Board) -> list[UnaryExpression]:
    """고객이 고른 기본 정렬 (T-146) — 상단 고정 글은 언제나 먼저."""
    sort_order = board_options(board)[SORT_ORDER_KEY]
    if sort_order == "OLDEST":
        return [
            BoardPost.is_pinned.desc(),
            BoardPost.published_at.asc(),
            BoardPost.id.asc(),
        ]
    if sort_order == "TITLE":
        return [BoardPost.is_pinned.desc(), BoardPost.title.asc(), BoardPost.id.desc()]
    return _public_order()


def public_page_size(board: Board) -> int:
    return board_options(board)[PAGE_SIZE_KEY] or DEFAULT_PUBLIC_PAGE_SIZE


async def list_public_posts(
    db: AsyncSession,
    board: Board,
    *,
    page: int,
    size: int,
    q: str | None = None,
    latest: bool = False,
    category_id: UUID | None = None,
) -> tuple[list[BoardPost], int, bool]:
    public = _public_conditions(board)
    has_posts = (
        await db.execute(select(BoardPost.id).where(*public).limit(1))
    ).first() is not None
    conditions = [*public, _title_contains(BoardPost.title, q)] if q else public
    if category_id:
        conditions = [*conditions, BoardPost.category_id == category_id]
    total = (
        await db.execute(select(func.count()).select_from(BoardPost).where(*conditions))
    ).scalar_one()
    result = await db.execute(
        select(BoardPost)
        .where(*conditions)
        .order_by(*(_public_order(latest=True) if latest else _list_order(board)))
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(result.scalars().all()), total, has_posts


async def get_public_post(
    db: AsyncSession, board: Board, post_id: UUID
) -> tuple[BoardPost, UUID | None, UUID | None] | None:
    """글과 목록 순서의 이전(더 오래된) · 다음(더 새로운) 글 id.

    이웃 글은 DB 가 창 함수로 찾는다 — 게시판의 글 id 를 전부 읽어 오지 않는다 (T-152).
    """
    order = _public_order()
    ordered = (
        select(
            BoardPost.id.label("id"),
            func.lead(BoardPost.id).over(order_by=order).label("older"),
            func.lag(BoardPost.id).over(order_by=order).label("newer"),
        )
        .where(*_public_conditions(board))
        .subquery()
    )
    row = (
        await db.execute(
            select(ordered.c.older, ordered.c.newer).where(ordered.c.id == post_id)
        )
    ).one_or_none()
    if row is None:
        return None
    post = await db.get(BoardPost, post_id)
    if post is None:
        return None
    return post, row.older, row.newer
