"""T-096 토스페이먼츠 결제 웹훅 수신.

HMAC-SHA256 서명 검증 후 결제 결과를 payment_history에 반영한다.
웹훅은 인증(JWT)이 아니라 서명으로 신뢰를 검증한다.
"""

import base64
import hashlib
import hmac
import json

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy import text, update

from app.core.config import settings
from app.models.billing import PaymentHistory
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/tosspayments", tags=["webhook"])

# 토스 결제 상태 → 내부 상태 매핑
_STATUS_MAP = {
    "DONE": "SUCCESS",
    "CANCELED": "CANCELLED",
    "PARTIAL_CANCELED": "REFUNDED",
    "ABORTED": "FAILED",
    "EXPIRED": "FAILED",
}


def _verify_signature(raw_body: bytes, signature: str | None) -> bool:
    secret = settings.toss_webhook_secret
    if not secret:
        # 시크릿 미설정(로컬) — 검증 스킵
        return True
    if not signature:
        return False
    digest = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, signature)


@router.post("", response_model=ApiResponse[dict])
async def receive_tosspayments_webhook(
    request: Request,
    toss_signature: str | None = Header(None, alias="TossPayments-Signature"),
):
    raw = await request.body()
    if not _verify_signature(raw, toss_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="서명 검증 실패"
        )

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="잘못된 페이로드"
        ) from exc

    data = payload.get("data", payload)
    order_id = data.get("orderId")
    toss_status = data.get("status")
    if not order_id or not toss_status:
        return ApiResponse.ok({"processed": False, "reason": "MISSING_FIELDS"})

    internal_status = _STATUS_MAP.get(toss_status)
    if internal_status is None:
        return ApiResponse.ok({"processed": False, "reason": "IGNORED_STATUS"})

    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        # 웹훅은 테넌트 컨텍스트가 없으므로 슈퍼 어드민 모드로 RLS 우회
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await db.execute(
            update(PaymentHistory)
            .where(PaymentHistory.order_id == order_id)
            .values(
                status=internal_status,
                payment_key=data.get("paymentKey"),
            )
        )
        await db.commit()
        matched = result.rowcount or 0

    return ApiResponse.ok({"processed": True, "matched": matched})
