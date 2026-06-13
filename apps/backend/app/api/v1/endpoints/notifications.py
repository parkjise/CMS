import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials

from app.core.deps import bearer
from app.core.redis import get_redis
from app.core.security import decode_token

router = APIRouter(prefix="/notifications", tags=["notifications"])

_CHANNEL_PREFIX = "inquiry:new:"
_KEEPALIVE_INTERVAL = 20


def _tenant_id_from_token(token: str) -> UUID:
    """JWT를 검증하고 tenant_id를 반환. EventSource의 헤더 미지원 한계 대응."""
    try:
        payload = decode_token(token)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED"
        )
    tenant_id_str = payload.get("tenant_id")
    if not tenant_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED"
        )
    return UUID(tenant_id_str)


def _resolve_tenant_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    token: str | None = Query(None, description="SSE 전용: EventSource는 헤더 미지원"),
) -> UUID:
    """Authorization 헤더 우선, 없으면 ?token=쿼리 파라미터에서 토큰 추출."""
    raw_token: str | None = None
    if credentials and credentials.credentials:
        raw_token = credentials.credentials
    elif token:
        raw_token = token
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED"
        )
    return _tenant_id_from_token(raw_token)


@router.get("/stream")
async def stream_notifications(
    tenant_id: UUID = Depends(_resolve_tenant_id),
):
    channel = f"{_CHANNEL_PREFIX}{tenant_id}"

    async def event_generator():
        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            yield 'data: {"type": "connected"}\n\n'
            while True:
                # Wait up to keepalive interval for a message
                msg = await asyncio.wait_for(
                    pubsub.get_message(ignore_subscribe_messages=True),
                    timeout=_KEEPALIVE_INTERVAL,
                )
                if msg and msg["type"] == "message":
                    yield f"data: {msg['data']}\n\n"
                else:
                    yield ": keepalive\n\n"
        except TimeoutError:
            yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
