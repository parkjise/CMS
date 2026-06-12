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
    },
)
