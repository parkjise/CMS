"""T-032 알림 발송 Celery 태스크.

문의 접수 시 비동기로 알림톡/SMS를 발송하고 성공 시
`inquiries.is_notified=True`로 업데이트한다.
"""

import asyncio

from sqlalchemy import select, text, update

from app.models.inquiry import Inquiry
from app.models.tenant import Tenant
from app.services import notification as notification_service
from app.workers.celery_app import celery_app


@celery_app.task(
    name="app.workers.notification.send_inquiry_alert",
    bind=True,
    max_retries=3,
    default_retry_delay=2,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def send_inquiry_alert(self, tenant_id: str, inquiry_id: str) -> dict:
    """문의 접수 알림을 비동기로 발송. 지수 백오프 재시도."""
    return asyncio.run(_send_inquiry_alert(tenant_id, inquiry_id))


async def _send_inquiry_alert(tenant_id: str, inquiry_id: str) -> dict:
    """
    inquiry/tenant 조회 → notification_service.notify_inquiry 호출 →
    성공 시 is_notified=True. 반환값: notify_inquiry 결과 + notified 플래그.
    """
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))

        inq_row = await db.execute(select(Inquiry).where(Inquiry.id == inquiry_id))
        inquiry = inq_row.scalar_one_or_none()
        if inquiry is None:
            return {
                "kakao_sent": False,
                "sms_sent": False,
                "skipped": True,
                "reason": "INQUIRY_NOT_FOUND",
                "notified": False,
            }

        tenant_row = await db.execute(select(Tenant.name).where(Tenant.id == tenant_id))
        tenant_name = tenant_row.scalar_one_or_none() or "사이트"

        from uuid import UUID

        result = await notification_service.notify_inquiry(
            db,
            tenant_id=UUID(tenant_id),
            inquiry_name=inquiry.name,
            inquiry_phone=inquiry.phone,
            inquiry_type=inquiry.inquiry_type,
            inquiry_created_at=inquiry.created_at,
            tenant_name=tenant_name,
        )

        notified = bool(result.get("kakao_sent") or result.get("sms_sent"))
        if notified:
            await db.execute(
                update(Inquiry).where(Inquiry.id == inquiry_id).values(is_notified=True)
            )
            await db.commit()

        return {**result, "notified": notified}
