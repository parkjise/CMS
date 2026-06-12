from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "cms",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.workers.analytics",
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
    },
)
