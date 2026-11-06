"""홈페이지 회원 글쓰기 · 본인 글 수정 · 삭제 (T-150-B, 기획서 BM-10).

- 글은 바로 공개된다. 관리자는 글 관리에서 비공개 · 삭제할 수 있다
- 본문은 글자만 받아 서버가 문단 노드로 만든다 — 서식 · 링크 · 사진 없음
- 남의 글 · 관리자 글 · 휴지통 글은 없는 글과 같다 (404)
- 회원 한 명당 1시간에 MAX_POSTS_PER_HOUR 개까지 (스팸 방지)
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.board import Board, BoardPost
from app.models.site_member import SiteMember
from app.schemas.board import MemberPostCreate, MemberPostUpdate
from app.schemas.rich_body import body_to_text, clean_body, text_to_body
from app.services import board as board_service
from app.services import board_category as category_service
from app.services import board_field as field_service

MAX_POSTS_PER_HOUR = 10
STATUS_PUBLISHED = "PUBLISHED"

MSG_TOO_MANY_POSTS = (
    f"글은 1시간에 {MAX_POSTS_PER_HOUR}개까지 쓸 수 있습니다. "
    "잠시 뒤 다시 시도해 주세요."
)
MSG_POST_NOT_FOUND = "게시글을 찾을 수 없습니다."


def _body(content: str) -> list[dict]:
    try:
        return clean_body(text_to_body(content))
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "VALIDATION_ERROR", "message": str(e), "field": "content"},
        ) from e


def member_post_response(post: BoardPost) -> dict:
    return {
        "id": post.id,
        "title": post.title,
        "content": body_to_text(post.body or []),
        "category_id": post.category_id,
    }


async def _ensure_rate(db: AsyncSession, member: SiteMember) -> None:
    since = datetime.now(UTC) - timedelta(hours=1)
    count = (
        await db.execute(
            select(func.count())
            .select_from(BoardPost)
            .where(
                BoardPost.author_member_id == member.id,
                BoardPost.created_at >= since,
            )
        )
    ).scalar_one()
    if count >= MAX_POSTS_PER_HOUR:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "RATE_LIMIT_EXCEEDED", "message": MSG_TOO_MANY_POSTS},
        )


async def create_post(
    db: AsyncSession, board: Board, member: SiteMember, data: MemberPostCreate
) -> BoardPost:
    await _ensure_rate(db, member)
    await category_service.check_post_category(db, board.id, data.category_id)
    # 회원 폼에는 추가 칸이 없다 — 기본값만 채운다. 필수 칸이 있으면 여기서 막힌다
    custom_data = await field_service.resolve_custom_data(
        db, board.id, None, None, STATUS_PUBLISHED
    )
    post = BoardPost(
        tenant_id=board.tenant_id,
        board_id=board.id,
        author_id=None,
        author_member_id=member.id,
        title=data.title,
        body=_body(data.content),
        status=STATUS_PUBLISHED,
        is_pinned=False,
        custom_data=custom_data,
        category_id=data.category_id,
    )
    db.add(post)
    await board_service.after_member_write(db, post)
    return post


async def own_post(
    db: AsyncSession, board: Board, member: SiteMember, post_id: UUID
) -> BoardPost:
    """이 회원이 쓴, 휴지통에 없는 글 — 아니면 404 (남의 글인지 알려 주지 않는다)."""
    post = (
        await db.execute(
            select(BoardPost).where(
                BoardPost.id == post_id,
                BoardPost.board_id == board.id,
                BoardPost.tenant_id == board.tenant_id,
                BoardPost.author_member_id == member.id,
                BoardPost.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if post is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=MSG_POST_NOT_FOUND
        )
    return post


async def update_post(
    db: AsyncSession, board: Board, post: BoardPost, data: MemberPostUpdate
) -> BoardPost:
    if "category_id" in data.model_fields_set:
        await category_service.check_post_category(db, board.id, data.category_id)
        post.category_id = data.category_id
    if data.title is not None:
        post.title = data.title
    if data.content is not None:
        post.body = _body(data.content)
    await board_service.after_member_write(db, post)
    return post


async def delete_post(db: AsyncSession, post: BoardPost) -> None:
    """휴지통으로 — 관리자는 휴지통에서 볼 수 있다."""
    post.deleted_at = datetime.now(UTC)
    await board_service.after_member_write(db, post)


async def member_names(db: AsyncSession, member_ids: set[UUID]) -> dict[UUID, str]:
    """관리자 글 목록의 작성 회원 이름 — 탈퇴한 회원도 이름은 보인다."""
    if not member_ids:
        return {}
    rows = await db.execute(
        select(SiteMember.id, SiteMember.name).where(SiteMember.id.in_(member_ids))
    )
    return {member_id: name for member_id, name in rows.all()}
