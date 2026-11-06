"""reCAPTCHA v3 확인 — 상담 접수 · 비회원 글쓰기가 같이 쓴다.

비밀 키가 없으면(개발 환경) 확인하지 않는다. 운영은 설정 검사가 키를 요구한다.
"""

import httpx
from fastapi import HTTPException, status

from app.core.config import settings

VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"


async def verify(token: str | None) -> None:
    if not settings.recaptcha_secret_key:
        return
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="RECAPTCHA_REQUIRED"
        )
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.post(
            VERIFY_URL,
            data={"secret": settings.recaptcha_secret_key, "response": token},
        )
    result = resp.json()
    score_ok = result.get("score", 0) >= settings.recaptcha_min_score
    if not result.get("success") or not score_ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="RECAPTCHA_FAILED"
        )
