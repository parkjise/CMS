from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "cms",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.workers.analytics",
        "app.workers.announcement",
        "app.workers.billing",
        "app.workers.email",
        "app.workers.image",
        "app.workers.notification",
        "app.workers.scheduled",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Seoul",
    enable_utc=True,
    beat_schedule={
        "flush-analytics-every-hour": {
            "task": "app.workers.analytics.flush_analytics",
            "schedule": crontab(minute=0),  # 매시 정각
        },
        "cleanup-orphan-files-daily-3am": {
            "task": "app.workers.image.cleanup_orphan_files",
            "schedule": crontab(hour=3, minute=0),  # 매일 03:00 (Asia/Seoul)
        },
        "reset-monthly-notification-count": {
            "task": "app.workers.scheduled.reset_monthly_notification_count",
            "schedule": crontab(day_of_month=1, hour=0, minute=0),  # 매월 1일 00:00
        },
        "cleanup-old-inquiries-daily-2am": {
            "task": "app.workers.scheduled.cleanup_old_inquiries",
            "schedule": crontab(hour=2, minute=0),  # 매일 02:00
        },
        "cleanup-old-analytics-daily-230am": {
            "task": "app.workers.scheduled.cleanup_old_analytics",
            "schedule": crontab(hour=2, minute=30),  # 매일 02:30
        },
        "cleanup-old-template-history-daily-3am": {
            "task": "app.workers.scheduled.cleanup_old_template_history",
            "schedule": crontab(hour=3, minute=30),  # 매일 03:30
        },
        "publish-scheduled-announcements-every-5min": {
            "task": "app.workers.announcement.publish_scheduled_announcements",
            "schedule": crontab(minute="*/5"),  # 5분마다 예약 공지 발행
        },
        "deactivate-expired-announcements-daily-4am": {
            "task": "app.workers.announcement.deactivate_expired_announcements",
            "schedule": crontab(hour=4, minute=0),  # 매일 04:00 만료 공지 비노출
        },
        # ── 정기결제 (T-097) ──────────────────────────────────────────────
        "process-monthly-billing-daily-0005": {
            "task": "app.workers.billing.process_monthly_billing",
            "schedule": crontab(hour=0, minute=5),  # 매일 00:05 결제일 구독 결제
        },
        "suspend-expired-subscriptions-daily-0010": {
            "task": "app.workers.billing.suspend_expired_subscriptions",
            "schedule": crontab(hour=0, minute=10),  # 매일 00:10 만료 구독 차단
        },
        "retry-billing-daily-0100": {
            "task": "app.workers.billing.retry_billing",
            "schedule": crontab(hour=1, minute=0),  # 매일 01:00 연체 재청구
        },
        "delete-cancelled-tenant-data-daily-0300": {
            "task": "app.workers.billing.delete_cancelled_tenant_data",
            "schedule": crontab(hour=3, minute=0),  # 매일 03:00 해지 30일 경과 삭제
        },
        "check-expiring-subscriptions-daily-0900": {
            "task": "app.workers.billing.check_expiring_subscriptions",
            "schedule": crontab(hour=9, minute=0),  # 매일 09:00 만료 예정 알림
        },
    },
)
