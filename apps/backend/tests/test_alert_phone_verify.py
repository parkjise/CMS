"""T-204 알림 받을 번호 [인증] (AD-03)."""

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from app.services import notification as notification_service
from tests.conftest import _TestSession, verify_alert_phone

SETTINGS = "/api/v1/notification-settings"
SEND = f"{SETTINGS}/phone/send-code"
VERIFY = f"{SETTINGS}/phone/verify"
PHONE = "010-2222-3333"


async def _sql(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        row = result.first() if result.returns_rows else None
        await s.commit()
    return row


@pytest.fixture
async def tenant(test_tenant, test_user) -> AsyncIterator[dict]:
    yield test_tenant
    await _sql(
        "DELETE FROM notification_settings WHERE tenant_id = :t", t=test_tenant["id"]
    )
    await _sql(
        "DELETE FROM phone_verifications WHERE tenant_id = :t", t=test_tenant["id"]
    )


async def _send(client: AsyncClient, headers: dict, phone: str = PHONE) -> dict:
    resp = await client.post(SEND, json={"phone": phone}, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


async def _user_headers(tenant_id: str, role: str) -> dict:
    user_id = uuid.uuid4()
    await _sql(
        "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
        " created_at, updated_at) VALUES (:id, :t, :e, 'x', :r, true, now(), now())",
        id=str(user_id),
        t=tenant_id,
        e=f"{user_id.hex[:8]}@example.com",
        r=role,
    )
    token = create_access_token(
        user_id=user_id, tenant_id=uuid.UUID(tenant_id), role=role
    )
    return {"Authorization": f"Bearer {token}"}


class TestSendCode:
    async def test_sends_sms_with_code(self, client, auth_headers, tenant, monkeypatch):
        sent: list[tuple[str, str]] = []

        async def sms(to, message):
            sent.append((to, message))
            return True

        monkeypatch.setattr(notification_service, "send_sms", sms)
        data = await _send(client, auth_headers, "01022223333")
        assert len(data["debug_code"]) == 6
        assert data["resend_after_seconds"] == 60
        assert sent == [
            (
                PHONE,
                f"[Test Tenant {tenant['slug']}] 인증번호 [{data['debug_code']}]를"
                " 입력해주세요. (3분 내)",
            )
        ]
        row = await _sql(
            "SELECT purpose, phone FROM phone_verifications WHERE id = :i",
            i=data["verification_id"],
        )
        assert row == ("ADMIN_ALERT", PHONE)

    async def test_not_counted_in_monthly_limit(self, client, auth_headers, tenant):
        await _send(client, auth_headers)
        resp = await client.get(SETTINGS, headers=auth_headers)
        assert resp.json()["data"]["monthly_kakao_count"] == 0

    async def test_resend_wait_429(self, client, auth_headers, tenant):
        await _send(client, auth_headers)
        resp = await client.post(SEND, json={"phone": PHONE}, headers=auth_headers)
        assert resp.status_code == 429
        assert resp.json()["error"]["code"] == "RATE_LIMIT_EXCEEDED"

    async def test_invalid_phone_400(self, client, auth_headers, tenant):
        for phone in ("02-1234-5678", ""):
            resp = await client.post(SEND, json={"phone": phone}, headers=auth_headers)
            assert resp.status_code == 400

    async def test_unauthenticated_401(self, client):
        assert (await client.post(SEND, json={"phone": PHONE})).status_code == 401

    async def test_viewer_403(self, client, tenant):
        viewer = await _user_headers(tenant["id"], "TENANT_VIEWER")
        resp = await client.post(SEND, json={"phone": PHONE}, headers=viewer)
        assert resp.status_code == 403


class TestVerify:
    async def test_wrong_code_400(self, client, auth_headers, tenant):
        data = await _send(client, auth_headers)
        wrong = "000000" if data["debug_code"] != "000000" else "111111"
        resp = await client.post(
            VERIFY,
            json={"verification_id": data["verification_id"], "code": wrong},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "INVALID_CODE"

    async def test_expired_400(self, client, auth_headers, tenant):
        data = await _send(client, auth_headers)
        await _sql(
            "UPDATE phone_verifications SET expires_at = now() - interval '1 second'"
            " WHERE id = :i",
            i=data["verification_id"],
        )
        resp = await client.post(
            VERIFY,
            json={
                "verification_id": data["verification_id"],
                "code": data["debug_code"],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "CODE_EXPIRED"

    async def test_other_tenant_cannot_verify_404(self, client, auth_headers, tenant):
        """다른 사업체 관리자는 남의 인증 요청을 확인할 수 없다 (RLS)."""
        data = await _send(client, auth_headers)
        other_id = str(uuid.uuid4())
        await _sql(
            "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
            " updated_at) VALUES (:id, 'other', :s, 'STANDARD', true, now(), now())",
            id=other_id,
            s=f"other-{other_id[:8]}",
        )
        try:
            other = await _user_headers(other_id, "TENANT_ADMIN")
            resp = await client.post(
                VERIFY,
                json={
                    "verification_id": data["verification_id"],
                    "code": data["debug_code"],
                },
                headers=other,
            )
            assert resp.status_code == 404
        finally:
            await _sql("DELETE FROM users WHERE tenant_id = :t", t=other_id)
            await _sql("DELETE FROM tenants WHERE id = :t", t=other_id)


class TestSaveRequiresVerification:
    async def test_verified_phone_saved_with_time(self, client, auth_headers, tenant):
        vid = await verify_alert_phone(client, auth_headers, PHONE)
        resp = await client.put(
            SETTINGS,
            json={"recipient_phone": PHONE, "phone_verification_id": vid},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["recipient_phone"] == PHONE
        assert data["recipient_phone_verified_at"]

    async def test_new_phone_without_verification_400(
        self, client, auth_headers, tenant
    ):
        resp = await client.put(
            SETTINGS, json={"recipient_phone": PHONE}, headers=auth_headers
        )
        assert resp.status_code == 400
        body = resp.json()["error"]
        assert body["code"] == "PHONE_NOT_VERIFIED"
        assert body["field"] == "recipient_phone"

    async def test_unverified_code_cannot_be_used(self, client, auth_headers, tenant):
        data = await _send(client, auth_headers)  # 문자만 받고 확인 안 함
        resp = await client.put(
            SETTINGS,
            json={
                "recipient_phone": PHONE,
                "phone_verification_id": data["verification_id"],
            },
            headers=auth_headers,
        )
        assert resp.json()["error"]["code"] == "PHONE_NOT_VERIFIED"

    async def test_verification_of_other_phone_rejected(
        self, client, auth_headers, tenant
    ):
        vid = await verify_alert_phone(client, auth_headers, "010-4444-5555")
        resp = await client.put(
            SETTINGS,
            json={"recipient_phone": PHONE, "phone_verification_id": vid},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "PHONE_NOT_VERIFIED"

    async def test_verification_is_one_time(self, client, auth_headers, tenant):
        vid = await verify_alert_phone(client, auth_headers, PHONE)
        body = {"recipient_phone": PHONE, "phone_verification_id": vid}
        assert (
            await client.put(SETTINGS, json=body, headers=auth_headers)
        ).status_code == 200
        # 같은 인증으로 다시 '인증' 저장은 안 된다
        resp = await client.put(SETTINGS, json=body, headers=auth_headers)
        assert resp.json()["error"]["code"] == "PHONE_NOT_VERIFIED"

    async def test_member_purpose_rejected(self, client, auth_headers, tenant):
        """방문자 회원가입 인증(REGISTER)으로는 알림 번호를 저장할 수 없다."""
        vid = uuid.uuid4()
        await _sql(
            "INSERT INTO phone_verifications (id, tenant_id, phone, code, purpose,"
            " expires_at, verified_at, attempt_count, created_at, updated_at)"
            " VALUES (:id, :t, :p, '123456', 'REGISTER', now() + interval '3 min',"
            " now(), 0, now(), now())",
            id=str(vid),
            t=tenant["id"],
            p=PHONE,
        )
        resp = await client.put(
            SETTINGS,
            json={"recipient_phone": PHONE, "phone_verification_id": str(vid)},
            headers=auth_headers,
        )
        assert resp.json()["error"]["code"] == "PHONE_NOT_VERIFIED"

    async def test_same_phone_keeps_without_verification(
        self, client, auth_headers, tenant
    ):
        """이미 저장된 번호(인증 전 기존 번호 포함)를 그대로 두고 다른 설정만 저장."""
        await client.get(SETTINGS, headers=auth_headers)
        await _sql(
            "UPDATE notification_settings SET recipient_phone = :p"
            " WHERE tenant_id = :t",
            p=PHONE,
            t=tenant["id"],
        )
        resp = await client.put(
            SETTINGS,
            json={"recipient_phone": PHONE, "sms_enabled": True},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["sms_enabled"] is True
        assert data["recipient_phone_verified_at"] is None

    async def test_verify_existing_phone(self, client, auth_headers, tenant):
        """기존 번호를 인증하면 인증 시각이 생긴다."""
        await client.get(SETTINGS, headers=auth_headers)
        await _sql(
            "UPDATE notification_settings SET recipient_phone = :p"
            " WHERE tenant_id = :t",
            p=PHONE,
            t=tenant["id"],
        )
        vid = await verify_alert_phone(client, auth_headers, PHONE)
        resp = await client.put(
            SETTINGS,
            json={"recipient_phone": PHONE, "phone_verification_id": vid},
            headers=auth_headers,
        )
        assert resp.json()["data"]["recipient_phone_verified_at"]

    async def test_failed_save_changes_nothing(self, client, auth_headers, tenant):
        resp = await client.put(
            SETTINGS,
            json={"recipient_phone": PHONE, "sms_enabled": True},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        data = (await client.get(SETTINGS, headers=auth_headers)).json()["data"]
        assert data["recipient_phone"] is None
        assert data["sms_enabled"] is False
