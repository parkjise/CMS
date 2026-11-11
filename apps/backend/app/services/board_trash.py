"""게시판 · 글 휴지통 보관 기간과 영구 삭제 (T-196, 게시판 모듈 기획서 D-06).

휴지통에 넣은 지 30일이 지나면 실제로 지운다 — CLAUDE.md 6 소프트 삭제 원칙의 예외.
변경 기록(audit_logs)에는 제목만 남는다. 게시판을 지우면 글 · 필드 · 카테고리가, 글을
지우면 이전 버전 · 신고 · 첨부 연결이 함께 지워진다(DB CASCADE). 사진 · 첨부 파일은
연결이 사라지므로 미사용 정리(T-193 · T-194)가 저장소에서 지운다.
"""

from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.board import Board, BoardPost
from app.models.user import User
from app.services import site_cache

TRASH_RETENTION_DAYS = 30
# 자동 정리는 사람이 아니다 — 변경 기록에 "자동 정리"로 보인다
SYSTEM_ACTOR_ID = UUID(int=0)
SYSTEM_ROLE = "SYSTEM"
SUPER_ADMIN_ROLE = "SUPER_ADMIN"
DELETER_OPERATOR = "운영사"
DELETER_SYSTEM = "자동 정리"

MSG_NOT_IN_TRASH = "휴지통에 있는 글만 영구 삭제할 수 있습니다."


def purge_at(deleted_at: datetime | None) -> datetime | None:
    """이 날 이후 자동으로 영구 삭제된다."""
    return deleted_at + timedelta(days=TRASH_RETENTION_DAYS) if deleted_at else None


def _log(
    db: AsyncSession,
    tenant_id: UUID,
    actor_id: UUID,
    actor_role: str,
    action: str,
    target_type: str,
    target_id: UUID,
    title: str,
) -> None:
    db.add(
        AuditLog(
            tenant_id=tenant_id,
            actor_id=actor_id,
            actor_role=actor_role,
            action=action,
            target_type=target_type,
            target_id=str(target_id),
            after_value={"name" if target_type == "board" else "title": title},
        )
    )


async def purge_post(db: AsyncSession, post: BoardPost, actor: User) -> None:
    """휴지통의 글 하나를 바로 영구 삭제한다."""
    if post.deleted_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=MSG_NOT_IN_TRASH
        )
    _log(
        db,
        post.tenant_id,
        actor.id,
        actor.role,
        "POST_PURGED",
        "board_post",
        post.id,
        post.title,
    )
    await db.execute(delete(BoardPost).where(BoardPost.id == post.id))
    await db.commit()
    await site_cache.purge_site(db, post.tenant_id)


async def purge_board(db: AsyncSession, board: Board, actor: User) -> None:
    """휴지통의 게시판을 바로 영구 삭제한다 — 글 · 필드 · 카테고리도 함께."""
    if board.deleted_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=MSG_NOT_IN_TRASH
        )
    _log(
        db,
        board.tenant_id,
        actor.id,
        actor.role,
        "BOARD_PURGED",
        "board",
        board.id,
        board.name,
    )
    await db.execute(delete(Board).where(Board.id == board.id))
    await db.commit()
    await site_cache.purge_site(db, board.tenant_id)


async def purge_expired(
    db: AsyncSession, now: datetime | None = None
) -> dict[str, int]:
    """휴지통에 30일 넘게 있던 게시판 · 글을 모든 사업체에서 지운다 (매일 작업).

    부르는 쪽이 슈퍼 어드민 RLS 컨텍스트를 연다. 지운 개수를 돌려준다.
    """
    cutoff = (now or datetime.now(UTC)) - timedelta(days=TRASH_RETENTION_DAYS)
    boards = list(
        (
            await db.execute(
                select(Board.id, Board.tenant_id, Board.name).where(
                    Board.deleted_at.is_not(None), Board.deleted_at < cutoff
                )
            )
        ).all()
    )
    board_ids = {board_id for board_id, _tenant, _name in boards}
    posts = [
        row
        for row in (
            await db.execute(
                select(
                    BoardPost.id,
                    BoardPost.tenant_id,
                    BoardPost.title,
                    BoardPost.board_id,
                ).where(
                    BoardPost.deleted_at.is_not(None), BoardPost.deleted_at < cutoff
                )
            )
        ).all()
        # 게시판째 지우는 글은 게시판과 함께 사라진다
        if row.board_id not in board_ids
    ]
    for board_id, tenant_id, name in boards:
        _log(
            db,
            tenant_id,
            SYSTEM_ACTOR_ID,
            SYSTEM_ROLE,
            "BOARD_PURGED",
            "board",
            board_id,
            name,
        )
    for post_id, tenant_id, title, _board_id in posts:
        _log(
            db,
            tenant_id,
            SYSTEM_ACTOR_ID,
            SYSTEM_ROLE,
            "POST_PURGED",
            "board_post",
            post_id,
            title,
        )
    if posts:
        await db.execute(
            delete(BoardPost).where(BoardPost.id.in_([row.id for row in posts]))
        )
    if board_ids:
        await db.execute(delete(Board).where(Board.id.in_(board_ids)))
    await db.commit()
    for tenant_id in {row[1] for row in boards} | {row.tenant_id for row in posts}:
        await site_cache.purge_site(db, tenant_id)
    return {"boards": len(boards), "posts": len(posts)}


async def deleted_by(
    db: AsyncSession,
    tenant_id: UUID,
    target_type: str,
    targets: Iterable[tuple[UUID, datetime | None]],
) -> dict[UUID, str]:
    """휴지통에 넣은 사람 — 변경 기록에서 찾는다. 못 찾으면 빠진다.

    글은 낱개 삭제(POST_DELETED)와 일괄 삭제(POST_BULK_TRASH, post_ids 목록) 둘 다 본다.
    """
    wanted = {target_id: deleted for target_id, deleted in targets if deleted}
    if not wanted:
        return {}
    actions = (
        ["BOARD_DELETED"]
        if target_type == "board"
        else ["POST_DELETED", "POST_BULK_TRASH"]
    )
    since = min(wanted.values()) - timedelta(minutes=5)
    logs = (
        (
            await db.execute(
                select(AuditLog)
                .where(
                    AuditLog.tenant_id == tenant_id,
                    AuditLog.action.in_(actions),
                    AuditLog.created_at >= since,
                )
                .order_by(AuditLog.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    found: dict[UUID, AuditLog] = {}
    keys = {str(target_id): target_id for target_id in wanted}
    for log in logs:
        ids = (
            (log.after_value or {}).get("post_ids", [])
            if log.action == "POST_BULK_TRASH"
            else [log.target_id]
        )
        for raw in ids:
            target_id = keys.get(str(raw))
            if target_id is not None and target_id not in found:
                found[target_id] = log
    actor_ids = {log.actor_id for log in found.values()}
    emails: dict[UUID, str] = {}
    if actor_ids:
        rows = await db.execute(
            select(User.id, User.email).where(
                User.tenant_id == tenant_id, User.id.in_(actor_ids)
            )
        )
        emails = {row[0]: row[1] for row in rows}
    result: dict[UUID, str] = {}
    for target_id, log in found.items():
        if log.actor_role == SUPER_ADMIN_ROLE:
            result[target_id] = DELETER_OPERATOR
        elif log.actor_id in emails:
            result[target_id] = emails[log.actor_id]
    return result
