"""T-108 방문자 회원 인증 API 테스트 (기획서 16.3 · 16.4 · 16.10 · 16.11).

- 가입 → 자동 로그인 → refresh 회전 → 로그아웃
- 가입 실패: 이메일 중복 409, 휴대폰 인증(없음·만료·용도·재사용) 400, 입력 검증 400
- 탈퇴 후 같은 이메일 재가입 (오픈 이슈 #22 옵션 A)
- 로그인 실패 401 · 비활성 403 · 5회 실패 30분 잠금 429
- 격리: 다른 테넌트 로그인·토큰, 방문자 토큰 ↔ 어드민 API 403
- 가입 알림(Celery) · Rate Limit
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.api.public import member_auth as member_auth_api
from app.core.security import create_member_access_token
from app.workers import notification as notification_worker
from tests.conftest import _TestSession  # type: ignore

PASSWORD = "abcd1234"
PHONE = "010-1234-5678"


def _base(slug: str) -> str:
    return f"/api/public/{slug}/auth"


async def _admin_sql(sql: str, params: dict | None = None):
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        result = await session.execute(text(sql), params or {})
        await session.commit()
        return result


async def _verified_phone(
    tenant_id: str,
    phone: str = PHONE,
    purpose: str = "REGISTER",
    verified_minutes_ago: int = 1,
) -> str:
    vid = str(uuid.uuid4())
    verified_at = datetime.now(UTC) - timedelta(minutes=verified_minutes_ago)
    await _admin_sql(
        "INSERT INTO phone_verifications (id, tenant_id, phone, code, purpose,"
        " expires_at, verified_at) VALUES (:id, :t, :p, '123456', :purpose,"
        " :exp, :ver)",
        {
            "id": vid,
            "t": tenant_id,
            "p": phone,
            "purpose": purpose,
            "exp": verified_at + timedelta(minutes=3),
            "ver": verified_at,
        },
    )
    return vid


def _register_body(verification_id: str, **overrides) -> dict:
    body = {
        "name": "홍길동",
        "email": "Hong@Email.com",
        "password": PASSWORD,
        "password_confirm": PASSWORD,
        "phone": PHONE,
        "phone_verification_id": verification_id,
        "terms_agree": True,
        "privacy_agree": True,
        "marketing_agree": True,
    }
    body.update(overrides)
    return body


@pytest.fixture(autouse=True)
def joined_alerts(monkeypatch) -> list:
    """가입 알림 Celery enqueue 를 가로챈다."""
    calls: list = []

    class _FakeTask:
        def delay(self, tenant_id: str, member_id: str) -> None:
            calls.append((tenant_id, member_id))

    monkeypatch.setattr(notification_worker, "send_member_joined_alert", _FakeTask())
    return calls


async def _register(client: AsyncClient, tenant: dict, **overrides):
    vid = await _verified_phone(tenant["id"])
    return await client.post(
        f"{_base(tenant['slug'])}/register", json=_register_body(vid, **overrides)
    )


def _use_refresh(client: AsyncClient, token: str | None) -> None:
    """refresh 쿠키를 직접 지정 (path=/ 로 넣어 다른 테넌트 경로에도 보내 본다)."""
    client.cookies.clear()
    if token:
        client.cookies.set("member_refresh_token", token)


async def _login(client: AsyncClient, slug: str, password: str = PASSWORD, **extra):
    return await client.post(
        f"{_base(slug)}/login",
        json={"email": "hong@email.com", "password": password, **extra},
    )


class TestRegister:
    async def test_register_logs_in_and_queues_alert(
        self, client: AsyncClient, test_tenant: dict, joined_alerts: list
    ):
        resp = await _register(client, test_tenant)
        assert resp.status_code == 201, resp.text
        data = resp.json()["data"]
        assert data["access_token"]
        assert data["member"]["email"] == "hong@email.com"  # 소문자 저장
        cookie = resp.headers["set-cookie"]
        assert "member_refresh_token=" in cookie
        assert f"Path=/api/public/{test_tenant['slug']}" in cookie
        assert "HttpOnly" in cookie and "Domain" not in cookie
        assert "Max-Age" not in cookie  # 가입 직후는 세션 쿠키

        row = (
            await _admin_sql(
                "SELECT m.phone, m.marketing_agree, m.password_hash, v.used_at"
                " FROM site_members m JOIN phone_verifications v"
                " ON v.tenant_id = m.tenant_id WHERE m.tenant_id = :t",
                {"t": test_tenant["id"]},
            )
        ).one()
        assert row.phone == PHONE and row.marketing_agree is True
        assert row.password_hash.startswith("$2b$12$")  # bcrypt rounds=12
        assert row.used_at is not None
        assert joined_alerts == [(test_tenant["id"], data["member"]["id"])]

    async def test_duplicate_email_conflict(
        self, client: AsyncClient, test_tenant: dict
    ):
        assert (await _register(client, test_tenant)).status_code == 201
        resp = await _register(client, test_tenant, email="HONG@email.com")
        assert resp.status_code == 409
        error = resp.json()["error"]
        assert error["code"] == "CONFLICT"
        assert error["message"] == "이미 사용 중인 이메일입니다"
        assert error["field"] == "email"

    @pytest.mark.parametrize(
        "case", ["missing", "expired", "wrong_purpose", "other_phone", "used"]
    )
    async def test_phone_not_verified(
        self, client: AsyncClient, test_tenant: dict, case: str
    ):
        tid = test_tenant["id"]
        if case == "missing":
            vid = str(uuid.uuid4())
        elif case == "expired":
            vid = await _verified_phone(tid, verified_minutes_ago=31)
        elif case == "wrong_purpose":
            vid = await _verified_phone(tid, purpose="RESET_PW")
        elif case == "other_phone":
            vid = await _verified_phone(tid, phone="010-9999-8888")
        else:
            vid = await _verified_phone(tid)
            first = await client.post(
                f"{_base(test_tenant['slug'])}/register",
                json=_register_body(vid, email="first@email.com"),
            )
            assert first.status_code == 201
        resp = await client.post(
            f"{_base(test_tenant['slug'])}/register", json=_register_body(vid)
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "PHONE_NOT_VERIFIED"

    async def test_validation_error_format(
        self, client: AsyncClient, test_tenant: dict
    ):
        resp = await _register(
            client, test_tenant, password="short", password_confirm="short"
        )
        assert resp.status_code == 400
        error = resp.json()["error"]
        assert error["code"] == "VALIDATION_ERROR"
        assert error["field"] == "password"
        assert "8자 이상" in error["message"]

    async def test_validation_messages_are_korean(
        self, client: AsyncClient, test_tenant: dict
    ):
        url = f"{_base(test_tenant['slug'])}/check-email"
        bad = await client.get(url, params={"email": "hong@member.test"})
        assert bad.status_code == 400
        assert bad.json()["error"]["message"] == "올바른 이메일 형식이 아닙니다"
        missing = await client.get(url)
        assert missing.json()["error"]["message"] == "필수 입력 항목입니다"

    async def test_rejoin_after_withdraw(self, client: AsyncClient, test_tenant: dict):
        assert (await _register(client, test_tenant)).status_code == 201
        await _admin_sql(
            "UPDATE site_members SET deleted_at = now() WHERE tenant_id = :t",
            {"t": test_tenant["id"]},
        )
        check = await client.get(
            f"{_base(test_tenant['slug'])}/check-email",
            params={"email": "hong@email.com"},
        )
        assert check.json()["data"]["available"] is True
        assert (await _register(client, test_tenant)).status_code == 201

    async def test_check_email(self, client: AsyncClient, test_tenant: dict):
        url = f"{_base(test_tenant['slug'])}/check-email"
        before = await client.get(url, params={"email": "hong@email.com"})
        assert before.json()["data"] == {"email": "hong@email.com", "available": True}
        await _register(client, test_tenant)
        after = await client.get(url, params={"email": "HONG@email.com"})
        assert after.json()["data"]["available"] is False

    async def test_unknown_tenant_404(self, client: AsyncClient):
        resp = await client.get(
            f"{_base('no-such-tenant')}/check-email", params={"email": "a@b.com"}
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "NOT_FOUND"


class TestLogin:
    async def test_login_refresh_logout_flow(
        self, client: AsyncClient, test_tenant: dict
    ):
        slug = test_tenant["slug"]
        await _register(client, test_tenant)
        client.cookies.clear()

        login = await _login(client, slug, remember_me=True)
        assert login.status_code == 200, login.text
        assert "Max-Age=604800" in login.headers["set-cookie"]
        old_refresh = client.cookies.get("member_refresh_token")
        assert old_refresh

        refreshed = await client.post(f"{_base(slug)}/refresh")
        assert refreshed.status_code == 200
        access = refreshed.json()["data"]["access_token"]
        new_refresh = client.cookies.get("member_refresh_token")
        assert new_refresh and new_refresh != old_refresh
        assert "Max-Age=604800" in refreshed.headers["set-cookie"]  # 유지 설정 이어감

        # 직접 넣은 쿠키도 전달된다 (아래 401 검증이 쿠키 누락 때문이 아님을 보장)
        _use_refresh(client, new_refresh)
        again = await client.post(f"{_base(slug)}/refresh")
        assert again.status_code == 200
        new_refresh = again.cookies.get("member_refresh_token")
        access = again.json()["data"]["access_token"]

        # 회전된 이전 refresh 토큰은 재사용 불가
        _use_refresh(client, old_refresh)
        reuse = await client.post(f"{_base(slug)}/refresh")
        assert reuse.status_code == 401

        _use_refresh(client, new_refresh)
        logout = await client.post(
            f"{_base(slug)}/logout", headers={"Authorization": f"Bearer {access}"}
        )
        assert logout.status_code == 200
        assert 'member_refresh_token=""' in logout.headers["set-cookie"]
        _use_refresh(client, new_refresh)
        after = await client.post(f"{_base(slug)}/refresh")
        assert after.status_code == 401

    async def test_wrong_password_and_social_only(
        self, client: AsyncClient, test_tenant: dict
    ):
        await _register(client, test_tenant)
        resp = await _login(client, test_tenant["slug"], password="wrong1234")
        assert resp.status_code == 401
        assert resp.json()["error"] == {
            "code": "INVALID_CREDENTIALS",
            "message": "이메일 또는 비밀번호를 확인해주세요",
            "field": None,
            "details": None,
        }
        unknown = await client.post(
            f"{_base(test_tenant['slug'])}/login",
            json={"email": "nobody@email.com", "password": PASSWORD},
        )
        assert unknown.status_code == 401

        await _admin_sql(
            "INSERT INTO site_members (tenant_id, email, name, social_provider,"
            " social_id) VALUES (:t, 'kakao@email.com', '카카오', 'KAKAO', 'k-1')",
            {"t": test_tenant["id"]},
        )
        social = await client.post(
            f"{_base(test_tenant['slug'])}/login",
            json={"email": "kakao@email.com", "password": PASSWORD},
        )
        assert social.status_code == 401

    async def test_inactive_account(self, client: AsyncClient, test_tenant: dict):
        await _register(client, test_tenant)
        await _admin_sql(
            "UPDATE site_members SET is_active = false WHERE tenant_id = :t",
            {"t": test_tenant["id"]},
        )
        resp = await _login(client, test_tenant["slug"])
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "ACCOUNT_INACTIVE"

    async def test_lock_after_five_failures(
        self, client: AsyncClient, test_tenant: dict
    ):
        slug = test_tenant["slug"]
        await _register(client, test_tenant)
        for _ in range(4):
            assert (await _login(client, slug, password="wrong1234")).status_code == 401
        fifth = await _login(client, slug, password="wrong1234")
        assert fifth.status_code == 429
        error = fifth.json()["error"]
        assert error["code"] == "ACCOUNT_LOCKED"
        assert 1790 <= error["details"][0]["retry_after_seconds"] <= 1800
        assert fifth.headers["retry-after"]

        # 잠금 중에는 올바른 비밀번호도 거부
        assert (await _login(client, slug)).status_code == 429

        # 잠금 시간이 지나면 로그인 가능 + 실패 횟수 초기화
        await _admin_sql(
            "UPDATE site_members SET locked_until = now() - interval '1 minute'"
            " WHERE tenant_id = :t",
            {"t": test_tenant["id"]},
        )
        assert (await _login(client, slug)).status_code == 200
        state = (
            await _admin_sql(
                "SELECT failed_login_count, locked_until, last_login_at"
                " FROM site_members WHERE tenant_id = :t",
                {"t": test_tenant["id"]},
            )
        ).one()
        assert state.failed_login_count == 0 and state.locked_until is None
        assert state.last_login_at is not None


@pytest.fixture
async def other_tenant():
    tid = str(uuid.uuid4())
    slug = f"other-{tid[:8]}"
    await _admin_sql(
        "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
        " updated_at) VALUES (:id, '다른 사이트', :slug, 'FREE', true, now(), now())",
        {"id": tid, "slug": slug},
    )
    yield {"id": tid, "slug": slug}
    await _admin_sql("DELETE FROM tenants WHERE id = :id", {"id": tid})


class TestIsolation:
    async def test_member_of_a_cannot_login_at_b(
        self, client: AsyncClient, test_tenant: dict, other_tenant: dict
    ):
        await _register(client, test_tenant)
        resp = await _login(client, other_tenant["slug"])
        assert resp.status_code == 401

    async def test_token_of_a_rejected_at_b(
        self, client: AsyncClient, test_tenant: dict, other_tenant: dict
    ):
        reg = await _register(client, test_tenant)
        access = reg.json()["data"]["access_token"]
        refresh = client.cookies.get("member_refresh_token")
        logout = await client.post(
            f"{_base(other_tenant['slug'])}/logout",
            headers={"Authorization": f"Bearer {access}"},
        )
        assert logout.status_code == 403
        _use_refresh(client, refresh)
        cross = await client.post(f"{_base(other_tenant['slug'])}/refresh")
        assert cross.status_code == 403

    async def test_member_token_forbidden_on_admin_api(
        self, client: AsyncClient, test_tenant: dict
    ):
        token = create_member_access_token(uuid.uuid4(), uuid.UUID(test_tenant["id"]))
        resp = await client.get(
            "/api/v1/sections", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 403

    async def test_admin_token_forbidden_on_member_api(
        self, client: AsyncClient, test_tenant: dict, auth_headers: dict
    ):
        resp = await client.post(
            f"{_base(test_tenant['slug'])}/logout", headers=auth_headers
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "FORBIDDEN"

    async def test_logout_requires_token(self, client: AsyncClient, test_tenant: dict):
        resp = await client.post(f"{_base(test_tenant['slug'])}/logout")
        assert resp.status_code == 401
        assert resp.json()["error"]["code"] == "UNAUTHORIZED"


class TestJoinedAlert:
    async def _member(self, tenant: dict) -> str:
        mid = str(uuid.uuid4())
        await _admin_sql(
            "INSERT INTO site_members (id, tenant_id, email, name, phone)"
            " VALUES (:id, :t, 'alert@email.com', '알림이', :p)",
            {"id": mid, "t": tenant["id"], "p": PHONE},
        )
        return mid

    async def test_sends_welcome_and_admin_alimtalk(self, test_tenant: dict):
        tid = test_tenant["id"]
        mid = await self._member(test_tenant)
        await _admin_sql(
            "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t", {"t": tid}
        )
        await _admin_sql(
            "INSERT INTO notification_settings (id, tenant_id, alimtalk_enabled,"
            " sms_enabled, recipient_phone, monthly_kakao_count, monthly_reset_at,"
            " created_at, updated_at) VALUES (gen_random_uuid(), :t, true, true,"
            " '010-1111-2222', 0, current_date, now(), now())",
            {"t": tid},
        )
        try:
            result = await notification_worker._send_member_joined_alert(tid, mid)
            assert result["welcome_sent"] is True
            assert result["kakao_sent"] is True and result["skipped"] is False
            count = (
                await _admin_sql(
                    "SELECT monthly_kakao_count FROM notification_settings"
                    " WHERE tenant_id = :t",
                    {"t": tid},
                )
            ).scalar_one()
            assert count == 1
        finally:
            await _admin_sql(
                "DELETE FROM notification_settings WHERE tenant_id = :t", {"t": tid}
            )

    async def test_skips_admin_alert_without_setting(self, test_tenant: dict):
        mid = await self._member(test_tenant)
        result = await notification_worker._send_member_joined_alert(
            test_tenant["id"], mid
        )
        assert result["welcome_sent"] is True
        assert result["skipped"] is True and result["reason"] == "NO_SETTING"


class TestRateLimit:
    async def test_auth_api_limited_to_10_per_minute(
        self, client: AsyncClient, test_tenant: dict
    ):
        limiter = member_auth_api.limiter
        limiter.reset()
        limiter.enabled = True
        try:
            url = f"{_base(test_tenant['slug'])}/refresh"
            codes = [(await client.post(url)).status_code for _ in range(11)]
        finally:
            limiter.enabled = False
            limiter.reset()
        assert codes[:10] == [401] * 10
        assert codes[10] == 429
