"""T-115 방문자 회원 기능 플래그 + 관리자 연동 테스트.

기획서 16.0 · 16.2 · AD-04 · AD-01.

- SITE_MEMBER OFF → 방문자 인증 · 마이페이지 · 소셜 API 403,
  options · 공개 사이트 enabled=false
- MEMBER_RESERVATION OFF → 내 예약 API 403, options.reservations=false
- 플래그 변경 시 공개 사이트 캐시 무효화
- 테넌트 생성 시 기본 기능 (default_enabled · 요금제 · 업종별 회원 기능)
- AD-04: 회원 정보 · 예약 상태, 상태 변경 규칙 · 문의 상태 동기화 · 회원 알림
- AD-01: 신규 회원 수 (플래그 OFF 면 None)
"""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token, create_member_access_token
from app.services import feature as feature_service
from app.workers import notification as notification_worker
from tests.conftest import _TestSession  # type: ignore

PHONE = "010-6000-1234"


async def _sql(sql: str, params: dict | None = None):
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        result = await session.execute(text(sql), params or {})
        await session.commit()
        return result


async def _set_flag(tenant_id: str, key: str, enabled: bool) -> None:
    await _sql(
        "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled,"
        " created_at, updated_at) SELECT gen_random_uuid(), :t, id, :on, now(), now()"
        " FROM features WHERE key = :k"
        " ON CONFLICT ON CONSTRAINT uq_tenant_features_pair"
        " DO UPDATE SET is_enabled = :on",
        {"t": tenant_id, "k": key, "on": enabled},
    )
    await feature_service.invalidate_cache(tenant_id)
    from app.core.redis import get_redis

    slug = (
        await _sql("SELECT slug FROM tenants WHERE id = :t", {"t": tenant_id})
    ).scalar_one()
    await (await get_redis()).delete(f"site:{slug}")


@pytest.fixture(autouse=True)
def outbox(monkeypatch) -> dict:
    box: dict = {"notice": []}

    class _Task:
        def __init__(self, key: str | None) -> None:
            self.key = key

        def delay(self, *args) -> None:
            if self.key:
                box[self.key].append(args)

    monkeypatch.setattr(notification_worker, "send_inquiry_alert", _Task(None))
    monkeypatch.setattr(notification_worker, "send_member_joined_alert", _Task(None))
    monkeypatch.setattr(
        notification_worker, "send_member_reservation_notice", _Task("notice")
    )
    return box


@pytest.fixture
async def site(test_tenant: dict):
    """병원 업종 테넌트 + 회원 1명 (access token)."""
    await _sql(
        "UPDATE tenants SET template_type = 'HOSPITAL' WHERE id = :t",
        {"t": test_tenant["id"]},
    )
    mid = str(uuid.uuid4())
    await _sql(
        "INSERT INTO site_members (id, tenant_id, email, name, phone)"
        " VALUES (:id, :t, 'flag@example.com', '홍길동', :p)",
        {"id": mid, "t": test_tenant["id"], "p": PHONE},
    )
    token = create_member_access_token(uuid.UUID(mid), uuid.UUID(test_tenant["id"]))
    yield {
        **test_tenant,
        "member_id": mid,
        "member_auth": {"Authorization": f"Bearer {token}"},
    }
    await _sql("DELETE FROM inquiries WHERE tenant_id = :t", {"t": test_tenant["id"]})
    await _sql(
        "DELETE FROM tenant_features WHERE tenant_id = :t", {"t": test_tenant["id"]}
    )


class TestSiteMemberFlag:
    async def test_off_disables_member_apis(self, client: AsyncClient, site: dict):
        base = f"/api/public/{site['slug']}"
        assert (
            await client.get(f"{base}/members/me", headers=site["member_auth"])
        ).status_code == 200

        await _set_flag(site["id"], "SITE_MEMBER", False)
        checks = [
            (
                "POST",
                f"{base}/auth/login",
                {"email": "flag@example.com", "password": "x"},
            ),
            ("GET", f"{base}/auth/check-email?email=a@example.com", None),
            (
                "POST",
                f"{base}/auth/phone/send",
                {"phone": PHONE, "purpose": "REGISTER"},
            ),
            ("GET", f"{base}/auth/social/kakao/authorize", None),
            ("GET", f"{base}/members/me", None),
            ("GET", f"{base}/members/reservations", None),
            ("GET", f"{base}/members/me/social", None),
        ]
        for method, url, body in checks:
            resp = await client.request(
                method, url, json=body, headers=site["member_auth"]
            )
            assert resp.status_code == 403, (url, resp.text)
            assert resp.json()["error"]["code"] == "FEATURE_DISABLED"

        options = await client.get(f"{base}/auth/options")
        assert options.status_code == 200
        assert options.json()["data"] == {
            "enabled": False,
            "social_login": False,
            "providers": [],
            "reservations": False,
        }

    async def test_public_site_member_block_and_cache_purge(
        self, client: AsyncClient, site: dict
    ):
        url = f"/api/public/site/{site['slug']}"
        on = await client.get(url)
        assert on.json()["data"]["member"] == {
            "enabled": True,
            "reservations": True,
            "social_login": True,
        }
        # 슈퍼 어드민 토글 → 캐시가 비워져 바로 반영
        feature_id = (
            await _sql("SELECT id FROM features WHERE key = 'SITE_MEMBER'")
        ).scalar_one()
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await feature_service.toggle_feature(
                session, uuid.UUID(site["id"]), feature_id, False
            )
        off = await client.get(url)
        assert off.json()["data"]["member"]["enabled"] is False
        # 미들웨어용 가벼운 조회도 같은 값 (캐시 · 계산 두 경로)
        light = await client.get(f"{url}/template")
        assert light.json()["data"]["member_enabled"] is False
        from app.core.redis import get_redis

        await (await get_redis()).delete(f"site:{site['slug']}")
        computed = await client.get(f"{url}/template")
        assert computed.json()["data"]["member_enabled"] is False
        await _set_flag(site["id"], "SITE_MEMBER", True)
        assert (await client.get(f"{url}/template")).json()["data"][
            "member_enabled"
        ] is True


class TestReservationFlag:
    async def test_off_hides_reservations(self, client: AsyncClient, site: dict):
        base = f"/api/public/{site['slug']}"
        ok = await client.get(
            f"{base}/members/reservations", headers=site["member_auth"]
        )
        assert ok.status_code == 200
        await _set_flag(site["id"], "MEMBER_RESERVATION", False)
        off = await client.get(
            f"{base}/members/reservations", headers=site["member_auth"]
        )
        assert off.status_code == 403
        cancel = await client.post(
            f"{base}/members/reservations/{uuid.uuid4()}/cancel",
            headers=site["member_auth"],
        )
        assert cancel.status_code == 403
        options = await client.get(f"{base}/auth/options")
        assert options.json()["data"]["reservations"] is False
        # 내 정보 등 다른 회원 기능은 그대로
        me = await client.get(f"{base}/members/me", headers=site["member_auth"])
        assert me.status_code == 200

    async def test_explicit_on_overrides_industry(
        self, client: AsyncClient, site: dict
    ):
        await _sql(
            "UPDATE tenants SET template_type = 'STARTUP' WHERE id = :t",
            {"t": site["id"]},
        )
        base = f"/api/public/{site['slug']}"
        assert (await client.get(f"{base}/auth/options")).json()["data"][
            "reservations"
        ] is False
        await _set_flag(site["id"], "MEMBER_RESERVATION", True)
        assert (await client.get(f"{base}/auth/options")).json()["data"][
            "reservations"
        ] is True


@pytest.fixture
async def super_headers() -> dict:
    user_id = uuid.uuid4()
    await _sql(
        "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
        " created_at, updated_at) VALUES (:id, NULL, :e, 'x', 'SUPER_ADMIN', true,"
        " now(), now())",
        {"id": str(user_id), "e": f"sa-{uuid.uuid4().hex[:6]}@cms.io"},
    )
    token = create_access_token(
        user_id=user_id, tenant_id=None, role="SUPER_ADMIN", is_super_admin=True
    )
    yield {"Authorization": f"Bearer {token}"}
    await _sql("DELETE FROM users WHERE id = :id", {"id": str(user_id)})


async def _cleanup_tenant(slug: str) -> None:
    sub = "(SELECT id FROM tenants WHERE slug = :s)"
    for table in (
        "subscriptions",
        "tenant_features",
        "section_settings",
        "sections",
        "users",
    ):
        await _sql(f"DELETE FROM {table} WHERE tenant_id IN {sub}", {"s": slug})  # noqa: S608
    await _sql("DELETE FROM tenants WHERE slug = :s", {"s": slug})


class TestTenantCreationDefaults:
    @pytest.fixture
    async def plan_feature(self):
        """요금제 제한이 있는 기본 ON 기능 (테스트 동안만)."""
        key = f"TEST_PLAN_{uuid.uuid4().hex[:6].upper()}"
        await _sql(
            "INSERT INTO features (id, key, name, category, menu_position,"
            " default_enabled, required_plan, is_beta, is_active, created_at,"
            " updated_at) VALUES (gen_random_uuid(), :k, '테스트', 'AI', 99, true,"
            " 'STANDARD', false, true, now(), now())",
            {"k": key},
        )
        yield key
        await _sql(
            "DELETE FROM tenant_features WHERE feature_id IN"
            " (SELECT id FROM features WHERE key = :k)",
            {"k": key},
        )
        await _sql("DELETE FROM features WHERE key = :k", {"k": key})

    @pytest.mark.parametrize(
        ("industry", "plan", "reservation", "plan_feature_on"),
        [
            ("HOSPITAL", "FREE", True, False),
            ("PENSION", "STANDARD", True, True),
            ("STARTUP", "PREMIUM", False, True),
        ],
    )
    async def test_defaults_by_industry_and_plan(
        self,
        client: AsyncClient,
        super_headers: dict,
        plan_feature: str,
        industry: str,
        plan: str,
        reservation: bool,
        plan_feature_on: bool,
    ):
        slug = f"def-{uuid.uuid4().hex[:6]}"
        try:
            resp = await client.post(
                "/api/super/v1/tenants",
                headers=super_headers,
                json={
                    "name": "기본값 테스트",
                    "slug": slug,
                    "template_type": industry,
                    "plan_type": plan,
                    "admin_email": f"owner@{slug}.com",
                    "admin_password": "password123",
                },
            )
            assert resp.status_code == 200, resp.text
            rows = (
                await _sql(
                    "SELECT f.key FROM tenant_features tf JOIN features f"
                    " ON f.id = tf.feature_id JOIN tenants t ON t.id = tf.tenant_id"
                    " WHERE t.slug = :s AND tf.is_enabled",
                    {"s": slug},
                )
            ).scalars()
            enabled = set(rows)
            assert {"SITE_MEMBER", "MEMBER_SOCIAL_LOGIN"} <= enabled
            assert ("MEMBER_RESERVATION" in enabled) is reservation
            assert (plan_feature in enabled) is plan_feature_on
        finally:
            await _cleanup_tenant(slug)


async def _member_reservation(client: AsyncClient, site: dict) -> str:
    resp = await client.post(
        "/api/public/inquiries",
        params={"tenant_slug": site["slug"]},
        headers=site["member_auth"],
        json={
            "inquiry_type": "RESERVATION",
            "name": "홍길동",
            "phone": PHONE,
            "subject": "첫 방문",
            "message": "첫 방문 상담을 예약하고 싶습니다.",
            "reserved_date": (date.today() + timedelta(days=3)).isoformat(),
            "reserved_time": "10:00",
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["inquiry_id"]


class TestAdminReservation:
    async def test_detail_shows_member_and_status_flow(
        self, client: AsyncClient, site: dict, auth_headers: dict, outbox: dict
    ):
        inquiry_id = await _member_reservation(client, site)
        listing = await client.get("/api/v1/inquiries", headers=auth_headers)
        item = next(i for i in listing.json()["data"]["items"] if i["id"] == inquiry_id)
        assert item["member_id"] == site["member_id"]

        detail = (
            await client.get(f"/api/v1/inquiries/{inquiry_id}", headers=auth_headers)
        ).json()["data"]
        assert detail["member"]["email"] == "flag@example.com"
        assert detail["member"]["is_active"] is True
        assert detail["reservation"]["status"] == "PENDING"
        assert detail["reservation"]["next_statuses"] == ["CONFIRMED", "CANCELLED"]

        url = f"/api/v1/inquiries/{inquiry_id}/reservation"
        confirmed = await client.patch(
            url, json={"status": "CONFIRMED"}, headers=auth_headers
        )
        assert confirmed.status_code == 200, confirmed.text
        data = confirmed.json()["data"]
        assert (data["status"], data["reservation"]["status"]) == (
            "IN_PROGRESS",
            "CONFIRMED",
        )
        assert data["reservation"]["next_statuses"] == ["COMPLETED", "CANCELLED"]
        assert outbox["notice"] == [
            (site["id"], data["reservation"]["id"], "CONFIRMED")
        ]

        # 회원 마이페이지에도 반영
        mine = await client.get(
            f"/api/public/{site['slug']}/members/reservations",
            headers=site["member_auth"],
        )
        assert mine.json()["data"]["items"][0]["status"] == "CONFIRMED"

        done = await client.patch(
            url, json={"status": "COMPLETED"}, headers=auth_headers
        )
        assert (
            done.json()["data"]["status"],
            done.json()["data"]["reservation"]["status"],
        ) == (
            "DONE",
            "COMPLETED",
        )
        assert len(outbox["notice"]) == 1  # 완료는 알림 없음
        invalid = await client.patch(
            url, json={"status": "CANCELLED"}, headers=auth_headers
        )
        assert invalid.status_code == 409

    async def test_admin_cancel_writes_memo(
        self, client: AsyncClient, site: dict, auth_headers: dict, outbox: dict
    ):
        inquiry_id = await _member_reservation(client, site)
        resp = await client.patch(
            f"/api/v1/inquiries/{inquiry_id}/reservation",
            json={"status": "CANCELLED"},
            headers=auth_headers,
        )
        data = resp.json()["data"]
        assert data["status"] == "DONE" and "[관리자 취소]" in data["admin_memo"]
        assert outbox["notice"][0][2] == "CANCELLED"

    async def test_non_member_inquiry_and_validation(
        self, client: AsyncClient, site: dict, auth_headers: dict
    ):
        guest = await client.post(
            "/api/public/inquiries",
            params={"tenant_slug": site["slug"]},
            json={
                "name": "손님",
                "phone": PHONE,
                "message": "비회원 문의 내용입니다.",
            },
        )
        gid = guest.json()["data"]["inquiry_id"]
        detail = (
            await client.get(f"/api/v1/inquiries/{gid}", headers=auth_headers)
        ).json()["data"]
        assert detail["member"] is None and detail["reservation"] is None
        resp = await client.patch(
            f"/api/v1/inquiries/{gid}/reservation",
            json={"status": "CONFIRMED"},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        bad = await client.patch(
            f"/api/v1/inquiries/{gid}/reservation",
            json={"status": "PENDING"},
            headers=auth_headers,
        )
        assert bad.status_code == 400
        missing = await client.patch(
            f"/api/v1/inquiries/{uuid.uuid4()}/reservation",
            json={"status": "CONFIRMED"},
            headers=auth_headers,
        )
        assert missing.status_code == 404

    async def test_member_token_cannot_change_status(
        self, client: AsyncClient, site: dict
    ):
        inquiry_id = await _member_reservation(client, site)
        resp = await client.patch(
            f"/api/v1/inquiries/{inquiry_id}/reservation",
            json={"status": "CONFIRMED"},
            headers=site["member_auth"],
        )
        assert resp.status_code == 403


class TestReservationNotice:
    async def _reservation(self, site: dict) -> str:
        return (
            await _sql(
                "INSERT INTO member_reservations (tenant_id, member_id,"
                " reservation_type, status, reserved_at) VALUES (:t, :m, 'MEDICAL',"
                " 'CONFIRMED', :at) RETURNING id::text",
                {
                    "t": site["id"],
                    "m": site["member_id"],
                    "at": datetime.now(UTC) + timedelta(days=2),
                },
            )
        ).scalar_one()

    async def test_channels_follow_member_settings(self, site: dict, monkeypatch):
        sent: dict = {"sms": [], "email": []}

        async def _sms(to: str, message: str) -> bool:
            sent["sms"].append(message)
            return True

        async def _email(to, subject, template, variables):
            sent["email"].append(template)
            return {"sent": True}

        from app.services import email as email_service
        from app.services import notification as notification_service

        monkeypatch.setattr(notification_service, "send_sms", _sms)
        monkeypatch.setattr(email_service, "send_email", _email)
        rid = await self._reservation(site)
        await _sql(
            "UPDATE site_members SET email_agree = true WHERE id = :m",
            {"m": site["member_id"]},
        )
        result = await notification_worker._send_member_reservation_notice(
            site["id"], rid, "CONFIRMED"
        )
        assert result == {"sms_sent": True, "email_sent": True, "reason": ""}
        assert "예약이 확정되었습니다" in sent["sms"][0]
        assert sent["email"] == ["member_reservation_status"]

        await _sql(
            "UPDATE site_members SET notify_reservation_cancelled = false"
            " WHERE id = :m",
            {"m": site["member_id"]},
        )
        opted_out = await notification_worker._send_member_reservation_notice(
            site["id"], rid, "CANCELLED"
        )
        assert opted_out["reason"] == "OPTED_OUT"
        assert len(sent["sms"]) == 1


class TestDashboardMembers:
    async def test_member_counts_and_flag_off(
        self, client: AsyncClient, site: dict, auth_headers: dict
    ):
        await _sql(
            "INSERT INTO site_members (tenant_id, email, name, created_at)"
            " VALUES (:t, 'old@example.com', '예전회원', now() - interval '40 days'),"
            " (:t, 'gone@example.com', '탈퇴', now())",
            {"t": site["id"]},
        )
        await _sql(
            "UPDATE site_members SET deleted_at = now()"
            " WHERE email = 'gone@example.com'"
            " AND tenant_id = :t",
            {"t": site["id"]},
        )
        stats = (
            await client.get("/api/v1/dashboard/stats", headers=auth_headers)
        ).json()["data"]
        assert stats["members"] == {"new_members_week": 1, "total_members": 2}

        await _set_flag(site["id"], "SITE_MEMBER", False)
        off = (
            await client.get("/api/v1/dashboard/stats", headers=auth_headers)
        ).json()["data"]
        assert off["members"] is None
