import asyncio

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.core.deps import get_current_user
from app.core.redis import get_redis
from app.models.user import User

router = APIRouter(prefix="/notifications", tags=["notifications"])

_CHANNEL_PREFIX = "inquiry:new:"
_KEEPALIVE_INTERVAL = 20


@router.get("/stream")
async def stream_notifications(
    current_user: User = Depends(get_current_user),
):
    channel = f"{_CHANNEL_PREFIX}{current_user.tenant_id}"

    async def event_generator():
        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            yield "data: {\"type\": \"connected\"}\n\n"
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
        except asyncio.TimeoutError:
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
