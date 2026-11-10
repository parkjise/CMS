"""T-178 테스트가 만든 Celery 태스크가 실제 브로커(Redis)로 나가지 않는다."""

from app.workers.celery_app import celery_app
from app.workers.email import send_email_async


def test_broker_is_in_memory():
    assert celery_app.conf.broker_url == "memory://"
    assert celery_app.conf.result_backend == "cache+memory://"


def test_delay_stays_in_process():
    with celery_app.connection_for_write() as conn:
        assert conn.transport.driver_type == "memory"
    result = send_email_async.delay("to@test.com", "제목", "data_deleted", {})
    assert result.id
