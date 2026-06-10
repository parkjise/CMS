"""T-030 알림 설정 API 통합 테스트"""

import uuid
from datetime import date, timedelta

from sqlalchemy import text

from app.services import notification_settings as svc
from tests.conftest import _TestSession

# ── GET /api/v1/notification-settings ─────────────────────────────────────


class TestGetSettings:
    async def test_creates_default_on_first_call(
        self, client, auth_headers, test_tenant
    ):
        resp = await client.get("/api/v1/notification-settings", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["alimtalk_enabled"] is False
        assert data["sms_enabled"] is False
        assert data["email_enabled"] is False
        assert data["recipient_phone"] is None
        assert data["recipient_email"] is None
        assert data["monthly_kakao_count"] == 0

        # 정리
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text("DELETE FROM notification_settings WHERE tenant_id = :tid"),
                {"tid": test_tenant["id"]},
            )
            await session.commit()

    async def test_unauthenticated(self, client):
        resp = await client.get("/api/v1/notification-settings")
        assert resp.status_code == 401


# ── PUT /api/v1/notification-settings ─────────────────────────────────────


class TestUpdateSettings:
    async def test_update_phone_email_and_toggles(
        self, client, auth_headers, test_tenant
    ):
        resp = await client.put(
            "/api/v1/notification-settings",
            json={
                "alimtalk_enabled": True,
                "sms_enabled": True,
                "email_enabled": True,
                "recipient_phone": "010-1234-5678",
                "recipient_email": "admin@example.com",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["alimtalk_enabled"] is True
        assert data["sms_enabled"] is True
        assert data["email_enabled"] is True
        assert data["recipient_phone"] == "010-1234-5678"
        assert data["recipient_email"] == "admin@example.com"

        # 다시 GET 해도 동일
        resp = await client.get("/api/v1/notification-settings", headers=auth_headers)
        assert resp.json()["data"]["recipient_phone"] == "010-1234-5678"

        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text("DELETE FROM notification_settings WHERE tenant_id = :tid"),
                {"tid": test_tenant["id"]},
            )
            await session.commit()

    async def test_phone_normalization(self, client, auth_headers, test_tenant):
        # 하이픈 없는 입력도 정규화되어 저장
        resp = await client.put(
            "/api/v1/notification-settings",
            json={"recipient_phone": "01012345678"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["recipient_phone"] == "010-1234-5678"

        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text("DELETE FROM notification_settings WHERE tenant_id = :tid"),
                {"tid": test_tenant["id"]},
            )
            await session.commit()

    async def test_invalid_phone_rejected(self, client, auth_headers):
        resp = await client.put(
            "/api/v1/notification-settings",
            json={"recipient_phone": "02-1234-5678"},
            headers=auth_headers,
        )
        assert resp.status_code == 422  # pydantic validation

    async def test_invalid_email_rejected(self, client, auth_headers):
        resp = await client.put(
            "/api/v1/notification-settings",
            json={"recipient_email": "not-an-email"},
            headers=auth_headers,
        )
        assert resp.status_code == 422


# ── POST /api/v1/notification-settings/test ───────────────────────────────


class TestSendTest:
    async def test_returns_failure_when_no_channels_enabled(
        self, client, auth_headers, test_tenant
    ):
        resp = await client.post(
            "/api/v1/notification-settings/test", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["sent"] is False
        assert data["channels"] == []

        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text("DELETE FROM notification_settings WHERE tenant_id = :tid"),
                {"tid": test_tenant["id"]},
            )
            await session.commit()

    async def test_returns_active_channels(self, client, auth_headers, test_tenant):
        # 알림톡 + SMS 활성화
        await client.put(
            "/api/v1/notification-settings",
            json={
                "alimtalk_enabled": True,
                "sms_enabled": True,
                "recipient_phone": "010-9999-8888",
            },
            headers=auth_headers,
        )

        resp = await client.post(
            "/api/v1/notification-settings/test", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["sent"] is True
        assert set(data["channels"]) == {"KAKAO", "SMS"}

        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text("DELETE FROM notification_settings WHERE tenant_id = :tid"),
                {"tid": test_tenant["id"]},
            )
            await session.commit()


# ── 월간 카운터 자동 리셋 ─────────────────────────────────────────────────


class TestMonthlyCounterReset:
    async def test_resets_when_previous_month(self, test_tenant):
        """monthly_reset_at이 지난달이면 GET 호출 시 카운터 0으로 리셋."""
        tenant_id = test_tenant["id"]
        setting_id = uuid.uuid4()
        last_month = (date.today().replace(day=1) - timedelta(days=1)).replace(day=1)

        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text(
                    "INSERT INTO notification_settings "
                    "(id, tenant_id, alimtalk_enabled, sms_enabled, email_enabled, "
                    "monthly_kakao_count, monthly_reset_at, created_at, updated_at) "
                    "VALUES (:id, :tid, true, false, false, 42, :reset, now(), now())"
                ),
                {
                    "id": str(setting_id),
                    "tid": tenant_id,
                    "reset": last_month,
                },
            )
            await session.commit()

        try:
            async with _TestSession() as session:
                from uuid import UUID as _UUID

                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("SELECT set_config('app.current_tenant_id', :tid, true)"),
                    {"tid": tenant_id},
                )
                refreshed = await svc.get_or_create_settings(session, _UUID(tenant_id))
                assert refreshed.monthly_kakao_count == 0
                assert refreshed.monthly_reset_at == date.today().replace(day=1)
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("DELETE FROM notification_settings WHERE tenant_id = :tid"),
                    {"tid": tenant_id},
                )
                await session.commit()
