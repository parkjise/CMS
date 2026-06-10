"""T-031 알림 발송 서비스 단위/통합 테스트"""

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from app.models.sns import NotificationSetting
from app.services import notification as svc
from tests.conftest import _TestSession

# ── mask_phone 단위 테스트 ────────────────────────────────────────────────


class TestMaskPhone:
    def test_masks_middle_segment(self):
        assert svc.mask_phone("010-1234-5678") == "010-****-5678"

    def test_masks_short_middle(self):
        assert svc.mask_phone("010-123-5678") == "010-***-5678"

    def test_returns_empty_for_none(self):
        assert svc.mask_phone(None) == ""

    def test_returns_empty_for_blank(self):
        assert svc.mask_phone("") == ""

    def test_returns_original_when_unhyphenated(self):
        # 형식이 아니면 원본 유지
        assert svc.mask_phone("01012345678") == "01012345678"


# ── check_monthly_limit ───────────────────────────────────────────────────


class TestCheckMonthlyLimit:
    async def test_basic_plan_always_blocked(self, test_tenant):
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text(
                    "INSERT INTO notification_settings "
                    "(id, tenant_id, monthly_kakao_count, monthly_reset_at, "
                    "created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :tid, 0, CURRENT_DATE, NOW(), NOW())"
                ),
                {"tid": test_tenant["id"]},
            )
            await session.commit()

        try:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                with pytest.raises(svc.MonthlyLimitExceeded):
                    await svc.check_monthly_limit(
                        session, uuid.UUID(test_tenant["id"]), "BASIC"
                    )
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("DELETE FROM notification_settings WHERE tenant_id = :tid"),
                    {"tid": test_tenant["id"]},
                )
                await session.commit()

    async def test_standard_plan_blocked_when_at_limit(self, test_tenant):
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text(
                    "INSERT INTO notification_settings "
                    "(id, tenant_id, monthly_kakao_count, monthly_reset_at, "
                    "created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :tid, 100, CURRENT_DATE, NOW(), NOW())"
                ),
                {"tid": test_tenant["id"]},
            )
            await session.commit()

        try:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                with pytest.raises(svc.MonthlyLimitExceeded):
                    await svc.check_monthly_limit(
                        session, uuid.UUID(test_tenant["id"]), "STANDARD"
                    )
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("DELETE FROM notification_settings WHERE tenant_id = :tid"),
                    {"tid": test_tenant["id"]},
                )
                await session.commit()

    async def test_standard_plan_allowed_below_limit(self, test_tenant):
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text(
                    "INSERT INTO notification_settings "
                    "(id, tenant_id, monthly_kakao_count, monthly_reset_at, "
                    "created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :tid, 50, CURRENT_DATE, NOW(), NOW())"
                ),
                {"tid": test_tenant["id"]},
            )
            await session.commit()

        try:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                # 예외 없이 통과
                await svc.check_monthly_limit(
                    session, uuid.UUID(test_tenant["id"]), "STANDARD"
                )
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("DELETE FROM notification_settings WHERE tenant_id = :tid"),
                    {"tid": test_tenant["id"]},
                )
                await session.commit()


# ── notify_inquiry: 알림톡 성공 + SMS fallback ────────────────────────────


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


async def _setup_notification_setting(
    tenant_id: str,
    alimtalk: bool = True,
    sms: bool = True,
    phone: str = "010-1111-2222",
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
                "VALUES (gen_random_uuid(), :tid, :alim, :sms, :phone, 0, "
                "CURRENT_DATE, NOW(), NOW())"
            ),
            {
                "tid": tenant_id,
                "alim": alimtalk,
                "sms": sms,
                "phone": phone,
            },
        )
        await session.commit()


async def _cleanup_notification(tenant_id: str) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("DELETE FROM notification_settings WHERE tenant_id = :tid"),
            {"tid": tenant_id},
        )
        await session.commit()


class TestNotifyInquiry:
    async def test_test_mode_returns_success_for_kakao(self, test_tenant):
        """test 모드에서 알림톡 활성화 시 stub 성공 + 카운터 증가."""
        await _upgrade_tenant_to_standard(test_tenant["id"])
        await _setup_notification_setting(test_tenant["id"])

        try:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                result = await svc.notify_inquiry(
                    session,
                    tenant_id=uuid.UUID(test_tenant["id"]),
                    inquiry_name="홍길동",
                    inquiry_phone="010-9999-8888",
                    inquiry_type="GENERAL",
                    inquiry_created_at=datetime.now(UTC),
                )
            assert result["kakao_sent"] is True
            assert result["sms_sent"] is False
            assert result["skipped"] is False

            # 카운터 증가 확인
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                row = await session.execute(
                    text(
                        "SELECT monthly_kakao_count FROM notification_settings "
                        "WHERE tenant_id = :tid"
                    ),
                    {"tid": test_tenant["id"]},
                )
                assert row.scalar_one() == 1
        finally:
            await _cleanup_notification(test_tenant["id"])

    async def test_sms_fallback_when_kakao_fails(self, test_tenant, monkeypatch):
        """알림톡 발송이 False를 반환하면 SMS가 시도된다."""
        await _upgrade_tenant_to_standard(test_tenant["id"])
        await _setup_notification_setting(test_tenant["id"])

        async def _kakao_fail(*args, **kwargs):
            return False

        async def _sms_ok(*args, **kwargs):
            return True

        monkeypatch.setattr(svc, "send_kakao_alimtalk", _kakao_fail)
        monkeypatch.setattr(svc, "send_sms", _sms_ok)

        try:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                result = await svc.notify_inquiry(
                    session,
                    tenant_id=uuid.UUID(test_tenant["id"]),
                    inquiry_name="홍길동",
                    inquiry_phone="010-9999-8888",
                    inquiry_type="GENERAL",
                    inquiry_created_at=datetime.now(UTC),
                )
            assert result["kakao_sent"] is False
            assert result["sms_sent"] is True
            assert result["skipped"] is False
        finally:
            await _cleanup_notification(test_tenant["id"])

    async def test_skipped_when_basic_plan(self, test_tenant):
        """BASIC 플랜이면 발송 자체가 거부된다."""
        # 기본 BASIC 유지
        await _setup_notification_setting(test_tenant["id"])

        try:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                result = await svc.notify_inquiry(
                    session,
                    tenant_id=uuid.UUID(test_tenant["id"]),
                    inquiry_name="홍길동",
                    inquiry_phone="010-9999-8888",
                    inquiry_type="GENERAL",
                    inquiry_created_at=datetime.now(UTC),
                )
            assert result["skipped"] is True
            assert "플랜" in result["reason"]
        finally:
            await _cleanup_notification(test_tenant["id"])

    async def test_skipped_when_no_settings(self, test_tenant):
        """설정 레코드가 없으면 skip."""
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            result = await svc.notify_inquiry(
                session,
                tenant_id=uuid.UUID(test_tenant["id"]),
                inquiry_name="홍길동",
                inquiry_phone="010-9999-8888",
                inquiry_type="GENERAL",
                inquiry_created_at=datetime.now(UTC),
            )
        assert result["skipped"] is True
        assert result["reason"] == "NO_SETTING"


# ── /notification-settings/test 엔드포인트 wire-up ──────────────────────


class TestEndpointWireUp:
    async def test_test_endpoint_returns_sent_when_channels_active(
        self, client, auth_headers, test_tenant
    ):
        await _upgrade_tenant_to_standard(test_tenant["id"])
        # 설정 저장
        await client.put(
            "/api/v1/notification-settings",
            json={
                "alimtalk_enabled": True,
                "recipient_phone": "010-1234-5678",
            },
            headers=auth_headers,
        )

        try:
            resp = await client.post(
                "/api/v1/notification-settings/test", headers=auth_headers
            )
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert data["sent"] is True
            assert "KAKAO" in data["channels"]
        finally:
            await _cleanup_notification(test_tenant["id"])

    async def test_test_endpoint_skipped_when_basic_plan(
        self, client, auth_headers, test_tenant
    ):
        """BASIC 플랜에서 발송 시도 시 skipped 응답."""
        # tenant는 기본 BASIC, 설정만 활성화
        await client.put(
            "/api/v1/notification-settings",
            json={
                "alimtalk_enabled": True,
                "recipient_phone": "010-1234-5678",
            },
            headers=auth_headers,
        )

        try:
            resp = await client.post(
                "/api/v1/notification-settings/test", headers=auth_headers
            )
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert data["sent"] is False
            assert data["channels"] == []
        finally:
            await _cleanup_notification(test_tenant["id"])


# 사용되지 않는 import silencer
_ = NotificationSetting
