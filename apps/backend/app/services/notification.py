"""카카오 알림톡 / SMS 발송 서비스 (네이버 클라우드 SENS).

테스트 모드(`settings.notification_mode != "live"`)에서는 외부 API 호출 없이
True를 반환하는 stub으로 동작한다. 실제 발송은 live 모드에서만 일어난다.
"""

import base64
import hashlib
import hmac
import time
from datetime import datetime
from uuid import UUID

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.sns import NotificationSetting
from app.models.tenant import Tenant
from app.services import feature as feature_service

# 플랜별 월간 발송 한도 (BASIC은 알림톡 자체 미허용)
PLAN_MONTHLY_LIMITS: dict[str, int] = {
    "BASIC": 0,
    "STANDARD": 100,
    "PREMIUM": 1_000_000,  # 사실상 무제한
}

_SENS_BASE_URL = "https://sens.apigw.ntruss.com"


class NotificationError(RuntimeError):
    """알림 발송 관련 일반 에러"""


class MonthlyLimitExceeded(NotificationError):
    """월간 발송 한도 초과"""


# ── 보조 유틸 ─────────────────────────────────────────────────────────────


def mask_phone(phone: str | None) -> str:
    """010-1234-5678 → 010-****-5678. 잘못된 형식이면 원본 반환."""
    if not phone:
        return ""
    parts = phone.split("-")
    if len(parts) != 3:
        return phone
    masked_middle = "*" * len(parts[1])
    return f"{parts[0]}-{masked_middle}-{parts[2]}"


def format_kr_time(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M")


# 단문(SMS)은 90바이트 (한글 2바이트) — 넘으면 장문(LMS, 2,000바이트)
_SMS_MAX_BYTES = 90


def sms_type(message: str) -> str:
    size = len(message.encode("euc-kr", errors="replace"))
    return "SMS" if size <= _SMS_MAX_BYTES else "LMS"


def _sens_signature(method: str, uri: str, timestamp: str) -> str:
    """NCloud SENS HMAC-SHA256 서명 생성."""
    msg = f"{method} {uri}\n{timestamp}\n{settings.ncloud_sens_access_key}"
    digest = hmac.new(
        settings.ncloud_sens_secret_key.encode(),
        msg.encode(),
        hashlib.sha256,
    ).digest()
    return base64.b64encode(digest).decode()


def _is_live() -> bool:
    return settings.notification_mode == "live"


# ── 발송 함수 ─────────────────────────────────────────────────────────────


async def send_kakao_alimtalk(
    to: str,
    template_code: str,
    variables: dict[str, str],
) -> bool:
    """알림톡 발송. 성공 시 True, 실패 시 False."""
    if not _is_live():
        return True  # 테스트 모드 stub

    if not settings.ncloud_sens_service_id:
        return False

    timestamp = str(int(time.time() * 1000))
    uri = f"/alimtalk/v2/services/{settings.ncloud_sens_service_id}/messages"
    signature = _sens_signature("POST", uri, timestamp)

    # 변수 치환된 본문 생성 (#{key} → value)
    content_template = "\n".join(f"{k}: {v}" for k, v in variables.items())

    payload = {
        "plusFriendId": settings.kakao_sender_key,
        "templateCode": template_code,
        "messages": [
            {
                "countryCode": "82",
                "to": to.replace("-", ""),
                "content": content_template,
            }
        ],
    }
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "x-ncp-apigw-timestamp": timestamp,
        "x-ncp-iam-access-key": settings.ncloud_sens_access_key,
        "x-ncp-apigw-signature-v2": signature,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{_SENS_BASE_URL}{uri}", json=payload, headers=headers
            )
        return resp.status_code in (200, 202)
    except httpx.HTTPError:
        return False


async def send_sms(to: str, message: str) -> bool:
    """SMS 발송. 성공 시 True, 실패 시 False."""
    if not _is_live():
        return True

    if not settings.ncloud_sens_sms_service_id:
        return False

    timestamp = str(int(time.time() * 1000))
    uri = f"/sms/v2/services/{settings.ncloud_sens_sms_service_id}/messages"
    signature = _sens_signature("POST", uri, timestamp)

    payload = {
        "type": sms_type(message),
        "from": settings.ncloud_sens_from_no,
        "content": message,
        "messages": [{"to": to.replace("-", "")}],
    }
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "x-ncp-apigw-timestamp": timestamp,
        "x-ncp-iam-access-key": settings.ncloud_sens_access_key,
        "x-ncp-apigw-signature-v2": signature,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{_SENS_BASE_URL}{uri}", json=payload, headers=headers
            )
        return resp.status_code in (200, 202)
    except httpx.HTTPError:
        return False


# ── 비즈니스 로직 ─────────────────────────────────────────────────────────


async def check_monthly_limit(
    db: AsyncSession, tenant_id: UUID, plan_type: str
) -> None:
    """플랜별 월 한도를 초과하면 MonthlyLimitExceeded 발생."""
    limit = PLAN_MONTHLY_LIMITS.get(plan_type, PLAN_MONTHLY_LIMITS["BASIC"])
    if limit == 0:
        raise MonthlyLimitExceeded(
            "현재 플랜에서는 알림 발송 기능을 사용할 수 없습니다."
        )

    result = await db.execute(
        select(NotificationSetting.monthly_kakao_count).where(
            NotificationSetting.tenant_id == tenant_id
        )
    )
    current = result.scalar_one_or_none() or 0
    if current >= limit:
        raise MonthlyLimitExceeded(f"이번 달 발송 한도({limit}건)를 초과했습니다.")


async def increment_monthly_count(db: AsyncSession, tenant_id: UUID) -> None:
    await db.execute(
        update(NotificationSetting)
        .where(NotificationSetting.tenant_id == tenant_id)
        .values(monthly_kakao_count=NotificationSetting.monthly_kakao_count + 1)
    )
    await db.commit()


async def _get_plan_type(db: AsyncSession, tenant_id: UUID) -> str:
    result = await db.execute(select(Tenant.plan_type).where(Tenant.id == tenant_id))
    return result.scalar_one_or_none() or "BASIC"


async def _kakao_on(db: AsyncSession, tenant_id: UUID) -> bool:
    return await feature_service.is_enabled(db, tenant_id, "KAKAO_NOTIFICATION")


async def notify_inquiry(
    db: AsyncSession,
    tenant_id: UUID,
    inquiry_name: str,
    inquiry_phone: str,
    inquiry_type: str,
    inquiry_created_at: datetime,
    tenant_name: str = "사이트",
) -> dict:
    """
    문의 접수 알림. 알림톡 시도 → 실패하면 SMS fallback.
    반환: {"kakao_sent": bool, "sms_sent": bool, "skipped": bool, "reason": str}
    """
    result = await db.execute(
        select(NotificationSetting).where(NotificationSetting.tenant_id == tenant_id)
    )
    setting = result.scalar_one_or_none()
    if setting is None:
        return {
            "kakao_sent": False,
            "sms_sent": False,
            "skipped": True,
            "reason": "NO_SETTING",
        }

    plan_type = await _get_plan_type(db, tenant_id)
    try:
        await check_monthly_limit(db, tenant_id, plan_type)
    except MonthlyLimitExceeded as e:
        return {
            "kakao_sent": False,
            "sms_sent": False,
            "skipped": True,
            "reason": str(e),
        }

    kakao_sent = False
    sms_sent = False

    # 플래그를 꺼도 문자는 보낸다 — 문의 알림이 끊기면 고객이 문의를 놓친다 (T-138)
    if (
        setting.alimtalk_enabled
        and setting.recipient_phone
        and await _kakao_on(db, tenant_id)
    ):
        kakao_sent = await send_kakao_alimtalk(
            to=setting.recipient_phone,
            template_code="INQUIRY_ALERT_V1",
            variables={
                "사이트명": tenant_name,
                "이름": inquiry_name,
                "문의유형": inquiry_type,
                "연락처": mask_phone(inquiry_phone),
                "접수시각": format_kr_time(inquiry_created_at),
            },
        )

    # 알림톡 실패 또는 비활성화 시 SMS fallback
    if not kakao_sent and setting.sms_enabled and setting.recipient_phone:
        sms_sent = await send_sms(
            to=setting.recipient_phone,
            message=(
                f"[{tenant_name}] 새 문의: {inquiry_name} ({mask_phone(inquiry_phone)})"
            ),
        )

    if kakao_sent or sms_sent:
        await increment_monthly_count(db, tenant_id)

    return {
        "kakao_sent": kakao_sent,
        "sms_sent": sms_sent,
        "skipped": False,
        "reason": "",
    }


async def notify_member_joined(
    db: AsyncSession,
    tenant_id: UUID,
    member_name: str,
    member_phone: str | None,
    joined_at: datetime,
    tenant_name: str = "사이트",
) -> dict:
    """신규 방문자 회원 가입 알림 (T-108, 기획서 16.3).

    알림톡 → 실패하면 SMS. 관리자 알림 설정이 꺼져 있거나 월 한도를 넘으면 건너뛴다.
    """
    result = await db.execute(
        select(NotificationSetting).where(NotificationSetting.tenant_id == tenant_id)
    )
    setting = result.scalar_one_or_none()
    if setting is None or not setting.recipient_phone:
        return {
            "kakao_sent": False,
            "sms_sent": False,
            "skipped": True,
            "reason": "NO_SETTING",
        }
    if not (setting.alimtalk_enabled or setting.sms_enabled):
        return {
            "kakao_sent": False,
            "sms_sent": False,
            "skipped": True,
            "reason": "DISABLED",
        }

    plan_type = await _get_plan_type(db, tenant_id)
    try:
        await check_monthly_limit(db, tenant_id, plan_type)
    except MonthlyLimitExceeded as e:
        return {
            "kakao_sent": False,
            "sms_sent": False,
            "skipped": True,
            "reason": str(e),
        }

    kakao_sent = False
    sms_sent = False
    if setting.alimtalk_enabled and await _kakao_on(db, tenant_id):
        kakao_sent = await send_kakao_alimtalk(
            to=setting.recipient_phone,
            template_code="MEMBER_JOINED_V1",
            variables={
                "사이트명": tenant_name,
                "이름": member_name,
                "연락처": mask_phone(member_phone),
                "가입시각": format_kr_time(joined_at),
            },
        )
    if not kakao_sent and setting.sms_enabled:
        sms_sent = await send_sms(
            to=setting.recipient_phone,
            message=f"[{tenant_name}] 신규 회원 가입! {member_name}",
        )
    if kakao_sent or sms_sent:
        await increment_monthly_count(db, tenant_id)
    return {
        "kakao_sent": kakao_sent,
        "sms_sent": sms_sent,
        "skipped": False,
        "reason": "",
    }


async def send_inquiry_reply(
    db: AsyncSession,
    tenant_id: UUID,
    to: str,
    customer_name: str,
    message: str,
    tenant_name: str = "사이트",
) -> str | None:
    """문의자에게 답장 (T-203, AD-04-M). 알림톡 → 실패 · 꺼짐이면 문자.

    보낸 채널(KAKAO | SMS)을 돌려주고, 둘 다 실패하면 None.
    요금제 한도를 넘으면 MonthlyLimitExceeded — 문의 알림과 같은 월 한도를 쓴다.
    """
    plan_type = await _get_plan_type(db, tenant_id)
    await check_monthly_limit(db, tenant_id, plan_type)

    channel: str | None = None
    if await _kakao_on(db, tenant_id) and await send_kakao_alimtalk(
        to=to,
        template_code="INQUIRY_REPLY_V1",
        variables={"사이트명": tenant_name, "이름": customer_name, "답변": message},
    ):
        channel = "KAKAO"
    elif await send_sms(to=to, message=f"[{tenant_name}] {message}"):
        channel = "SMS"

    if channel:
        await increment_monthly_count(db, tenant_id)
    return channel
