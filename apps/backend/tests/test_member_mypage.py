"""T-111 방문자 마이페이지 · 탈퇴 API 테스트 (기획서 16.7 · 16.8).

- 내 정보: 조회 · 수정, 이메일 변경 거부, 연락처 변경은 MYPAGE 인증 필요
- 비밀번호: 현재 비밀번호 확인, 변경 후 이전 토큰 거부 · 새 토큰 유지,
  소셜 가입자 첫 설정
- 알림 설정: 일부만 변경
- 회원 접수 연결: 로그인 예약 → member_id + 내 예약(업종별 유형), 비회원은 NULL
- 내 예약: 상태 · 기간 필터, 취소 (지난 · 완료 · 남의 예약 거부)
- 내 문의: 내 것만, 답변 상태, 상담 글 포함, 남의 문의 404
- 탈퇴: 진행 중 예약 409, 비밀번호 확인, 익명화 · 로그인 불가 · 재가입 · 안내
  · 문의 보존
- 격리: 어드민 토큰 · 다른 테넌트 토큰 403
"""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.workers import notification as notification_worker
from tests.conftest import _TestSession  # type: ignore

PASSWORD = "abcd1234"
PHONE = "010-5555-1234"


def _members(slug: str) -> str:
    return f"/api/public/{slug}/members"


async def _sql(sql: str, params: dict | None = None):
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        result = await session.execute(text(sql), params or {})
        await session.commit()
        return result


async def _verified(tenant_id: str, purpose: str = "REGISTER", phone: str = PHONE):
    vid = str(uuid.uuid4())
    now = datetime.now(UTC)
    await _sql(
        "INSERT INTO phone_verifications (id, tenant_id, phone, code, purpose,"
        " expires_at, verified_at) VALUES (:id, :t, :p, '123456', :pu, :e, :n)",
        {
            "id": vid,
            "t": tenant_id,
            "p": phone,
            "pu": purpose,
            "e": now + timedelta(minutes=3),
            "n": now,
        },
    )
    return vid


@pytest.fixture(autouse=True)
def outbox(monkeypatch) -> dict:
    box: dict = {"password_changed": [], "withdrawn": []}

    class _Task:
        def __init__(self, key: str | None) -> None:
            self.key = key

        def delay(self, *args) -> None:
            if self.key:
                box[self.key].append(args)

    monkeypatch.setattr(notification_worker, "send_member_joined_alert", _Task(None))
    monkeypatch.setattr(notification_worker, "send_inquiry_alert", _Task(None))
    monkeypatch.setattr(
        notification_worker, "send_member_password_changed", _Task("password_changed")
    )
    monkeypatch.setattr(
        notification_worker, "send_member_withdrawn", _Task("withdrawn")
    )
    return box


@pytest.fixture
async def member(client: AsyncClient, test_tenant: dict) -> dict:
    """가입 → 로그인 상태 (access token · refresh 쿠키)."""
    await _sql(
        "UPDATE tenants SET template_type = 'HOSPITAL' WHERE id = :t",
        {"t": test_tenant["id"]},
    )
    resp = await client.post(
        f"/api/public/{test_tenant['slug']}/auth/register",
        json={
            "name": "홍길동",
            "email": "hong@example.com",
            "password": PASSWORD,
            "password_confirm": PASSWORD,
            "phone": PHONE,
            "phone_verification_id": await _verified(test_tenant["id"]),
            "terms_agree": True,
            "privacy_agree": True,
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    yield {
        **test_tenant,
        "member_id": data["member"]["id"],
        "token": data["access_token"],
        "auth": {"Authorization": f"Bearer {data['access_token']}"},
    }
    await _sql("DELETE FROM inquiries WHERE tenant_id = :t", {"t": test_tenant["id"]})


async def _reserve(client: AsyncClient, m: dict, days: int = 3, auth: bool = True):
    when = date.today() + timedelta(days=days)
    resp = await client.post(
        "/api/public/inquiries",
        params={"tenant_slug": m["slug"]},
        headers=m["auth"] if auth else {},
        json={
            "inquiry_type": "RESERVATION",
            "name": "홍길동",
            "phone": PHONE,
            "subject": "첫 방문 상담",
            "message": "첫 방문 상담을 예약하고 싶습니다.",
            "reserved_date": when.isoformat(),
            "reserved_time": "10:30",
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["inquiry_id"]


class TestProfile:
    async def test_get_and_update(self, client: AsyncClient, member: dict):
        me = await client.get(f"{_members(member['slug'])}/me", headers=member["auth"])
        data = me.json()["data"]
        assert data["email"] == "hong@example.com" and data["has_password"] is True
        assert data["social_accounts"] == [] and "password_hash" not in data

        resp = await client.patch(
            f"{_members(member['slug'])}/me",
            headers=member["auth"],
            json={"name": "홍길순", "birth_date": "1990-01-01"},
        )
        assert resp.json()["data"]["name"] == "홍길순"
        assert resp.json()["data"]["birth_date"] == "1990-01-01"

    async def test_email_cannot_change(self, client: AsyncClient, member: dict):
        resp = await client.patch(
            f"{_members(member['slug'])}/me",
            headers=member["auth"],
            json={"email": "new@example.com"},
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    async def test_phone_change_needs_verification(
        self, client: AsyncClient, member: dict
    ):
        url = f"{_members(member['slug'])}/me"
        new_phone = "010-7777-1111"
        no_verify = await client.patch(
            url, headers=member["auth"], json={"phone": new_phone}
        )
        assert no_verify.json()["error"]["code"] == "PHONE_NOT_VERIFIED"
        wrong_purpose = await _verified(member["id"], "REGISTER", new_phone)
        rejected = await client.patch(
            url,
            headers=member["auth"],
            json={"phone": new_phone, "phone_verification_id": wrong_purpose},
        )
        assert rejected.status_code == 400
        vid = await _verified(member["id"], "MYPAGE", new_phone)
        ok = await client.patch(
            url,
            headers=member["auth"],
            json={"phone": "01077771111", "phone_verification_id": vid},
        )
        assert ok.status_code == 200, ok.text
        assert ok.json()["data"]["phone"] == new_phone

    async def test_notification_partial_update(self, client: AsyncClient, member: dict):
        url = f"{_members(member['slug'])}/me/notification"
        resp = await client.patch(
            url,
            headers=member["auth"],
            json={"marketing_agree": True, "notify_reservation_cancelled": False},
        )
        assert resp.json()["data"] == {
            "notify_reservation_confirmed": True,
            "notify_reservation_cancelled": False,
            "marketing_agree": True,
            "sms_agree": True,
            "email_agree": False,
        }
        assert (await client.get(url, headers=member["auth"])).json()["data"] == (
            resp.json()["data"]
        )


class TestPassword:
    async def test_change_revokes_other_sessions(
        self, client: AsyncClient, member: dict, outbox: dict
    ):
        slug = member["slug"]
        old_refresh = client.cookies.get("member_refresh_token")
        url = f"{_members(slug)}/me/password"
        body = {"password": "newpass99", "password_confirm": "newpass99"}
        wrong = await client.patch(
            url, headers=member["auth"], json={**body, "current_password": "nope1234"}
        )
        assert wrong.status_code == 401
        missing = await client.patch(url, headers=member["auth"], json=body)
        assert missing.json()["error"]["field"] == "current_password"

        ok = await client.patch(
            url, headers=member["auth"], json={**body, "current_password": PASSWORD}
        )
        assert ok.status_code == 200, ok.text
        new_access = ok.json()["data"]["access_token"]
        assert outbox["password_changed"] == [(member["id"], member["member_id"])]

        # 이 기기: 새 토큰으로 계속 사용 / 이전 토큰 · 다른 기기 refresh 는 거부
        me = await client.get(
            f"{_members(slug)}/me", headers={"Authorization": f"Bearer {new_access}"}
        )
        assert me.status_code == 200
        stale = await client.get(f"{_members(slug)}/me", headers=member["auth"])
        assert stale.status_code == 401
        client.cookies.clear()
        client.cookies.set("member_refresh_token", old_refresh)
        assert (
            await client.post(f"/api/public/{slug}/auth/refresh")
        ).status_code == 401

        login = await client.post(
            f"/api/public/{slug}/auth/login",
            json={"email": "hong@example.com", "password": "newpass99"},
        )
        assert login.status_code == 200

    async def test_social_member_sets_first_password_with_verification(
        self, client: AsyncClient, member: dict
    ):
        await _sql(
            "UPDATE site_members SET password_hash = NULL WHERE id = :id",
            {"id": member["member_id"]},
        )
        url = f"{_members(member['slug'])}/me/password"
        body = {"password": "first1234", "password_confirm": "first1234"}
        denied = await client.patch(url, headers=member["auth"], json=body)
        assert denied.json()["error"]["code"] == "PHONE_NOT_VERIFIED"
        other_phone = await _verified(member["id"], "MYPAGE", "010-9999-9999")
        mismatch = await client.patch(
            url,
            headers=member["auth"],
            json={**body, "phone_verification_id": other_phone},
        )
        assert mismatch.status_code == 400
        vid = await _verified(member["id"], "MYPAGE")
        ok = await client.patch(
            url, headers=member["auth"], json={**body, "phone_verification_id": vid}
        )
        assert ok.status_code == 200, ok.text


class TestReservations:
    async def test_member_reservation_is_linked(
        self, client: AsyncClient, member: dict
    ):
        inquiry_id = await _reserve(client, member, days=3)
        guest_id = await _reserve(client, member, days=4, auth=False)
        rows = (
            await _sql(
                "SELECT id::text, member_id::text FROM inquiries WHERE tenant_id = :t",
                {"t": member["id"]},
            )
        ).all()
        linked = {r.id: r.member_id for r in rows}
        assert linked[inquiry_id] == member["member_id"]
        assert linked[guest_id] is None

        resp = await client.get(
            f"{_members(member['slug'])}/reservations", headers=member["auth"]
        )
        items = resp.json()["data"]["items"]
        assert len(items) == 1
        item = items[0]
        assert item["inquiry_id"] == inquiry_id
        assert (item["reservation_type"], item["status"]) == ("MEDICAL", "PENDING")
        assert item["detail"]["reserved_time"] == "10:30"
        # 10:30 KST == 01:30 UTC
        assert item["reserved_at"].startswith(
            (date.today() + timedelta(days=3)).isoformat() + "T01:30"
        )

    async def test_filters(self, client: AsyncClient, member: dict):
        await _reserve(client, member, days=2)
        await _reserve(client, member, days=5)
        await _sql(
            "UPDATE member_reservations SET status = 'COMPLETED',"
            " reserved_at = now() - interval '200 days'"
            " WHERE id = (SELECT id FROM member_reservations WHERE member_id = :m"
            " ORDER BY reserved_at LIMIT 1)",
            {"m": member["member_id"]},
        )
        url = f"{_members(member['slug'])}/reservations"
        done = await client.get(
            url, params={"status": "COMPLETED"}, headers=member["auth"]
        )
        assert [i["status"] for i in done.json()["data"]["items"]] == ["COMPLETED"]
        recent = await client.get(url, params={"months": 3}, headers=member["auth"])
        assert [i["status"] for i in recent.json()["data"]["items"]] == ["PENDING"]
        bad = await client.get(url, params={"months": 5}, headers=member["auth"])
        assert bad.status_code == 400

    async def test_cancel_rules(self, client: AsyncClient, member: dict):
        inquiry_id = await _reserve(client, member, days=3)
        url = f"{_members(member['slug'])}/reservations"
        rid = (await client.get(url, headers=member["auth"])).json()["data"]["items"][
            0
        ]["id"]
        ok = await client.post(f"{url}/{rid}/cancel", headers=member["auth"])
        assert ok.status_code == 200 and ok.json()["data"]["status"] == "CANCELLED"
        memo = (
            await _sql(
                "SELECT admin_memo FROM inquiries WHERE id = :id", {"id": inquiry_id}
            )
        ).scalar_one()
        assert "[회원 취소]" in memo
        again = await client.post(f"{url}/{rid}/cancel", headers=member["auth"])
        assert again.json()["error"]["code"] == "RESERVATION_NOT_CANCELLABLE"

        await _reserve(client, member, days=1)
        past = (
            await _sql(
                "UPDATE member_reservations SET reserved_at = now() - interval"
                " '1 hour' WHERE member_id = :m AND status = 'PENDING' RETURNING id",
                {"m": member["member_id"]},
            )
        ).scalar_one()
        late = await client.post(f"{url}/{past}/cancel", headers=member["auth"])
        assert late.status_code == 409

        missing = await client.post(
            f"{url}/{uuid.uuid4()}/cancel", headers=member["auth"]
        )
        assert missing.status_code == 404


class TestInquiries:
    async def test_lists_only_mine_with_answer_state(
        self, client: AsyncClient, member: dict, auth_headers: dict
    ):
        slug = member["slug"]
        mine = await _reserve(client, member, days=3)
        await _reserve(client, member, days=3, auth=False)
        board = await client.post(
            "/api/public/inquiries/board",
            params={"tenant_slug": slug},
            headers=member["auth"],
            json={
                "name": "홍길동",
                "password": "1234",
                "phone": PHONE,
                "subject": "주차 문의",
                "message": "주차가 가능한지 궁금합니다. 몇 대까지 되나요?",
                "is_secret": True,
            },
        )
        board_id = board.json()["data"]["post_id"]
        # 관리자 답변 (AD-04)
        await client.patch(
            f"/api/v1/inquiries/{board_id}",
            json={"answer": "10대까지 가능합니다."},
            headers=auth_headers,
        )

        resp = await client.get(f"{_members(slug)}/inquiries", headers=member["auth"])
        items = resp.json()["data"]["items"]
        assert {i["id"] for i in items} == {mine, board_id}
        answered = {i["id"]: i["answered"] for i in items}
        assert answered == {mine: False, board_id: True}

        detail = await client.get(
            f"{_members(slug)}/inquiries/{board_id}", headers=member["auth"]
        )
        assert detail.json()["data"]["answer"] == "10대까지 가능합니다."
        assert detail.json()["data"]["is_board"] is True

    async def test_other_inquiry_404(self, client: AsyncClient, member: dict):
        guest = await _reserve(client, member, days=3, auth=False)
        resp = await client.get(
            f"{_members(member['slug'])}/inquiries/{guest}", headers=member["auth"]
        )
        assert resp.status_code == 404


class TestWithdraw:
    async def _withdraw(self, client: AsyncClient, m: dict, **body):
        return await client.request(
            "DELETE", f"{_members(m['slug'])}/me", headers=m["auth"], json=body
        )

    async def test_blocked_by_active_reservation(
        self, client: AsyncClient, member: dict
    ):
        await _reserve(client, member, days=3)
        resp = await self._withdraw(client, member, password=PASSWORD)
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "ACTIVE_RESERVATION_EXISTS"

    async def test_wrong_password(self, client: AsyncClient, member: dict):
        resp = await self._withdraw(client, member, password="wrong1234")
        assert resp.status_code == 401
        assert (await self._withdraw(client, member)).status_code == 401

    async def test_withdraw_anonymizes_and_blocks_login(
        self, client: AsyncClient, member: dict, outbox: dict
    ):
        slug = member["slug"]
        inquiry_id = await _reserve(client, member, days=3)
        rid = (
            await client.get(f"{_members(slug)}/reservations", headers=member["auth"])
        ).json()["data"]["items"][0]["id"]
        await client.post(
            f"{_members(slug)}/reservations/{rid}/cancel", headers=member["auth"]
        )

        resp = await self._withdraw(
            client, member, password=PASSWORD, reason="OTHER", reason_detail="이사"
        )
        assert resp.status_code == 200, resp.text
        assert 'member_refresh_token=""' in resp.headers["set-cookie"]
        assert outbox["withdrawn"] == [
            (f"Test Tenant {slug}", "홍길동", "hong@example.com", PHONE)
        ]

        row = (
            await _sql(
                "SELECT email, name, phone, password_hash, is_active, deleted_at,"
                " withdrawal_reason FROM site_members WHERE id = :id",
                {"id": member["member_id"]},
            )
        ).one()
        assert row.email.endswith("@deleted.invalid") and row.name == "탈퇴회원"
        assert row.phone is None and row.password_hash is None
        assert row.is_active is False and row.deleted_at is not None
        assert row.withdrawal_reason == "OTHER: 이사"
        reservations = (
            await _sql(
                "SELECT count(*) FROM member_reservations WHERE member_id = :m"
                " AND deleted_at IS NULL",
                {"m": member["member_id"]},
            )
        ).scalar_one()
        assert reservations == 0
        kept = (
            await _sql(
                "SELECT member_id FROM inquiries WHERE id = :id", {"id": inquiry_id}
            )
        ).one()
        assert kept.member_id is None  # 문의는 남고 연결만 해제

        # 로그인 · 기존 토큰 불가, 같은 이메일 재가입 가능
        login = await client.post(
            f"/api/public/{slug}/auth/login",
            json={"email": "hong@example.com", "password": PASSWORD},
        )
        assert login.status_code == 401
        stale = await client.get(f"{_members(slug)}/me", headers=member["auth"])
        assert stale.status_code == 401
        again = await client.post(
            f"/api/public/{slug}/auth/register",
            json={
                "name": "홍길동",
                "email": "hong@example.com",
                "password": PASSWORD,
                "password_confirm": PASSWORD,
                "phone": PHONE,
                "phone_verification_id": await _verified(member["id"]),
                "terms_agree": True,
                "privacy_agree": True,
            },
        )
        assert again.status_code == 201

    async def test_social_member_withdraws_without_password(
        self, client: AsyncClient, member: dict
    ):
        await _sql(
            "UPDATE site_members SET password_hash = NULL WHERE id = :id",
            {"id": member["member_id"]},
        )
        resp = await self._withdraw(client, member, reason="PRIVACY")
        assert resp.status_code == 200


class TestIsolation:
    async def test_admin_and_other_tenant_tokens_rejected(
        self, client: AsyncClient, member: dict, auth_headers: dict
    ):
        admin = await client.get(f"{_members(member['slug'])}/me", headers=auth_headers)
        assert admin.status_code == 403
        tid = str(uuid.uuid4())
        other = f"other-{tid[:8]}"
        await _sql(
            "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
            " updated_at) VALUES (:id, '다른', :s, 'FREE', true, now(), now())",
            {"id": tid, "s": other},
        )
        try:
            cross = await client.get(f"{_members(other)}/me", headers=member["auth"])
            assert cross.status_code == 403
        finally:
            await _sql("DELETE FROM tenants WHERE id = :id", {"id": tid})
