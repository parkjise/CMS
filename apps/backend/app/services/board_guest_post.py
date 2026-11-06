"""비회원 글쓰기 — 이름 · 글 비밀번호로 쓰고 고치고 지운다 (T-151-B, BM-11 · D-08).

- 회원 글쓰기(`write: MEMBER`)를 켜고 운영 설정에서 비회원 글쓰기를 허용한 게시판만.
  병원 업종 · 회원만 읽는 게시판은 막는다
- 글 비밀번호는 bcrypt 해시로만 남긴다. 틀린 비밀번호는 사업체 · IP 해시별 10분 5번 —
  Redis 를 못 쓰면 막는다(비밀번호 맞히기 차단이 먼저)
- 글쓰기는 reCAPTCHA + IP 해시별 1시간 5개. Redis 를 못 쓰면 허용한다
- 남의 글 · 회원 글 · 관리자 글 · 휴지통 글은 없는 글과 같다 (404)
"""

import hashlib
import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import get_redis
from app.core.security import hash_password, verify_password
from app.models.board import Board, BoardPost
from app.models.tenant import Tenant
from app.schemas.board import GuestPostCreate, GuestPostUpdate
from app.services import board as board_service
from app.services import board_access, board_notify, recaptcha
from app.services import board_category as category_service
from app.services import board_field as field_service
from app.services import board_member_post as member_post_service

logger = logging.getLogger(__name__)

MAX_POSTS_PER_HOUR = 5
MAX_WRONG_PASSWORDS = 5
WRONG_PASSWORD_WINDOW = 600
STATUS_PUBLISHED = "PUBLISHED"
# 홈페이지 폼이 토큰을 받을 때 쓰는 이름 — 다른 폼의 토큰은 받지 않는다
RECAPTCHA_ACTION = "board_guest_write"

MSG_GUEST_CLOSED = "이 게시판은 비회원 글쓰기를 받지 않습니다."
MSG_TOO_MANY_POSTS = (
    f"비회원 글은 1시간에 {MAX_POSTS_PER_HOUR}개까지 쓸 수 있습니다. "
    "잠시 뒤 다시 시도해 주세요."
)
MSG_WRONG_PASSWORD = "비밀번호가 맞지 않습니다."
MSG_TOO_MANY_TRIES = "비밀번호를 여러 번 틀렸습니다. 10분 뒤 다시 시도해 주세요."
MSG_TRY_LATER = "잠시 뒤 다시 시도해 주세요."
MSG_POST_NOT_FOUND = "게시글을 찾을 수 없습니다."


def visitor_key(scope: str, value: str | None) -> str:
    """IP · 회원 id 를 서버 비밀값으로 해시한 값 — 원래 값은 남기지 않는다."""
    raw = f"{settings.app_secret_key}:{scope}:{value or 'unknown'}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _too_many(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={"code": "RATE_LIMIT_EXCEEDED", "message": message},
    )


def guest_writing_open(board: Board) -> bool:
    permissions = board_access.permissions_of(board)
    return (
        permissions.write == board_access.MEMBER
        and permissions.read != board_access.MEMBER
        and board_service.operation_of(board).allow_guest
    )


async def _ensure_open(db: AsyncSession, board: Board) -> None:
    if not guest_writing_open(board):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": MSG_GUEST_CLOSED},
        )
    tenant = await db.get(Tenant, board.tenant_id)
    if tenant is None or tenant.template_type == board_access.HOSPITAL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": board_access.MSG_HOSPITAL},
        )


async def _ensure_post_rate(board: Board, ip: str | None) -> None:
    key = f"board:guest-post:{board.tenant_id}:{visitor_key('ip', ip)}"
    try:
        redis = await get_redis()
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, 3600)
    except Exception:  # noqa: BLE001 - 글쓰기 한도는 best-effort (reCAPTCHA 는 그대로)
        logger.warning("비회원 글쓰기 한도 확인 실패 — 허용", exc_info=True)
        return
    if count > MAX_POSTS_PER_HOUR:
        raise _too_many(MSG_TOO_MANY_POSTS)


async def create_post(
    db: AsyncSession, board: Board, data: GuestPostCreate, ip: str | None
) -> BoardPost:
    await _ensure_open(db, board)
    await recaptcha.verify(data.recaptcha_token, action=RECAPTCHA_ACTION)
    await _ensure_post_rate(board, ip)
    member_post_service.check_secret(board, data.is_secret)
    await category_service.check_post_category(db, board.id, data.category_id)
    custom_data = await field_service.resolve_custom_data(
        db, board.id, None, None, STATUS_PUBLISHED
    )
    post = BoardPost(
        tenant_id=board.tenant_id,
        board_id=board.id,
        author_id=None,
        author_member_id=None,
        guest_name=data.name,
        guest_password_hash=hash_password(data.password),
        title=data.title,
        body=member_post_service.body_from_text(data.content),
        status=STATUS_PUBLISHED,
        is_pinned=False,
        is_secret=data.is_secret,
        custom_data=custom_data,
        category_id=data.category_id,
    )
    db.add(post)
    await board_service.after_member_write(db, post)
    if board_service.operation_of(board).notify_new_post:
        await board_notify.notify_new_post(board, post)
    return post


async def _wrong_count(key: str) -> int:
    """틀린 횟수 — Redis 를 못 쓰면 막는다."""
    try:
        redis = await get_redis()
        return int(await redis.get(key) or 0)
    except Exception as e:  # noqa: BLE001
        logger.warning("글 비밀번호 시도 횟수 확인 실패 — 거절", exc_info=True)
        raise _too_many(MSG_TRY_LATER) from e


async def _count_wrong(key: str) -> None:
    try:
        redis = await get_redis()
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, WRONG_PASSWORD_WINDOW)
    except Exception:  # noqa: BLE001
        logger.warning("글 비밀번호 틀린 횟수 기록 실패", exc_info=True)


async def guest_post(
    db: AsyncSession, board: Board, post_id: UUID, password: str, ip: str | None
) -> BoardPost:
    """비밀번호가 맞는 비회원 글 — 없는 글 404, 틀리면 403, 여러 번 틀리면 429."""
    post = (
        await db.execute(
            select(BoardPost).where(
                BoardPost.id == post_id,
                BoardPost.board_id == board.id,
                BoardPost.tenant_id == board.tenant_id,
                BoardPost.guest_password_hash.is_not(None),
                BoardPost.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if post is None or post.guest_password_hash is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=MSG_POST_NOT_FOUND
        )
    # 글마다가 아니라 사업체 · IP 마다 센다 — 여러 글을 돌아가며 맞히지 못하게 (T-152)
    key = f"board:guest-pw:{board.tenant_id}:{visitor_key('ip', ip)}"
    if await _wrong_count(key) >= MAX_WRONG_PASSWORDS:
        raise _too_many(MSG_TOO_MANY_TRIES)
    if not verify_password(password, post.guest_password_hash):
        await _count_wrong(key)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": MSG_WRONG_PASSWORD},
        )
    return post


async def update_post(
    db: AsyncSession, board: Board, post: BoardPost, data: GuestPostUpdate
) -> BoardPost:
    await _ensure_open(db, board)
    if "category_id" in data.model_fields_set:
        await category_service.check_post_category(db, board.id, data.category_id)
        post.category_id = data.category_id
    if data.is_secret is not None:
        member_post_service.check_secret(board, data.is_secret, already=post.is_secret)
        post.is_secret = data.is_secret
    if data.title is not None:
        post.title = data.title
    if data.content is not None:
        post.body = member_post_service.body_from_text(data.content)
    await board_service.after_member_write(db, post)
    return post


async def delete_post(db: AsyncSession, post: BoardPost) -> None:
    """휴지통으로 — 비회원 글쓰기를 꺼도 자기 글은 지울 수 있다."""
    post.deleted_at = datetime.now(UTC)
    await board_service.after_member_write(db, post)


async def guest_post_response(db: AsyncSession, post: BoardPost) -> dict:
    return {
        **member_post_service.member_post_response(post),
        "guest_name": post.guest_name or "",
        "body": post.body or [],
        "fields": await field_service.public_fields(db, post),
    }
