"""T-098 이메일 비동기 발송 Celery 태스크."""

import asyncio

from app.workers.celery_app import celery_app


@celery_app.task(
    name="app.workers.email.send_email_async",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def send_email_async(
    self, to: str, subject: str, template: str, variables: dict
) -> dict:
    """이메일을 비동기로 발송. test 모드에서는 stub 반환."""
    from app.services import email as email_service

    return asyncio.run(email_service.send_email(to, subject, template, variables))
