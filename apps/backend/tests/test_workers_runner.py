"""T-177 Celery 태스크 실행 도우미 — 태스크가 끝나면 DB 풀 · Redis 연결을 정리."""

from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.workers import runner
from tests.conftest import TEST_DATABASE_URL

WORKERS_DIR = Path(runner.__file__).parent


async def _value() -> int:
    return 7


async def _boom() -> None:
    raise ValueError("실패")


class TestCleanup:
    def test_returns_result_and_cleans_up(self):
        with (
            patch.object(runner, "engine", AsyncMock()) as engine,
            patch.object(runner, "close_redis", AsyncMock()) as close_redis,
        ):
            assert runner.run_async(_value()) == 7
        engine.dispose.assert_awaited_once()
        close_redis.assert_awaited_once()

    def test_cleans_up_when_task_fails(self):
        with (
            patch.object(runner, "engine", AsyncMock()) as engine,
            patch.object(runner, "close_redis", AsyncMock()) as close_redis,
        ):
            with pytest.raises(ValueError, match="실패"):
                runner.run_async(_boom())
        engine.dispose.assert_awaited_once()
        close_redis.assert_awaited_once()


class TestPoolAcrossTasks:
    def test_consecutive_tasks_leave_no_pooled_connection(self):
        """태스크마다 새 루프여도 앞 태스크 커넥션이 풀에 남지 않는다."""
        engine = create_async_engine(TEST_DATABASE_URL)

        async def _query() -> int:
            async with engine.connect() as conn:
                return (await conn.execute(text("SELECT 1"))).scalar_one()

        try:
            with (
                patch.object(runner, "engine", engine),
                patch.object(runner, "close_redis", AsyncMock()),
            ):
                for _ in range(3):
                    assert runner.run_async(_query()) == 1
                    assert engine.pool.checkedin() == 0
        finally:
            engine.sync_engine.dispose()


def test_workers_do_not_call_asyncio_run_directly():
    """새 태스크도 run_async 를 쓰게 지킨다 — asyncio.run 은 runner.py 에만."""
    offenders = [
        p.name
        for p in WORKERS_DIR.glob("*.py")
        if p.name != "runner.py" and "asyncio.run(" in p.read_text()
    ]
    assert offenders == []
