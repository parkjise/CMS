"""Celery 태스크의 비동기 본문 실행 도우미 (T-177).

태스크마다 asyncio.run() 으로 이벤트 루프를 새로 만들면, 앞 태스크가 쓴
DB 풀 · Redis 커넥션이 닫힌 루프에 묶인 채 남는다. 다음 태스크가 그 커넥션을
닫으려 하면 "Event loop is closed" 가 나고, DB 쪽 커넥션은 끝내 닫히지 않아
"idle in transaction" 으로 쌓인다. 그래서 본문이 끝나면 같은 루프 안에서
풀과 Redis 연결을 정리한다.
"""

import asyncio
from collections.abc import Coroutine
from typing import Any, TypeVar

from app.core.redis import close_redis
from app.db.session import engine

T = TypeVar("T")


async def _run_and_cleanup(coro: Coroutine[Any, Any, T]) -> T:
    try:
        return await coro
    finally:
        await engine.dispose()
        await close_redis()


def run_async(coro: Coroutine[Any, Any, T]) -> T:
    """asyncio.run 대신 사용 — 끝나면 DB 풀 · Redis 연결을 같은 루프에서 닫는다."""
    return asyncio.run(_run_and_cleanup(coro))
