"""글 신고 (T-151-B, 기획서 BM-11).

- 공개된 글만 신고한다. 같은 사람(회원 id 또는 IP 의 해시)은 한 글에 한 번
- 처리 안 된 신고가 운영 설정의 기준(기본 5, 0 은 안 숨김)이 되면 글을 비공개로 —
  관리자가 되돌린다. 신고될 때마다 관리자 화면에 알린다 (T-175)
- 신고 요청은 IP 해시별 1시간 MAX_REPORTS_PER_HOUR 개 (Redis 장애 시 허용)
"""

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.models.board import Board, BoardPost, BoardPostReport
from app.schemas.board import ReportAction, ReportCreate
from app.services import board as board_service
from app.services import board_notify, site_cache

logger = logging.getLogger(__name__)

MAX_REPORTS_PER_HOUR = 10
DETAILS_SHOWN = 5
OPEN = "OPEN"
CLOSED = "CLOSED"
STATUS_PUBLISHED = "PUBLISHED"
STATUS_PRIVATE = "PRIVATE"

MSG_ALREADY_REPORTED = "이미 신고한 글입니다."
MSG_TOO_MANY = "신고가 너무 잦습니다. 잠시 뒤 다시 시도해 주세요."
MSG_POST_NOT_FOUND = "게시글을 찾을 수 없습니다."
MSG_NOTHING_TO_RESOLVE = "처리할 신고가 없습니다."


async def _ensure_rate(tenant_id: UUID, ip_key: str) -> None:
    key = f"board:report:{tenant_id}:{ip_key}"
    try:
        redis = await get_redis()
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, 3600)
    except Exception:  # noqa: BLE001 - best-effort
        logger.warning("신고 한도 확인 실패 — 허용", exc_info=True)
        return
    if count > MAX_REPORTS_PER_HOUR:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "RATE_LIMIT_EXCEEDED", "message": MSG_TOO_MANY},
        )


async def report_post(
    db: AsyncSession,
    board: Board,
    post_id: UUID,
    data: ReportCreate,
    reporter_key: str,
    ip_key: str,
) -> bool:
    """신고를 남기고, 이번 신고로 글을 숨겼으면 True."""
    await _ensure_rate(board.tenant_id, ip_key)
    post = (
        await db.execute(
            select(BoardPost).where(
                BoardPost.id == post_id,
                BoardPost.board_id == board.id,
                BoardPost.tenant_id == board.tenant_id,
                BoardPost.status == STATUS_PUBLISHED,
                BoardPost.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if post is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=MSG_POST_NOT_FOUND
        )
    db.add(
        BoardPostReport(
            tenant_id=board.tenant_id,
            post_id=post.id,
            reason=data.reason,
            detail=data.detail.strip(),
            reporter_key=reporter_key,
        )
    )
    try:
        await db.flush()
    except IntegrityError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "CONFLICT", "message": MSG_ALREADY_REPORTED},
        ) from e
    open_count = (
        await db.execute(
            select(func.count())
            .select_from(BoardPostReport)
            .where(BoardPostReport.post_id == post.id, BoardPostReport.status == OPEN)
        )
    ).scalar_one()
    hide_count = board_service.operation_of(board).report_hide_count
    hidden = hide_count > 0 and open_count >= hide_count
    if hidden:
        post.status = STATUS_PRIVATE
    await db.commit()
    if hidden:
        await site_cache.purge_site(db, board.tenant_id)
    await board_notify.notify_report(board, post, hidden)
    return hidden


async def list_reported(db: AsyncSession, tenant_id: UUID) -> list[dict]:
    """처리하지 않은 신고가 있는 글 — 최근 신고 순."""
    rows = (
        await db.execute(
            select(BoardPostReport, BoardPost, Board.name)
            .join(BoardPost, BoardPost.id == BoardPostReport.post_id)
            .join(Board, Board.id == BoardPost.board_id)
            .where(
                BoardPostReport.tenant_id == tenant_id,
                BoardPostReport.status == OPEN,
            )
            .order_by(BoardPostReport.created_at.desc())
        )
    ).all()
    by_post: dict[UUID, dict] = {}
    for report, post, board_name in rows:
        item = by_post.setdefault(
            post.id,
            {
                "post_id": post.id,
                "board_id": post.board_id,
                "board_name": board_name,
                "title": post.title,
                "status": post.status,
                "deleted": post.deleted_at is not None,
                "report_count": 0,
                "reasons": {},
                "details": [],
                "latest_at": report.created_at,
            },
        )
        item["report_count"] += 1
        item["reasons"][report.reason] = item["reasons"].get(report.reason, 0) + 1
        if report.detail and len(item["details"]) < DETAILS_SHOWN:
            item["details"].append(report.detail)
    return list(by_post.values())


async def resolve(
    db: AsyncSession, tenant_id: UUID, post_id: UUID, action: ReportAction
) -> BoardPost:
    """신고를 닫고 글을 처리한다 — 그대로 두기 · 다시 공개 · 비공개 · 휴지통."""
    post = (
        await db.execute(
            select(BoardPost).where(
                BoardPost.id == post_id, BoardPost.tenant_id == tenant_id
            )
        )
    ).scalar_one_or_none()
    if post is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=MSG_POST_NOT_FOUND
        )
    closed = await db.execute(
        update(BoardPostReport)
        .where(BoardPostReport.post_id == post.id, BoardPostReport.status == OPEN)
        .values(status=CLOSED, updated_at=datetime.now(UTC))
    )
    if not closed.rowcount:  # type: ignore[attr-defined]
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "CONFLICT", "message": MSG_NOTHING_TO_RESOLVE},
        )
    if action == "PUBLISH":
        post.status = STATUS_PUBLISHED
        post.published_at = post.published_at or datetime.now(UTC)
    elif action == "HIDE":
        post.status = STATUS_PRIVATE
    elif action == "DELETE":
        post.deleted_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(post)
    await site_cache.purge_site(db, tenant_id)
    return post
