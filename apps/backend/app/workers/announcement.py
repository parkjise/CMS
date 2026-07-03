"""T-088 공지 발송/스케줄 Celery 태스크.

- send_announcement: 대상 테넌트에게 카카오 알림톡 일괄 발송 (이메일은 T-098 유예)
- publish_scheduled_announcements: 예약(published_at 도래) 공지 발행 — 5분마다
- deactivate_expired_announcements: 만료 공지 자동 비노출 — 매일
"""

import asyncio
from datetime import UTC, datetime

from sqlalchemy import and_, select, text, update

from app.models.announcement import Announcement
from app.models.sns import NotificationSetting
from app.services import announcement as announcement_service
from app.workers.celery_app import celery_app

# 알림톡 공지 템플릿 코드 (승인된 템플릿. 테스트 모드에서는 stub)
ANNOUNCEMENT_TEMPLATE_CODE = "ANNOUNCE_01"


@celery_app.task(
    name="app.workers.announcement.send_announcement",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def send_announcement(self, announcement_id: str) -> dict:
    return asyncio.run(_send_announcement(announcement_id))


async def _send_announcement(announcement_id: str) -> dict:
    """대상 테넌트에게 카카오 알림톡 발송. 이메일은 T-098 이메일 서비스로 유예."""
    from app.db.session import AsyncSessionLocal
    from app.services import notification as notification_service

    async with AsyncSessionLocal() as db:
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))

        ann = await db.get(Announcement, announcement_id)
        if ann is None:
            return {"skipped": True, "reason": "NOT_FOUND"}

        targets = await announcement_service.resolve_target_tenant_ids(db, ann)
        kakao_sent = 0

        if ann.send_kakao and targets:
            rows = (
                await db.execute(
                    select(NotificationSetting.recipient_phone).where(
                        NotificationSetting.tenant_id.in_(targets),
                        NotificationSetting.alimtalk_enabled.is_(True),
                        NotificationSetting.recipient_phone.isnot(None),
                    )
                )
            ).all()
            for (phone,) in rows:
                ok = await notification_service.send_kakao_alimtalk(
                    to=phone,
                    template_code=ANNOUNCEMENT_TEMPLATE_CODE,
                    variables={"title": ann.title, "content": ann.content[:100]},
                )
                if ok:
                    kakao_sent += 1

        return {
            "announcement_id": str(ann.id),
            "target_count": len(targets),
            "kakao_sent": kakao_sent,
            # 이메일 발송은 T-098 이메일 서비스 구현 후 연동
            "email_pending": len(targets) if ann.send_email else 0,
        }


@celery_app.task(
    name="app.workers.announcement.publish_scheduled_announcements",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def publish_scheduled_announcements(self) -> int:
    return asyncio.run(_publish_scheduled_announcements())


async def _publish_scheduled_announcements() -> int:
    """published_at이 도래한 미발행 공지를 발행 상태로 전환. 전환 건수 반환."""
    from app.db.session import AsyncSessionLocal

    now = datetime.now(UTC)
    async with AsyncSessionLocal() as db:
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await db.execute(
            update(Announcement)
            .where(
                and_(
                    Announcement.is_published.is_(False),
                    Announcement.published_at.isnot(None),
                    Announcement.published_at <= now,
                )
            )
            .values(is_published=True)
        )
        await db.commit()
        return result.rowcount or 0


@celery_app.task(
    name="app.workers.announcement.deactivate_expired_announcements",
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def deactivate_expired_announcements(self) -> int:
    return asyncio.run(_deactivate_expired_announcements())


async def _deactivate_expired_announcements() -> int:
    """만료일이 지난 발행 공지를 비발행 처리 (배너 미노출 백업). 처리 건수 반환."""
    from app.db.session import AsyncSessionLocal

    now = datetime.now(UTC)
    async with AsyncSessionLocal() as db:
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await db.execute(
            update(Announcement)
            .where(
                and_(
                    Announcement.is_published.is_(True),
                    Announcement.expires_at.isnot(None),
                    Announcement.expires_at <= now,
                )
            )
            .values(is_published=False)
        )
        await db.commit()
        return result.rowcount or 0
