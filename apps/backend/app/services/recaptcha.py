"""reCAPTCHA v3 확인 — 상담 접수 · 비회원 글쓰기가 같이 쓴다.

비밀 키가 없으면(개발 환경) 확인하지 않는다. 운영은 설정 검사가 키를 요구한다.
action 을 주면 그 폼에서 받은 토큰만 받는다 — 다른 폼 토큰을 다시 쓰지 못하게 (T-152).
"""

import logging

import httpx
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"
MSG_UNAVAILABLE = "자동 등록 방지 확인에 실패했습니다. 잠시 뒤 다시 시도해 주세요."


async def verify(token: str | None, action: str | None = None) -> None:
    if not settings.recaptcha_secret_key:
        return
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="RECAPTCHA_REQUIRED"
        )
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(
                VERIFY_URL,
                data={"secret": settings.recaptcha_secret_key, "response": token},
            )
        result = resp.json()
    except (httpx.HTTPError, ValueError) as e:
        # Google 장애 — 서버 오류(500) 대신 다시 시도해 달라고 알린다
        logger.warning("reCAPTCHA 확인 실패", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "RECAPTCHA_UNAVAILABLE",
                "message": MSG_UNAVAILABLE,
            },
        ) from e
    score_ok = result.get("score", 0) >= settings.recaptcha_min_score
    action_ok = action is None or result.get("action") == action
    if not result.get("success") or not score_ok or not action_ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="RECAPTCHA_FAILED"
        )
