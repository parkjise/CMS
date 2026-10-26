"""T-112 방문자 인증 교차 검증 (기획서 16.0 · 16.11).

테넌트 격리 · 방문자 ↔ 어드민 차단.

- 방문자 인증 API 전체 매트릭스: 토큰 없음 401 / 어드민 토큰 403
  / 다른 테넌트 회원 토큰 403
- 방문자 토큰으로 어드민 · 슈퍼 어드민 API 전체 → 거부 (200 금지)
- refresh 쿠키 상호 차단: 방문자 refresh → 어드민 /auth/refresh 401, 그 반대도 401
- 다른 테넌트 id(인증 · 예약 · 문의) 사용 거부
- 같은 이메일로 여러 테넌트 가입 · 로그인 · 한 곳 탈퇴가 다른 곳에 영향 없음
- 남은 분기: 동시 가입 경합 409, 잘못된 refresh · 로그아웃 쿠키
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import (
    create_access_token,
    create_member_access_token,
    create_member_refresh_token,
    create_refresh_token,
)
from app.main import app
from app.services import member_auth
from app.workers import notification as notification_worker
from tests.conftest import _TestSession  # type: ignore

PASSWORD = "abcd1234"
PHONE = "010-8888-1234"
ANY_ID = "00000000-0000-0000-0000-000000000001"

# (메서드, 경로, 본문) — 로그인한 방문자만 쓰는 API 전체 (기획서 16.10 + T-110 · T-111)
MEMBER_ENDPOINTS = [
    ("POST", "/auth/logout", None),
    ("GET", "/members/me", None),
    ("PATCH", "/members/me", {"name": "홍길동"}),
    (
        "PATCH",
        "/members/me/password",
        {
            "current_password": PASSWORD,
            "password": "newpw1234",
            "password_confirm": "newpw1234",
        },
    ),
    ("GET", "/members/me/notification", None),
    ("PATCH", "/members/me/notification", {"sms_agree": False}),
    ("DELETE", "/members/me", {"password": PASSWORD}),
    ("GET", "/members/reservations", None),
    ("POST", f"/members/reservations/{ANY_ID}/cancel", None),
    ("GET", "/members/inquiries", None),
    ("GET", f"/members/inquiries/{ANY_ID}", None),
    ("GET", "/members/me/social", None),
    ("POST", "/members/me/social/kakao/authorize", None),
    ("DELETE", "/members/me/social/kakao", None),
]
# 방문자 토큰을 쓰면 안 되는 어드민 API — 경로 매개변수 없는 GET 전체 (헬스 · SSE 제외)
ADMIN_GET_PATHS = sorted(
    {
        r.path
        for r in app.routes
        if getattr(r, "methods", None)
        and "GET" in r.methods
        and (r.path.startswith("/api/v1/") or r.path.startswith("/api/super/v1/"))
        and "{" not in r.path
        and not r.path.endswith(("/health", "/stream"))
    }
)


async def _sql(sql: str, params: dict | None = None):
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        result = await session.execute(text(sql), params or {})
        await session.commit()
        return result


async def _new_tenant() -> dict:
    tid = str(uuid.uuid4())
    slug = f"iso-{tid[:8]}"
    await _sql(
        "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
        " updated_at) VALUES (:id, :n, :s, 'FREE', true, now(), now())",
        {"id": tid, "n": f"사이트 {slug}", "s": slug},
    )
    return {"id": tid, "slug": slug}


async def _drop_tenant(tenant: dict) -> None:
    await _sql("DELETE FROM inquiries WHERE tenant_id = :t", {"t": tenant["id"]})
    await _sql("DELETE FROM tenants WHERE id = :t", {"t": tenant["id"]})


async def _member(tenant: dict, email: str = "same@example.com") -> dict:
    mid = str(uuid.uuid4())
    from app.core.security import hash_password

    await _sql(
        "INSERT INTO site_members (id, tenant_id, email, name, phone, password_hash)"
        " VALUES (:id, :t, :e, '홍길동', :p, :h)",
        {
            "id": mid,
            "t": tenant["id"],
            "e": email,
            "p": PHONE,
            "h": hash_password(PASSWORD),
        },
    )
    token = create_member_access_token(uuid.UUID(mid), uuid.UUID(tenant["id"]))
    return {"id": mid, "auth": {"Authorization": f"Bearer {token}"}}


async def _verified(tenant_id: str, purpose: str = "REGISTER") -> str:
    vid = str(uuid.uuid4())
    now = datetime.now(UTC)
    await _sql(
        "INSERT INTO phone_verifications (id, tenant_id, phone, code, purpose,"
        " expires_at, verified_at) VALUES (:id, :t, :p, '123456', :pu, :e, :n)",
        {
            "id": vid,
            "t": tenant_id,
            "p": PHONE,
            "pu": purpose,
            "e": now + timedelta(minutes=3),
            "n": now,
        },
    )
    return vid


@pytest.fixture(autouse=True)
def no_tasks(monkeypatch):
    class _Task:
        def delay(self, *args) -> None:
            pass

    for name in (
        "send_member_joined_alert",
        "send_member_password_changed",
        "send_member_withdrawn",
        "send_inquiry_alert",
    ):
        monkeypatch.setattr(notification_worker, name, _Task())


@pytest.fixture
async def two_sites():
    a, b = await _new_tenant(), await _new_tenant()
    a["member"] = await _member(a)
    b["member"] = await _member(b)
    yield a, b
    await _drop_tenant(a)
    await _drop_tenant(b)


def _call(client: AsyncClient, method: str, url: str, body, headers: dict):
    return client.request(method, url, json=body, headers=headers)


class TestMemberApiMatrix:
    @pytest.mark.parametrize(("method", "path", "body"), MEMBER_ENDPOINTS)
    async def test_requires_member_token(
        self, client: AsyncClient, two_sites, method, path, body
    ):
        a, _ = two_sites
        resp = await _call(client, method, f"/api/public/{a['slug']}{path}", body, {})
        assert resp.status_code == 401, resp.text
        assert resp.json()["error"]["code"] == "UNAUTHORIZED"

    @pytest.mark.parametrize(("method", "path", "body"), MEMBER_ENDPOINTS)
    async def test_admin_token_forbidden(
        self, client: AsyncClient, two_sites, method, path, body
    ):
        a, _ = two_sites
        admin = create_access_token(
            user_id=uuid.uuid4(), tenant_id=uuid.UUID(a["id"]), role="TENANT_ADMIN"
        )
        resp = await _call(
            client,
            method,
            f"/api/public/{a['slug']}{path}",
            body,
            {"Authorization": f"Bearer {admin}"},
        )
        assert resp.status_code == 403, resp.text
        assert resp.json()["error"]["code"] == "FORBIDDEN"

    @pytest.mark.parametrize(("method", "path", "body"), MEMBER_ENDPOINTS)
    async def test_other_tenant_member_forbidden(
        self, client: AsyncClient, two_sites, method, path, body
    ):
        a, b = two_sites
        resp = await _call(
            client, method, f"/api/public/{a['slug']}{path}", body, b["member"]["auth"]
        )
        assert resp.status_code == 403, resp.text
        # 다른 테넌트 회원 데이터는 바뀌지 않았다
        row = (
            await _sql(
                "SELECT name, sms_agree, deleted_at FROM site_members WHERE id = :id",
                {"id": b["member"]["id"]},
            )
        ).one()
        assert (row.name, row.sms_agree, row.deleted_at) == ("홍길동", True, None)


class TestAdminApiBlocksMemberToken:
    def test_admin_paths_collected(self):
        assert len(ADMIN_GET_PATHS) >= 25
        assert "/api/v1/sections" in ADMIN_GET_PATHS
        assert "/api/super/v1/tenants" in ADMIN_GET_PATHS

    @pytest.mark.parametrize("path", ADMIN_GET_PATHS)
    async def test_member_token_rejected(self, client: AsyncClient, two_sites, path):
        a, _ = two_sites
        resp = await client.get(path, headers=a["member"]["auth"])
        assert resp.status_code in (401, 403), (path, resp.status_code, resp.text)

    async def test_member_token_cannot_write_admin_api(
        self, client: AsyncClient, two_sites
    ):
        a, _ = two_sites
        resp = await client.patch(
            f"/api/v1/inquiries/{ANY_ID}",
            json={"status": "DONE"},
            headers=a["member"]["auth"],
        )
        assert resp.status_code == 403


class TestRefreshCookies:
    async def test_member_refresh_rejected_by_admin_refresh(
        self, client: AsyncClient, two_sites
    ):
        a, _ = two_sites
        token = create_member_refresh_token(
            uuid.UUID(a["member"]["id"]), uuid.UUID(a["id"]), False
        )
        client.cookies.set("refresh_token", token)
        resp = await client.post("/api/v1/auth/refresh")
        client.cookies.clear()
        assert resp.status_code == 401

    async def test_admin_refresh_rejected_by_member_refresh(
        self, client: AsyncClient, two_sites
    ):
        a, _ = two_sites
        client.cookies.set("member_refresh_token", create_refresh_token(uuid.uuid4()))
        resp = await client.post(f"/api/public/{a['slug']}/auth/refresh")
        client.cookies.clear()
        assert resp.status_code == 401

    async def test_garbage_refresh_and_logout_cookie(
        self, client: AsyncClient, two_sites
    ):
        a, _ = two_sites
        client.cookies.set("member_refresh_token", "not-a-jwt")
        refresh = await client.post(f"/api/public/{a['slug']}/auth/refresh")
        assert refresh.status_code == 401
        # 무효한 쿠키로 로그아웃해도 성공 (쿠키만 지움)
        logout = await client.post(
            f"/api/public/{a['slug']}/auth/logout", headers=a["member"]["auth"]
        )
        client.cookies.clear()
        assert logout.status_code == 200
        # 쿠키 없이 로그아웃
        bare = await client.post(
            f"/api/public/{a['slug']}/auth/logout", headers=a["member"]["auth"]
        )
        assert bare.status_code == 200


class TestCrossTenantIds:
    async def test_verification_of_other_tenant_rejected(
        self, client: AsyncClient, two_sites
    ):
        a, b = two_sites
        vid = await _verified(a["id"], "FIND_EMAIL")
        find = await client.post(
            f"/api/public/{b['slug']}/auth/find-email",
            json={"name": "홍길동", "phone_verification_id": vid},
        )
        assert find.json()["error"]["code"] == "PHONE_NOT_VERIFIED"
        reg_vid = await _verified(a["id"])
        register = await client.post(
            f"/api/public/{b['slug']}/auth/register",
            json={
                "name": "김철수",
                "email": "new@example.com",
                "password": PASSWORD,
                "password_confirm": PASSWORD,
                "phone": PHONE,
                "phone_verification_id": reg_vid,
                "terms_agree": True,
                "privacy_agree": True,
            },
        )
        assert register.json()["error"]["code"] == "PHONE_NOT_VERIFIED"

    async def test_reservation_and_inquiry_of_other_tenant(
        self, client: AsyncClient, two_sites
    ):
        a, b = two_sites
        rid = (
            await _sql(
                "INSERT INTO member_reservations (tenant_id, member_id,"
                " reservation_type, reserved_at) VALUES (:t, :m, 'MEDICAL',"
                " now() + interval '3 days') RETURNING id::text",
                {"t": a["id"], "m": a["member"]["id"]},
            )
        ).scalar_one()
        iid = (
            await _sql(
                "INSERT INTO inquiries (tenant_id, name, phone, message, inquiry_type,"
                " status, is_read, is_notified, member_id, created_at, updated_at)"
                " VALUES (:t, '홍길동', :p, '문의 내용입니다.', 'GENERAL', 'PENDING',"
                " false, false, :m, now(), now()) RETURNING id::text",
                {"t": a["id"], "p": PHONE, "m": a["member"]["id"]},
            )
        ).scalar_one()
        base = f"/api/public/{b['slug']}/members"
        cancel = await client.post(
            f"{base}/reservations/{rid}/cancel", headers=b["member"]["auth"]
        )
        assert cancel.status_code == 404
        detail = await client.get(
            f"{base}/inquiries/{iid}", headers=b["member"]["auth"]
        )
        assert detail.status_code == 404
        status = (
            await _sql(
                "SELECT status FROM member_reservations WHERE id = :id", {"id": rid}
            )
        ).scalar_one()
        assert status == "PENDING"


class TestSameEmailAcrossTenants:
    async def test_signup_login_withdraw_independent(self, client: AsyncClient):
        sites = [await _new_tenant() for _ in range(3)]
        try:
            for site in sites:
                resp = await client.post(
                    f"/api/public/{site['slug']}/auth/register",
                    json={
                        "name": "홍길동",
                        "email": "multi@example.com",
                        "password": PASSWORD,
                        "password_confirm": PASSWORD,
                        "phone": PHONE,
                        "phone_verification_id": await _verified(site["id"]),
                        "terms_agree": True,
                        "privacy_agree": True,
                    },
                )
                assert resp.status_code == 201, resp.text
                site["token"] = resp.json()["data"]["access_token"]
                site["member_id"] = resp.json()["data"]["member"]["id"]
            assert len({s["member_id"] for s in sites}) == 3

            first = sites[0]
            out = await client.request(
                "DELETE",
                f"/api/public/{first['slug']}/members/me",
                headers={"Authorization": f"Bearer {first['token']}"},
                json={"password": PASSWORD},
            )
            assert out.status_code == 200

            for site, expected in zip(sites, (401, 200, 200), strict=True):
                login = await client.post(
                    f"/api/public/{site['slug']}/auth/login",
                    json={"email": "multi@example.com", "password": PASSWORD},
                )
                assert login.status_code == expected, site["slug"]
        finally:
            for site in sites:
                await _drop_tenant(site)


class TestSignupRace:
    async def test_concurrent_duplicate_email_conflict(
        self, client: AsyncClient, two_sites, monkeypatch
    ):
        """중복 확인을 통과한 뒤 다른 요청이 먼저 가입한 경우 → 유니크 인덱스로 409."""
        a, _ = two_sites

        async def _always_available(db, tenant_id, email) -> bool:
            return True

        monkeypatch.setattr(member_auth, "is_email_available", _always_available)
        resp = await client.post(
            f"/api/public/{a['slug']}/auth/register",
            json={
                "name": "홍길동",
                "email": "same@example.com",
                "password": PASSWORD,
                "password_confirm": PASSWORD,
                "phone": PHONE,
                "phone_verification_id": await _verified(a["id"]),
                "terms_agree": True,
                "privacy_agree": True,
            },
        )
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "CONFLICT"
