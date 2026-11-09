"""새 글 알림 (T-151-A, 기획서 BM-11) — 관리자 화면 실시간 알림(SSE).

문의 알림과 같은 채널을 쓴다. 알림이 실패해도 글 저장은 그대로 성공한다.
"""

import json
import logging

from app.core.redis import get_redis
from app.models.board import Board, BoardPost

logger = logging.getLogger(__name__)

# notifications.py 의 구독 채널과 같아야 한다
CHANNEL_PREFIX = "inquiry:new:"


async def _publish(board: Board, payload: dict, what: str) -> None:
    try:
        redis = await get_redis()
        await redis.publish(f"{CHANNEL_PREFIX}{board.tenant_id}", json.dumps(payload))
    except Exception:  # noqa: BLE001
        logger.warning("%s 알림 실패", what, exc_info=True)


async def notify_new_post(board: Board, post: BoardPost) -> None:
    """제목 · 게시판 이름만 보낸다 — 본문 · 작성자 연락처는 넣지 않는다."""
    await _publish(
        board,
        {
            "type": "new_post",
            "board_id": str(board.id),
            "board_name": board.name,
            "post_id": str(post.id),
            "title": post.title,
        },
        "새 글",
    )


async def notify_report(board: Board, post: BoardPost, hidden: bool) -> None:
    """글이 신고되면 늘 알린다 (T-175) — 신고 사유 · 신고자는 넣지 않는다."""
    await _publish(
        board,
        {
            "type": "new_report",
            "board_id": str(board.id),
            "board_name": board.name,
            "post_id": str(post.id),
            "title": post.title,
            "hidden": hidden,
        },
        "신고",
    )
