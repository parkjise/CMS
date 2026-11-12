"""T-203 문의 알림톡으로 답장 (AD-04-M)."""

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from app.services import feature as feature_service
from app.services import notification as notification_service
from tests.conftest import _TestSession

URL = "/api/v1/inquiries/{id}/reply"


async def _sql(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        row = result.first() if result.returns_rows else None
        await s.commit()
    return row


async def _set_flag(tenant_id: str, key: str, on: bool) -> None:
    await _sql(
        "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled)"
        " SELECT gen_random_uuid(), :t, id, :on FROM features WHERE key = :k"
        " ON CONFLICT ON CONSTRAINT uq_tenant_features_pair"
        " DO UPDATE SET is_enabled = :on",
        t=tenant_id,
        k=key,
        on=on,
    )
    await feature_service.invalidate_cache(tenant_id)


@pytest.fixture
async def tenant(test_tenant, test_user) -> AsyncIterator[dict]:
    """STANDARD 요금제 (월 100건) + 알림 설정."""
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t", t=test_tenant["id"]
    )
    await _sql(
        "INSERT INTO notification_settings (id, tenant_id, monthly_kakao_count,"
        " monthly_reset_at, created_at, updated_at)"
        " VALUES (gen_random_uuid(), :t, 0, CURRENT_DATE, now(), now())",
        t=test_tenant["id"],
    )
    await feature_service.invalidate_cache(test_tenant["id"])
    yield test_tenant
    await _sql("DELETE FROM tenant_features WHERE tenant_id = :t", t=test_tenant["id"])
    await _sql(
        "DELETE FROM notification_settings WHERE tenant_id = :t", t=test_tenant["id"]
    )
    await feature_service.invalidate_cache(test_tenant["id"])


@pytest.fixture
def sent(monkeypatch) -> list[tuple]:
    """실제 발송 함수 대신 호출만 기록 (test 모드 stub 과 같은 성공 응답)."""
    calls: list[tuple] = []

    async def kakao(to, template_code, variables):
        calls.append(("kakao", to, template_code, variables))
        return True

    async def sms(to, message):
        calls.append(("sms", to, message))
        return True

    monkeypatch.setattr(notification_service, "send_kakao_alimtalk", kakao)
    monkeypatch.setattr(notification_service, "send_sms", sms)
    return calls


async def _count(tenant_id: str) -> int:
    row = await _sql(
        "SELECT monthly_kakao_count FROM notification_settings WHERE tenant_id = :t",
        t=tenant_id,
    )
    return row[0]


class TestReply:
    async def test_sends_kakao_and_records(
        self, client: AsyncClient, auth_headers, tenant, test_inquiry, sent
    ):
        resp = await client.post(
            URL.format(id=test_inquiry["id"]),
            json={"message": "  내일 오전 10시 예약 가능합니다.  "},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["channel"] == "KAKAO"
        assert data["test_mode"] is True
        inquiry = data["inquiry"]
        assert inquiry["reply_message"] == "내일 오전 10시 예약 가능합니다."
        assert inquiry["reply_channel"] == "KAKAO"
        assert inquiry["replied_at"]
        # 대기 → 완료, 읽음
        assert inquiry["status"] == "DONE"
        assert inquiry["is_read"] is True

        assert sent == [
            (
                "kakao",
                "010-1234-5678",
                "INQUIRY_REPLY_V1",
                {
                    "사이트명": f"Test Tenant {tenant['slug']}",
                    "이름": "테스트문의자",
                    "답변": "내일 오전 10시 예약 가능합니다.",
                },
            )
        ]
        assert await _count(tenant["id"]) == 1

    async def test_kakao_off_falls_back_to_sms(
        self, client, auth_headers, tenant, test_inquiry, sent
    ):
        await _set_flag(tenant["id"], "KAKAO_NOTIFICATION", False)
        resp = await client.post(
            URL.format(id=test_inquiry["id"]),
            json={"message": "답변드립니다."},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["channel"] == "SMS"
        assert [c[0] for c in sent] == ["sms"]
        assert sent[0][2] == f"[Test Tenant {tenant['slug']}] 답변드립니다."

    async def test_kakao_failure_falls_back_to_sms(
        self, client, auth_headers, tenant, test_inquiry, monkeypatch
    ):
        calls = []

        async def kakao(**_):
            calls.append("kakao")
            return False

        async def sms(**_):
            calls.append("sms")
            return True

        monkeypatch.setattr(notification_service, "send_kakao_alimtalk", kakao)
        monkeypatch.setattr(notification_service, "send_sms", sms)
        resp = await client.post(
            URL.format(id=test_inquiry["id"]),
            json={"message": "답변드립니다."},
            headers=auth_headers,
        )
        assert resp.json()["data"]["channel"] == "SMS"
        assert calls == ["kakao", "sms"]

    async def test_both_fail_502_and_not_recorded(
        self, client, auth_headers, tenant, test_inquiry, monkeypatch
    ):
        async def fail(**_):
            return False

        monkeypatch.setattr(notification_service, "send_kakao_alimtalk", fail)
        monkeypatch.setattr(notification_service, "send_sms", fail)
        resp = await client.post(
            URL.format(id=test_inquiry["id"]),
            json={"message": "답변드립니다."},
            headers=auth_headers,
        )
        assert resp.status_code == 502
        row = await _sql(
            "SELECT reply_message, status FROM inquiries WHERE id = :i",
            i=test_inquiry["id"],
        )
        assert row == (None, "PENDING")
        assert await _count(tenant["id"]) == 0

    async def test_spam_status_kept(
        self, client, auth_headers, tenant, test_inquiry, sent
    ):
        await _sql(
            "UPDATE inquiries SET status = 'SPAM' WHERE id = :i", i=test_inquiry["id"]
        )
        resp = await client.post(
            URL.format(id=test_inquiry["id"]),
            json={"message": "답변드립니다."},
            headers=auth_headers,
        )
        assert resp.json()["data"]["inquiry"]["status"] == "SPAM"

    async def test_detail_shows_last_reply(
        self, client, auth_headers, tenant, test_inquiry, sent
    ):
        for message in ("첫 답장", "두 번째 답장"):
            await client.post(
                URL.format(id=test_inquiry["id"]),
                json={"message": message},
                headers=auth_headers,
            )
        resp = await client.get(
            f"/api/v1/inquiries/{test_inquiry['id']}", headers=auth_headers
        )
        assert resp.json()["data"]["reply_message"] == "두 번째 답장"
        assert await _count(tenant["id"]) == 2


class TestReplyLimits:
    async def test_basic_plan_422(
        self, client, auth_headers, tenant, test_inquiry, sent
    ):
        await _sql(
            "UPDATE tenants SET plan_type = 'BASIC' WHERE id = :t", t=tenant["id"]
        )
        resp = await client.post(
            URL.format(id=test_inquiry["id"]),
            json={"message": "답변드립니다."},
            headers=auth_headers,
        )
        assert resp.status_code == 422
        assert resp.json()["error"]["code"] == "PLAN_LIMIT_EXCEEDED"
        assert sent == []

    async def test_monthly_limit_422(
        self, client, auth_headers, tenant, test_inquiry, sent
    ):
        await _sql(
            "UPDATE notification_settings SET monthly_kakao_count = 100"
            " WHERE tenant_id = :t",
            t=tenant["id"],
        )
        resp = await client.post(
            URL.format(id=test_inquiry["id"]),
            json={"message": "답변드립니다."},
            headers=auth_headers,
        )
        assert resp.status_code == 422
        assert "100건" in resp.json()["error"]["message"]
        assert sent == []


class TestReplyValidation:
    @pytest.mark.parametrize("message", ["", "   ", "가" * 1001])
    async def test_bad_message_400(
        self, client, auth_headers, tenant, test_inquiry, sent, message
    ):
        resp = await client.post(
            URL.format(id=test_inquiry["id"]),
            json={"message": message},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
        assert sent == []

    async def test_max_length_ok(
        self, client, auth_headers, tenant, test_inquiry, sent
    ):
        resp = await client.post(
            URL.format(id=test_inquiry["id"]),
            json={"message": "가" * 1000},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text

    async def test_unauthenticated_401(self, client, test_inquiry):
        resp = await client.post(
            URL.format(id=test_inquiry["id"]), json={"message": "답변"}
        )
        assert resp.status_code == 401

    async def test_not_found_404(self, client, auth_headers, tenant, sent):
        resp = await client.post(
            URL.format(id=uuid.uuid4()), json={"message": "답변"}, headers=auth_headers
        )
        assert resp.status_code == 404

    async def test_viewer_403(self, client, tenant, test_inquiry, sent):
        user_id = uuid.uuid4()
        await _sql(
            "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
            " created_at, updated_at)"
            " VALUES (:id, :t, :e, 'x', 'TENANT_VIEWER', true, now(), now())",
            id=str(user_id),
            t=tenant["id"],
            e=f"{user_id.hex[:8]}@example.com",
        )
        token = create_access_token(
            user_id=user_id, tenant_id=uuid.UUID(tenant["id"]), role="TENANT_VIEWER"
        )
        resp = await client.post(
            URL.format(id=test_inquiry["id"]),
            json={"message": "답변"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
        assert sent == []

    async def test_other_tenant_404(self, client, test_inquiry, sent):
        """다른 사업체 관리자는 남의 문의에 답장할 수 없다 (RLS)."""
        tenant_id = uuid.uuid4()
        user_id = uuid.uuid4()
        await _sql(
            "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
            " updated_at) VALUES (:id, 'other', :s, 'STANDARD', true, now(), now())",
            id=str(tenant_id),
            s=f"other-{tenant_id.hex[:8]}",
        )
        await _sql(
            "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
            " created_at, updated_at)"
            " VALUES (:id, :t, :e, 'x', 'TENANT_ADMIN', true, now(), now())",
            id=str(user_id),
            t=str(tenant_id),
            e=f"{user_id.hex[:8]}@example.com",
        )
        token = create_access_token(
            user_id=user_id, tenant_id=tenant_id, role="TENANT_ADMIN"
        )
        try:
            resp = await client.post(
                URL.format(id=test_inquiry["id"]),
                json={"message": "해킹 시도"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 404
            assert sent == []
        finally:
            await _sql("DELETE FROM users WHERE tenant_id = :t", t=str(tenant_id))
            await _sql("DELETE FROM tenants WHERE id = :t", t=str(tenant_id))


class TestSmsType:
    def test_short_is_sms(self):
        assert notification_service.sms_type("가" * 45) == "SMS"

    def test_long_is_lms(self):
        assert notification_service.sms_type("가" * 46) == "LMS"
        assert notification_service.sms_type("a" * 91) == "LMS"
