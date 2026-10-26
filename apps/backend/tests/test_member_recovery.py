"""T-109 휴대폰 인증 · 이메일 찾기 · 비밀번호 재설정 API 테스트 (기획서 16.5 · 16.6).

- phone/send: 발송 · 60초 재요청 간격 · 하루 5회 · debug_code 조건
- phone/verify: 성공 · 오입력 남은 횟수 · 5회 초과 무효 · 만료 · 다른 테넌트
- find-email: 마스킹 · 여러 계정 · 불일치 404 · 용도/사용 인증 거부 · 탈퇴 제외
- forgot-password: 계정 유무 같은 응답 · 일치할 때만 메일 · 해시 저장 · 이전 링크 무효
- reset-password: 새 비밀번호 로그인 · 재사용·만료 TOKEN_EXPIRED · 잠금 해제
  · 변경 전 refresh/access 토큰 거부 · 보안 알림
- 시나리오: 실제 발송·확인 API 로 가입 → 이메일 찾기 → 재설정
"""

import hashlib
import uuid
from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.services import member_verification
from app.services import notification as notification_service
from app.services.member_recovery import mask_email
from app.workers import email as email_worker
from app.workers import notification as notification_worker
from tests.conftest import _TestSession  # type: ignore

PHONE = "010-2222-3333"
PASSWORD = "abcd1234"


def _base(slug: str) -> str:
    return f"/api/public/{slug}/auth"


async def _sql(sql: str, params: dict | None = None):
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        result = await session.execute(text(sql), params or {})
        await session.commit()
        return result


@pytest.fixture(autouse=True)
def outbox(monkeypatch) -> dict:
    """SMS · 메일 · Celery enqueue 를 가로챈다."""
    box: dict = {"sms": [], "email": [], "password_changed": [], "joined": []}

    async def _fake_sms(to: str, message: str) -> bool:
        box["sms"].append((to, message))
        return True

    class _Email:
        def delay(self, to, subject, template, variables):
            box["email"].append(
                {"to": to, "subject": subject, "template": template, **variables}
            )

    class _Task:
        def __init__(self, key: str) -> None:
            self.key = key

        def delay(self, tenant_id: str, member_id: str) -> None:
            box[self.key].append((tenant_id, member_id))

    monkeypatch.setattr(notification_service, "send_sms", _fake_sms)
    monkeypatch.setattr(email_worker, "send_email_async", _Email())
    monkeypatch.setattr(
        notification_worker, "send_member_password_changed", _Task("password_changed")
    )
    monkeypatch.setattr(
        notification_worker, "send_member_joined_alert", _Task("joined")
    )
    return box


async def _send(client: AsyncClient, slug: str, purpose: str, phone: str = PHONE):
    return await client.post(
        f"{_base(slug)}/phone/send", json={"phone": phone, "purpose": purpose}
    )


async def _verified(
    client: AsyncClient, slug: str, purpose: str, phone: str = PHONE
) -> str:
    """실제 발송 → 확인 API 로 인증 완료된 id (재요청 간격은 기록을 당겨 피한다)."""
    await _sql(
        "UPDATE phone_verifications SET created_at = created_at - interval '2 minutes'"
        " WHERE phone = :p",
        {"p": phone},
    )
    sent = await _send(client, slug, purpose, phone)
    assert sent.status_code == 200, sent.text
    data = sent.json()["data"]
    verify = await client.post(
        f"{_base(slug)}/phone/verify",
        json={"verification_id": data["verification_id"], "code": data["debug_code"]},
    )
    assert verify.status_code == 200, verify.text
    return data["verification_id"]


async def _signup(
    client: AsyncClient, slug: str, email: str = "hong@example.com", **extra
) -> dict:
    vid = await _verified(client, slug, "REGISTER")
    resp = await client.post(
        f"{_base(slug)}/register",
        json={
            "name": "홍길동",
            "email": email,
            "password": PASSWORD,
            "password_confirm": PASSWORD,
            "phone": PHONE,
            "phone_verification_id": vid,
            "terms_agree": True,
            "privacy_agree": True,
            **extra,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _login(client: AsyncClient, slug: str, password: str = PASSWORD):
    return await client.post(
        f"{_base(slug)}/login",
        json={"email": "hong@example.com", "password": password},
    )


class TestPhoneSend:
    async def test_send_creates_code_and_sms(
        self, client: AsyncClient, test_tenant: dict, outbox: dict
    ):
        resp = await _send(client, test_tenant["slug"], "REGISTER", "01022223333")
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["resend_after_seconds"] == 60
        code = data["debug_code"]
        assert len(code) == 6 and code.isdigit()
        assert outbox["sms"] == [
            (
                PHONE,
                f"[Test Tenant {test_tenant['slug']}] 인증번호 [{code}]를"
                " 입력해주세요. (3분 내)",
            )
        ]
        row = (
            await _sql(
                "SELECT phone, purpose, expires_at - created_at AS ttl"
                " FROM phone_verifications WHERE id = :id",
                {"id": data["verification_id"]},
            )
        ).one()
        assert (row.phone, row.purpose) == (PHONE, "REGISTER")  # 번호 형식 통일
        assert abs(row.ttl - timedelta(minutes=3)) < timedelta(seconds=5)

    async def test_resend_wait_and_daily_limit(
        self, client: AsyncClient, test_tenant: dict
    ):
        slug = test_tenant["slug"]
        assert (await _send(client, slug, "REGISTER")).status_code == 200
        again = await _send(client, slug, "FIND_EMAIL")  # 용도가 달라도 같은 번호
        assert again.status_code == 429
        assert again.json()["error"]["code"] == "RATE_LIMIT_EXCEEDED"
        assert 0 < again.json()["error"]["details"][0]["retry_after_seconds"] <= 60

        for minutes in (10, 20, 30, 40):
            await _sql(
                "INSERT INTO phone_verifications (tenant_id, phone, code, purpose,"
                " expires_at, created_at) VALUES (:t, :p, '000000', 'REGISTER',"
                " now(), now() - make_interval(mins => :m))",
                {"t": test_tenant["id"], "p": PHONE, "m": minutes},
            )
        await _sql(
            "UPDATE phone_verifications SET created_at = created_at - interval"
            " '2 minutes' WHERE tenant_id = :t",
            {"t": test_tenant["id"]},
        )
        sixth = await _send(client, slug, "REGISTER")
        assert sixth.status_code == 429
        assert sixth.json()["error"]["code"] == "PHONE_SEND_LIMIT"

    async def test_invalid_purpose_or_phone(
        self, client: AsyncClient, test_tenant: dict
    ):
        assert (await _send(client, test_tenant["slug"], "LOGIN")).status_code == 400
        bad = await _send(client, test_tenant["slug"], "REGISTER", "02-123-4567")
        assert bad.json()["error"]["field"] == "phone"

    async def test_debug_code_hidden_in_production(
        self, client: AsyncClient, test_tenant: dict, monkeypatch
    ):
        monkeypatch.setattr(member_verification.settings, "app_env", "production")
        resp = await _send(client, test_tenant["slug"], "REGISTER")
        assert resp.status_code == 200
        assert resp.json()["data"]["debug_code"] is None

    async def test_sms_failure_returns_503_without_row(
        self, client: AsyncClient, test_tenant: dict, monkeypatch
    ):
        async def _fail(to: str, message: str) -> bool:
            return False

        monkeypatch.setattr(notification_service, "send_sms", _fail)
        resp = await _send(client, test_tenant["slug"], "REGISTER")
        assert resp.status_code == 503
        count = (
            await _sql(
                "SELECT count(*) FROM phone_verifications WHERE tenant_id = :t",
                {"t": test_tenant["id"]},
            )
        ).scalar_one()
        assert count == 0


class TestPhoneVerify:
    async def _sent(self, client: AsyncClient, slug: str) -> dict:
        return (await _send(client, slug, "REGISTER")).json()["data"]

    async def _verify(self, client: AsyncClient, slug: str, vid: str, code: str):
        return await client.post(
            f"{_base(slug)}/phone/verify",
            json={"verification_id": vid, "code": code},
        )

    async def test_wrong_codes_then_locked(
        self, client: AsyncClient, test_tenant: dict
    ):
        slug = test_tenant["slug"]
        data = await self._sent(client, slug)
        wrong = "000000" if data["debug_code"] != "000000" else "111111"
        first = await self._verify(client, slug, data["verification_id"], wrong)
        assert first.status_code == 400
        assert first.json()["error"]["code"] == "INVALID_CODE"
        assert first.json()["error"]["details"] == [{"remaining_attempts": 4}]
        for _ in range(3):
            await self._verify(client, slug, data["verification_id"], wrong)
        fifth = await self._verify(client, slug, data["verification_id"], wrong)
        assert fifth.json()["error"]["code"] == "CODE_ATTEMPTS_EXCEEDED"
        right = await self._verify(
            client, slug, data["verification_id"], data["debug_code"]
        )
        assert right.status_code == 400
        assert right.json()["error"]["code"] == "CODE_ATTEMPTS_EXCEEDED"

    async def test_success_is_idempotent(self, client: AsyncClient, test_tenant: dict):
        slug = test_tenant["slug"]
        data = await self._sent(client, slug)
        for _ in range(2):
            ok = await self._verify(
                client, slug, data["verification_id"], data["debug_code"]
            )
            assert ok.status_code == 200
            assert ok.json()["data"]["verified"] is True

    async def test_expired(self, client: AsyncClient, test_tenant: dict):
        slug = test_tenant["slug"]
        data = await self._sent(client, slug)
        await _sql(
            "UPDATE phone_verifications SET expires_at = now() - interval '1 second'"
            " WHERE id = :id",
            {"id": data["verification_id"]},
        )
        resp = await self._verify(
            client, slug, data["verification_id"], data["debug_code"]
        )
        assert resp.json()["error"]["code"] == "CODE_EXPIRED"

    async def test_other_tenant_and_unknown(
        self, client: AsyncClient, test_tenant: dict, other_tenant: dict
    ):
        data = await self._sent(client, test_tenant["slug"])
        cross = await self._verify(
            client, other_tenant["slug"], data["verification_id"], data["debug_code"]
        )
        assert cross.status_code == 404
        unknown = await self._verify(
            client, test_tenant["slug"], str(uuid.uuid4()), "123456"
        )
        assert unknown.status_code == 404


@pytest.fixture
async def other_tenant():
    tid = str(uuid.uuid4())
    slug = f"other-{tid[:8]}"
    await _sql(
        "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
        " updated_at) VALUES (:id, '다른 사이트', :slug, 'FREE', true, now(), now())",
        {"id": tid, "slug": slug},
    )
    yield {"id": tid, "slug": slug}
    await _sql("DELETE FROM tenants WHERE id = :id", {"id": tid})


class TestMaskEmail:
    @pytest.mark.parametrize(
        ("email", "masked"),
        [
            ("hongil@email.com", "ho****@email.com"),
            ("abc@x.com", "ab*@x.com"),
            ("ab@x.com", "a*@x.com"),
            ("a@x.com", "a*@x.com"),
        ],
    )
    def test_mask(self, email: str, masked: str):
        assert mask_email(email) == masked


class TestFindEmail:
    async def _find(self, client: AsyncClient, slug: str, name: str, vid: str):
        return await client.post(
            f"{_base(slug)}/find-email",
            json={"name": name, "phone_verification_id": vid},
        )

    async def test_finds_masked_accounts(self, client: AsyncClient, test_tenant: dict):
        slug = test_tenant["slug"]
        await _signup(client, slug, email="hongil@email.com")
        await _sql(
            "INSERT INTO site_members (tenant_id, email, name, phone, social_provider,"
            " social_id, created_at) VALUES (:t, 'kakao@email.com', '홍길동', :p,"
            " 'KAKAO', 'k-9', now() + interval '1 second')",
            {"t": test_tenant["id"], "p": PHONE},
        )
        await _sql(
            "INSERT INTO site_members (tenant_id, email, name, phone, deleted_at)"
            " VALUES (:t, 'gone@email.com', '홍길동', :p, now())",
            {"t": test_tenant["id"], "p": PHONE},
        )
        vid = await _verified(client, slug, "FIND_EMAIL")
        resp = await self._find(client, slug, "홍길동", vid)
        assert resp.status_code == 200, resp.text
        accounts = resp.json()["data"]["accounts"]
        assert [(a["masked_email"], a["social_provider"]) for a in accounts] == [
            ("ho****@email.com", None),
            ("ka***@email.com", "KAKAO"),
        ]
        # 찾은 뒤에는 같은 인증을 다시 쓸 수 없다
        again = await self._find(client, slug, "홍길동", vid)
        assert again.json()["error"]["code"] == "PHONE_NOT_VERIFIED"

    async def test_no_match_keeps_verification(
        self, client: AsyncClient, test_tenant: dict
    ):
        slug = test_tenant["slug"]
        await _signup(client, slug)
        vid = await _verified(client, slug, "FIND_EMAIL")
        miss = await self._find(client, slug, "김철수", vid)
        assert miss.status_code == 404
        assert miss.json()["error"]["message"] == (
            "입력하신 정보와 일치하는 계정을 찾을 수 없습니다."
        )
        # 이름 오타는 인증을 다시 받지 않고 재시도 가능
        assert (await self._find(client, slug, "홍길동", vid)).status_code == 200

    async def test_wrong_purpose_rejected(self, client: AsyncClient, test_tenant: dict):
        slug = test_tenant["slug"]
        vid = await _verified(client, slug, "RESET_PW")
        resp = await self._find(client, slug, "홍길동", vid)
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "PHONE_NOT_VERIFIED"


class TestPasswordReset:
    async def _forgot(self, client: AsyncClient, slug: str, email: str, vid: str):
        return await client.post(
            f"{_base(slug)}/forgot-password",
            json={"email": email, "phone_verification_id": vid},
        )

    async def _token_from(self, outbox: dict) -> str:
        url = outbox["email"][-1]["reset_url"]
        return url.split("token=")[1]

    async def test_same_response_whether_account_exists(
        self, client: AsyncClient, test_tenant: dict, outbox: dict
    ):
        slug = test_tenant["slug"]
        await _signup(client, slug, email="hongil@example.com")
        vid = await _verified(client, slug, "RESET_PW")
        known = await self._forgot(client, slug, "hongil@example.com", vid)
        unknown = await self._forgot(client, slug, "hongim@example.com", vid)
        assert known.status_code == unknown.status_code == 200
        # 가린 이메일이 같도록 앞 2자리가 같은 주소로 비교 — 응답 본문(meta 제외) 동일
        assert known.json()["data"] == unknown.json()["data"]
        assert known.json()["data"]["expires_in_minutes"] == 30
        # 메일은 실제 계정에만
        assert [m["to"] for m in outbox["email"]] == ["hongil@example.com"]
        assert outbox["email"][0]["template"] == "member_reset_password"
        assert (
            f"/{slug}/member/reset-password?token=" in outbox["email"][0]["reset_url"]
        )

    async def test_phone_mismatch_sends_nothing(
        self, client: AsyncClient, test_tenant: dict, outbox: dict
    ):
        slug = test_tenant["slug"]
        await _signup(client, slug)
        vid = await _verified(client, slug, "RESET_PW", phone="010-9999-0000")
        resp = await self._forgot(client, slug, "hong@example.com", vid)
        assert resp.status_code == 200
        assert outbox["email"] == []

    async def test_token_hashed_and_previous_invalidated(
        self, client: AsyncClient, test_tenant: dict, outbox: dict
    ):
        slug = test_tenant["slug"]
        await _signup(client, slug)
        vid = await _verified(client, slug, "RESET_PW")
        await self._forgot(client, slug, "hong@example.com", vid)
        first = await self._token_from(outbox)

        # 60초 안 재발송은 거부 (계정 유무와 관계없이 이메일 기준)
        wait = await self._forgot(client, slug, "hong@example.com", vid)
        assert wait.status_code == 429
        from app.core.redis import get_redis

        redis = await get_redis()
        await redis.delete(
            f"member_reset_cooldown:{test_tenant['id']}:hong@example.com"
        )

        # 같은 인증으로 재발송 → 이전 링크는 무효
        assert (
            await self._forgot(client, slug, "hong@example.com", vid)
        ).status_code == 200
        second = await self._token_from(outbox)
        assert first != second
        stored = (
            await _sql(
                "SELECT token_hash, used_at FROM member_password_reset_tokens"
                " WHERE tenant_id = :t ORDER BY created_at",
                {"t": test_tenant["id"]},
            )
        ).all()
        assert [r.token_hash for r in stored] == [
            hashlib.sha256(first.encode()).hexdigest(),
            hashlib.sha256(second.encode()).hexdigest(),
        ]
        assert stored[0].used_at is not None and stored[1].used_at is None
        old = await client.get(
            f"{_base(slug)}/reset-password/check", params={"token": first}
        )
        assert old.json()["error"]["code"] == "TOKEN_EXPIRED"

    async def test_reset_flow_revokes_sessions_and_blocks_reuse(
        self, client: AsyncClient, test_tenant: dict, outbox: dict
    ):
        slug = test_tenant["slug"]
        signup = await _signup(client, slug)
        old_access = signup["access_token"]
        old_refresh = client.cookies.get("member_refresh_token")
        # 잠긴 계정도 재설정하면 풀린다
        await _sql(
            "UPDATE site_members SET failed_login_count = 3,"
            " locked_until = now() + interval '20 minutes' WHERE tenant_id = :t",
            {"t": test_tenant["id"]},
        )
        vid = await _verified(client, slug, "RESET_PW")
        await self._forgot(client, slug, "hong@example.com", vid)
        token = await self._token_from(outbox)

        check = await client.get(
            f"{_base(slug)}/reset-password/check", params={"token": token}
        )
        assert check.json()["data"] == {
            "valid": True,
            "masked_email": "ho**@example.com",
        }

        body = {
            "token": token,
            "password": "newpass99",
            "password_confirm": "newpass99",
        }
        reset = await client.post(f"{_base(slug)}/reset-password", json=body)
        assert reset.status_code == 200, reset.text
        assert outbox["password_changed"] == [
            (test_tenant["id"], signup["member"]["id"])
        ]

        reuse = await client.post(f"{_base(slug)}/reset-password", json=body)
        assert reuse.status_code == 400
        assert reuse.json()["error"]["message"] == "유효하지 않거나 만료된 링크입니다."

        assert (await _login(client, slug)).status_code == 401
        assert (await _login(client, slug, "newpass99")).status_code == 200

        # 변경 전에 발급된 토큰은 모두 거부
        client.cookies.clear()
        client.cookies.set("member_refresh_token", old_refresh)
        assert (await client.post(f"{_base(slug)}/refresh")).status_code == 401
        old_logout = await client.post(
            f"{_base(slug)}/logout", headers={"Authorization": f"Bearer {old_access}"}
        )
        assert old_logout.status_code == 401

    async def test_expired_token(
        self, client: AsyncClient, test_tenant: dict, outbox: dict
    ):
        slug = test_tenant["slug"]
        await _signup(client, slug)
        vid = await _verified(client, slug, "RESET_PW")
        await self._forgot(client, slug, "hong@example.com", vid)
        token = await self._token_from(outbox)
        await _sql(
            "UPDATE member_password_reset_tokens SET expires_at = now()"
            " - interval '1 second' WHERE tenant_id = :t",
            {"t": test_tenant["id"]},
        )
        resp = await client.post(
            f"{_base(slug)}/reset-password",
            json={
                "token": token,
                "password": "newpass99",
                "password_confirm": "newpass99",
            },
        )
        assert resp.json()["error"]["code"] == "TOKEN_EXPIRED"

    async def test_token_of_other_tenant_rejected(
        self, client: AsyncClient, test_tenant: dict, other_tenant: dict, outbox: dict
    ):
        slug = test_tenant["slug"]
        await _signup(client, slug)
        vid = await _verified(client, slug, "RESET_PW")
        await self._forgot(client, slug, "hong@example.com", vid)
        token = await self._token_from(outbox)
        resp = await client.get(
            f"{_base(other_tenant['slug'])}/reset-password/check",
            params={"token": token},
        )
        assert resp.json()["error"]["code"] == "TOKEN_EXPIRED"


class TestPasswordChangedAlert:
    async def test_sends_email_and_sms_regardless_of_sms_agree(
        self, test_tenant: dict, outbox: dict, monkeypatch
    ):
        sent_emails: list = []

        async def _fake_send_email(to, subject, template, variables):
            sent_emails.append((to, template))
            return {"sent": True, "stub": True}

        from app.services import email as email_service

        monkeypatch.setattr(email_service, "send_email", _fake_send_email)
        mid = str(uuid.uuid4())
        await _sql(
            "INSERT INTO site_members (id, tenant_id, email, name, phone, sms_agree,"
            " password_changed_at) VALUES (:id, :t, 'pw@example.com', '보안이', :p,"
            " false, now())",
            {"id": mid, "t": test_tenant["id"], "p": PHONE},
        )
        result = await notification_worker._send_member_password_changed(
            test_tenant["id"], mid
        )
        assert result == {"email_sent": True, "sms_sent": True, "reason": ""}
        assert sent_emails == [("pw@example.com", "member_password_changed")]
        assert outbox["sms"][0][0] == PHONE


class TestSignupWithRealVerification:
    async def test_register_using_phone_apis(
        self, client: AsyncClient, test_tenant: dict, outbox: dict
    ):
        data = await _signup(client, test_tenant["slug"])
        assert data["member"]["email"] == "hong@example.com"
        assert outbox["joined"] == [(test_tenant["id"], data["member"]["id"])]
        # 인증하지 않은(확인 전) 요청으로는 가입 불가
        sent = await _send(client, test_tenant["slug"], "REGISTER", "010-4444-5555")
        assert sent.status_code == 200
        resp = await client.post(
            f"{_base(test_tenant['slug'])}/register",
            json={
                "name": "김미인증",
                "email": "noverify@example.com",
                "password": PASSWORD,
                "password_confirm": PASSWORD,
                "phone": "010-4444-5555",
                "phone_verification_id": sent.json()["data"]["verification_id"],
                "terms_agree": True,
                "privacy_agree": True,
            },
        )
        assert resp.json()["error"]["code"] == "PHONE_NOT_VERIFIED"
