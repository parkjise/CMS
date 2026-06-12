"""T-032 알림 Celery 태스크 단위/통합 테스트.

Celery 브로커 의존 없이 _send_inquiry_alert async 함수를 직접 호출하여 검증.
"""

import uuid

from sqlalchemy import text

from app.workers import notification as worker
from tests.conftest import _TestSession

# ── 헬퍼 ───────────────────────────────────────────────────────────────────


async def _upgrade_tenant_to_standard(tenant_id: str) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :tid"),
            {"tid": tenant_id},
        )
        await session.commit()


async def _create_inquiry_row(tenant_id: str) -> str:
    """알림 발송 대상 inquiry 직접 삽입."""
    inquiry_id = uuid.uuid4()
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text(
                "INSERT INTO inquiries "
                "(id, tenant_id, inquiry_type, name, phone, message, status, "
                "is_read, is_notified, created_at, updated_at) "
                "VALUES (:id, :tid, 'GENERAL', '홍길동', '010-9999-8888', "
                "'테스트 문의입니다.', 'PENDING', false, false, NOW(), NOW())"
            ),
            {"id": str(inquiry_id), "tid": tenant_id},
        )
        await session.commit()
    return str(inquiry_id)


async def _setup_notification_setting(
    tenant_id: str, alimtalk: bool = True, sms: bool = True
) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text(
                "INSERT INTO notification_settings "
                "(id, tenant_id, alimtalk_enabled, sms_enabled, recipient_phone, "
                "monthly_kakao_count, monthly_reset_at, created_at, updated_at) "
                "VALUES (gen_random_uuid(), :tid, :alim, :sms, '010-1111-2222', "
                "0, CURRENT_DATE, NOW(), NOW())"
            ),
            {"tid": tenant_id, "alim": alimtalk, "sms": sms},
        )
        await session.commit()


async def _cleanup(tenant_id: str, inquiry_id: str | None = None) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        if inquiry_id:
            await session.execute(
                text("DELETE FROM inquiries WHERE id = :id"), {"id": inquiry_id}
            )
        await session.execute(
            text("DELETE FROM notification_settings WHERE tenant_id = :tid"),
            {"tid": tenant_id},
        )
        await session.commit()


# ── _send_inquiry_alert: 정상 흐름 ────────────────────────────────────────


class TestSendInquiryAlert:
    async def test_success_marks_inquiry_as_notified(self, test_tenant):
        """STANDARD 플랜 + 알림톡 활성화 → 발송 성공 + is_notified=True."""
        await _upgrade_tenant_to_standard(test_tenant["id"])
        await _setup_notification_setting(test_tenant["id"])
        inquiry_id = await _create_inquiry_row(test_tenant["id"])

        try:
            result = await worker._send_inquiry_alert(test_tenant["id"], inquiry_id)
            assert result["notified"] is True
            assert result["kakao_sent"] is True

            # DB 검증
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                row = await session.execute(
                    text("SELECT is_notified FROM inquiries WHERE id = :id"),
                    {"id": inquiry_id},
                )
                assert row.scalar_one() is True
        finally:
            await _cleanup(test_tenant["id"], inquiry_id)

    async def test_inquiry_not_found_returns_skipped(self, test_tenant):
        """존재하지 않는 inquiry id → skipped + reason."""
        fake_id = str(uuid.uuid4())
        result = await worker._send_inquiry_alert(test_tenant["id"], fake_id)
        assert result["skipped"] is True
        assert result["reason"] == "INQUIRY_NOT_FOUND"
        assert result["notified"] is False

    async def test_basic_plan_skips_without_marking_notified(self, test_tenant):
        """BASIC 플랜 → notify_inquiry가 skipped → is_notified는 False 유지."""
        # 기본 BASIC
        await _setup_notification_setting(test_tenant["id"])
        inquiry_id = await _create_inquiry_row(test_tenant["id"])

        try:
            result = await worker._send_inquiry_alert(test_tenant["id"], inquiry_id)
            assert result["notified"] is False
            assert result["skipped"] is True

            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                row = await session.execute(
                    text("SELECT is_notified FROM inquiries WHERE id = :id"),
                    {"id": inquiry_id},
                )
                assert row.scalar_one() is False
        finally:
            await _cleanup(test_tenant["id"], inquiry_id)

    async def test_sms_fallback_marks_notified(self, test_tenant, monkeypatch):
        """알림톡 실패 → SMS 성공 → is_notified=True."""
        await _upgrade_tenant_to_standard(test_tenant["id"])
        await _setup_notification_setting(test_tenant["id"])
        inquiry_id = await _create_inquiry_row(test_tenant["id"])

        from app.services import notification as nsvc

        async def _kakao_fail(*args, **kwargs):
            return False

        async def _sms_ok(*args, **kwargs):
            return True

        monkeypatch.setattr(nsvc, "send_kakao_alimtalk", _kakao_fail)
        monkeypatch.setattr(nsvc, "send_sms", _sms_ok)

        try:
            result = await worker._send_inquiry_alert(test_tenant["id"], inquiry_id)
            assert result["kakao_sent"] is False
            assert result["sms_sent"] is True
            assert result["notified"] is True
        finally:
            await _cleanup(test_tenant["id"], inquiry_id)

    async def test_both_channels_fail_keeps_notified_false(
        self, test_tenant, monkeypatch
    ):
        """알림톡·SMS 모두 실패 → is_notified=False (재시도 가능 상태)."""
        await _upgrade_tenant_to_standard(test_tenant["id"])
        await _setup_notification_setting(test_tenant["id"])
        inquiry_id = await _create_inquiry_row(test_tenant["id"])

        from app.services import notification as nsvc

        async def _fail(*args, **kwargs):
            return False

        monkeypatch.setattr(nsvc, "send_kakao_alimtalk", _fail)
        monkeypatch.setattr(nsvc, "send_sms", _fail)

        try:
            result = await worker._send_inquiry_alert(test_tenant["id"], inquiry_id)
            assert result["notified"] is False
            assert result["kakao_sent"] is False
            assert result["sms_sent"] is False

            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                row = await session.execute(
                    text("SELECT is_notified FROM inquiries WHERE id = :id"),
                    {"id": inquiry_id},
                )
                assert row.scalar_one() is False
        finally:
            await _cleanup(test_tenant["id"], inquiry_id)


# ── create_inquiry 통합: 트리거 호출 검증 ─────────────────────────────────


class TestCreateInquiryTriggersTask:
    async def test_create_inquiry_queues_send_inquiry_alert(
        self, client, monkeypatch, test_tenant
    ):
        """공개 문의 접수 시 send_inquiry_alert.delay가 호출되는지 검증."""
        from app.services import inquiry as inquiry_svc

        called = {}

        # delay() 호출을 가로채는 fake 객체
        class _FakeTask:
            def delay(self, tenant_id: str, inquiry_id: str):
                called["tenant_id"] = tenant_id
                called["inquiry_id"] = inquiry_id

        # service의 inline import를 가로채기 위해 module 직접 패치
        import app.workers.notification as wn

        monkeypatch.setattr(wn, "send_inquiry_alert", _FakeTask())

        # 공개 문의 접수
        resp = await client.post(
            f"/api/public/inquiries?tenant_slug={test_tenant['slug']}",
            json={
                "inquiry_type": "GENERAL",
                "name": "홍길동",
                "phone": "010-9999-8888",
                "message": "테스트 문의입니다.",
            },
        )
        assert resp.status_code == 200, resp.text
        assert called.get("tenant_id") == test_tenant["id"]
        assert "inquiry_id" in called

        # 정리
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text("DELETE FROM inquiries WHERE tenant_id = :tid"),
                {"tid": test_tenant["id"]},
            )
            await session.commit()

        _ = inquiry_svc  # silence
