"""T-098 이메일 발송 서비스 테스트 (email_mode=test stub)."""

import pytest

from app.services import email as svc


class TestRender:
    def test_welcome_renders_variables(self):
        html = svc.render_email(
            "welcome",
            {
                "tenant_name": "OO의원",
                "admin_url": "https://admin.cms.io",
                "admin_email": "a@oo.com",
                "temp_password": "TempPass1234!",
                "plan_type": "STANDARD",
            },
        )
        assert "OO의원" in html
        assert "TempPass1234!" in html
        assert "STANDARD" in html

    def test_all_seven_templates_render(self):
        cases = {
            "welcome": {
                "tenant_name": "T",
                "admin_url": "u",
                "admin_email": "e",
                "temp_password": "p",
                "plan_type": "BASIC",
            },
            "domain_activated": {"tenant_name": "T", "domain": "x.com"},
            "payment_receipt": {
                "tenant_name": "T",
                "plan_type": "BASIC",
                "order_id": "o1",
                "amount": "39,000",
                "paid_at": "2026-07-05",
                "receipt_url": "r",
            },
            "payment_failed": {
                "tenant_name": "T",
                "attempt_count": 2,
                "billing_url": "b",
            },
            "expiring_notice": {"tenant_name": "T", "days_left": 7, "billing_url": "b"},
            "cancellation_confirmed": {"tenant_name": "T"},
            "data_deleted": {},
        }
        for template, variables in cases.items():
            html = svc.render_email(template, variables)
            assert html.strip().startswith("<!doctype html>")


class TestSend:
    async def test_send_email_stub(self):
        result = await svc.send_email("to@test.com", "제목", "data_deleted", {})
        assert result["sent"] is True
        assert result["stub"] is True
        assert result["to"] == "to@test.com"

    async def test_welcome_helper(self):
        result = await svc.send_welcome_email(
            "a@oo.com",
            tenant_name="OO의원",
            admin_email="a@oo.com",
            temp_password="p",
            plan_type="STANDARD",
        )
        assert result["sent"] is True
        assert "OO의원" in result["subject"]

    async def test_payment_receipt_helper(self):
        result = await svc.send_payment_receipt(
            "pay@test.com",
            tenant_name="T",
            plan_type="STANDARD",
            order_id="o1",
            amount=89_000,
            paid_at="2026-07-05T00:00:00Z",
        )
        assert result["sent"] is True
        assert result["subject"] == "[CMS] 결제 영수증"

    @pytest.mark.parametrize(
        "coro",
        [
            lambda: svc.send_domain_activated(
                "t@x.com", tenant_name="T", domain="x.com"
            ),
            lambda: svc.send_payment_failed(
                "t@x.com", tenant_name="T", attempt_count=3
            ),
            lambda: svc.send_expiring_notice("t@x.com", tenant_name="T", days_left=3),
            lambda: svc.send_cancellation_confirmed("t@x.com", tenant_name="T"),
            lambda: svc.send_data_deleted("t@x.com"),
        ],
    )
    async def test_remaining_helpers(self, coro):
        result = await coro()
        assert result["sent"] is True


class TestAsyncTask:
    def test_send_email_async_returns_stub(self):
        from app.workers.email import send_email_async

        # celery 태스크를 동기 실행 (eager)
        result = send_email_async.apply(
            args=("to@test.com", "제목", "data_deleted", {})
        ).get()
        assert result["sent"] is True
