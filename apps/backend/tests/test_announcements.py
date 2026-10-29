"""T-088 공지 API + 발송 시스템 테스트."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.core.security import create_access_token
from tests.conftest import _TestSession  # type: ignore


@pytest.fixture
async def super_headers() -> dict:
    user_id = uuid.uuid4()
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text(
                "INSERT INTO users "
                "(id, tenant_id, email, password_hash, role, is_active, "
                " created_at, updated_at) "
                "VALUES (:id, NULL, :email, 'x', 'SUPER_ADMIN', true, now(), now())"
            ),
            {"id": str(user_id), "email": f"sa-{uuid.uuid4().hex[:6]}@cms.io"},
        )
        await session.commit()
    token = create_access_token(
        user_id=user_id, tenant_id=None, role="SUPER_ADMIN", is_super_admin=True
    )
    yield {"Authorization": f"Bearer {token}"}
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("DELETE FROM users WHERE id = :id"), {"id": str(user_id)}
        )
        await session.commit()


@pytest.fixture
async def bypass_session():
    session = _TestSession()
    await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    yield session
    await session.close()


@pytest.fixture
async def announcement_factory():
    created: list[str] = []

    def _register(aid: str) -> None:
        created.append(aid)

    yield _register

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        for aid in created:
            await session.execute(
                text("DELETE FROM announcement_reads WHERE announcement_id = :a"),
                {"a": aid},
            )
            await session.execute(
                text("DELETE FROM announcements WHERE id = :a"), {"a": aid}
            )
        await session.commit()


def _payload(**over) -> dict:
    p = {
        "title": "공지 제목",
        "content": "공지 본문입니다.",
        "type": "INFO",
        "target_type": "ALL",
    }
    p.update(over)
    return p


async def _create(client, super_headers, announcement_factory, **over) -> dict:
    resp = await client.post(
        "/api/super/v1/announcements", headers=super_headers, json=_payload(**over)
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    announcement_factory(data["id"])
    return data


# ── 슈퍼 어드민 CRUD ─────────────────────────────────────────────────────
class TestSuperCrud:
    async def test_create_all_published(
        self, client, super_headers, announcement_factory
    ):
        data = await _create(client, super_headers, announcement_factory)
        assert data["is_published"] is True
        assert data["published_at"] is not None

    async def test_create_plan_based_requires_plan(self, client, super_headers):
        resp = await client.post(
            "/api/super/v1/announcements",
            headers=super_headers,
            json=_payload(target_type="PLAN_BASED"),
        )
        assert resp.status_code == 400

    async def test_create_selective_requires_tenants(self, client, super_headers):
        resp = await client.post(
            "/api/super/v1/announcements",
            headers=super_headers,
            json=_payload(target_type="SELECTIVE"),
        )
        assert resp.status_code == 400

    async def test_list_includes_created(
        self, client, super_headers, announcement_factory
    ):
        created = await _create(client, super_headers, announcement_factory)
        resp = await client.get("/api/super/v1/announcements", headers=super_headers)
        assert resp.status_code == 200
        ids = [i["id"] for i in resp.json()["data"]["items"]]
        assert created["id"] in ids

    async def test_update(self, client, super_headers, announcement_factory):
        created = await _create(client, super_headers, announcement_factory)
        resp = await client.patch(
            f"/api/super/v1/announcements/{created['id']}",
            headers=super_headers,
            json={"title": "수정된 제목"},
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["title"] == "수정된 제목"

    async def test_delete(self, client, super_headers, announcement_factory):
        created = await _create(client, super_headers, announcement_factory)
        resp = await client.delete(
            f"/api/super/v1/announcements/{created['id']}", headers=super_headers
        )
        assert resp.status_code == 200

    async def test_send_returns_target_count(
        self, client, super_headers, announcement_factory, test_tenant
    ):
        created = await _create(client, super_headers, announcement_factory)
        resp = await client.post(
            f"/api/super/v1/announcements/{created['id']}/send", headers=super_headers
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["target_count"] >= 1

    async def test_requires_super_admin(self, client, auth_headers):
        resp = await client.post(
            "/api/super/v1/announcements", headers=auth_headers, json=_payload()
        )
        assert resp.status_code == 403

    async def test_unauthorized(self, client):
        resp = await client.get("/api/super/v1/announcements")
        assert resp.status_code == 401


# ── 테넌트용 조회/읽음 ───────────────────────────────────────────────────
class TestTenantRead:
    async def test_all_announcement_visible(
        self, client, super_headers, announcement_factory, test_tenant, auth_headers
    ):
        created = await _create(client, super_headers, announcement_factory)
        resp = await client.get("/api/v1/announcements", headers=auth_headers)
        assert resp.status_code == 200
        items = {i["id"]: i for i in resp.json()["data"]["items"]}
        assert created["id"] in items
        assert items[created["id"]]["is_read"] is False

    async def test_plan_based_matches_tenant_plan(
        self, client, super_headers, announcement_factory, test_tenant, auth_headers
    ):
        # conftest test_tenant plan_type='FREE'
        created = await _create(
            client,
            super_headers,
            announcement_factory,
            target_type="PLAN_BASED",
            target_plan="FREE",
        )
        resp = await client.get("/api/v1/announcements", headers=auth_headers)
        ids = [i["id"] for i in resp.json()["data"]["items"]]
        assert created["id"] in ids

    async def test_plan_based_other_plan_hidden(
        self, client, super_headers, announcement_factory, test_tenant, auth_headers
    ):
        created = await _create(
            client,
            super_headers,
            announcement_factory,
            target_type="PLAN_BASED",
            target_plan="PREMIUM",
        )
        resp = await client.get("/api/v1/announcements", headers=auth_headers)
        ids = [i["id"] for i in resp.json()["data"]["items"]]
        assert created["id"] not in ids

    async def test_selective_targets_specific_tenant(
        self, client, super_headers, announcement_factory, test_tenant, auth_headers
    ):
        created = await _create(
            client,
            super_headers,
            announcement_factory,
            target_type="SELECTIVE",
            target_tenants=[test_tenant["id"]],
        )
        resp = await client.get("/api/v1/announcements", headers=auth_headers)
        ids = [i["id"] for i in resp.json()["data"]["items"]]
        assert created["id"] in ids

    async def test_selective_other_tenant_hidden(
        self, client, super_headers, announcement_factory, test_tenant, auth_headers
    ):
        """T-082-B: 대상 조건(target_tenants 포함 여부) 표현을 바꿔도 다른 테넌트 공지는 안 보인다."""
        created = await _create(
            client,
            super_headers,
            announcement_factory,
            target_type="SELECTIVE",
            target_tenants=[str(uuid.uuid4())],
        )
        resp = await client.get("/api/v1/announcements", headers=auth_headers)
        ids = [i["id"] for i in resp.json()["data"]["items"]]
        assert created["id"] not in ids

    async def test_expired_hidden(
        self, client, super_headers, announcement_factory, test_tenant, auth_headers
    ):
        past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
        created = await _create(
            client, super_headers, announcement_factory, expires_at=past
        )
        resp = await client.get("/api/v1/announcements", headers=auth_headers)
        ids = [i["id"] for i in resp.json()["data"]["items"]]
        assert created["id"] not in ids

    async def test_mark_read(
        self, client, super_headers, announcement_factory, test_tenant, auth_headers
    ):
        created = await _create(client, super_headers, announcement_factory)
        read = await client.post(
            f"/api/v1/announcements/{created['id']}/read", headers=auth_headers
        )
        assert read.status_code == 200

        resp = await client.get("/api/v1/announcements", headers=auth_headers)
        items = {i["id"]: i for i in resp.json()["data"]["items"]}
        assert items[created["id"]]["is_read"] is True

    async def test_tenant_features_includes_unread_announcement(
        self, client, super_headers, announcement_factory, test_tenant, auth_headers
    ):
        """완료 조건: 공지 생성 → 테넌트 features 응답 배너에 노출."""
        created = await _create(client, super_headers, announcement_factory)
        resp = await client.get("/api/v1/tenant/features", headers=auth_headers)
        assert resp.status_code == 200
        ann_ids = [a["id"] for a in resp.json()["data"]["announcements"]]
        assert created["id"] in ann_ids

    async def test_requires_auth(self, client):
        resp = await client.get("/api/v1/announcements")
        assert resp.status_code == 401


# ── 워커 (async 함수 직접 호출) ──────────────────────────────────────────
class TestWorker:
    async def test_send_resolves_targets(
        self, client, super_headers, announcement_factory, bypass_session, test_tenant
    ):
        from app.workers import announcement as worker

        created = await _create(
            client, super_headers, announcement_factory, send_kakao=True
        )
        result = await worker._send_announcement(created["id"])
        assert result["target_count"] >= 1
        assert result["kakao_sent"] == 0  # 테스트 테넌트에 알림 설정 없음

    async def test_send_not_found(self):
        from app.workers import announcement as worker

        result = await worker._send_announcement(str(uuid.uuid4()))
        assert result["skipped"] is True

    async def test_publish_scheduled(
        self, super_headers, announcement_factory, bypass_session
    ):
        from app.models.announcement import Announcement
        from app.workers import announcement as worker

        aid = uuid.uuid4()
        announcement_factory(str(aid))
        bypass_session.add(
            Announcement(
                id=aid,
                title="예약 공지",
                content="본문",
                type="INFO",
                target_type="ALL",
                is_published=False,
                published_at=datetime.now(UTC) - timedelta(minutes=1),
            )
        )
        await bypass_session.commit()

        count = await worker._publish_scheduled_announcements()
        assert count >= 1
        refreshed = await bypass_session.get(Announcement, aid)
        await bypass_session.refresh(refreshed)
        assert refreshed.is_published is True

    async def test_deactivate_expired(
        self, super_headers, announcement_factory, bypass_session
    ):
        from app.models.announcement import Announcement
        from app.workers import announcement as worker

        aid = uuid.uuid4()
        announcement_factory(str(aid))
        bypass_session.add(
            Announcement(
                id=aid,
                title="만료 공지",
                content="본문",
                type="INFO",
                target_type="ALL",
                is_published=True,
                expires_at=datetime.now(UTC) - timedelta(minutes=1),
            )
        )
        await bypass_session.commit()

        count = await worker._deactivate_expired_announcements()
        assert count >= 1
        refreshed = await bypass_session.get(Announcement, aid)
        await bypass_session.refresh(refreshed)
        assert refreshed.is_published is False


# ── 이메일 발송 (T-088-A — 예전엔 '준비 중') ─────────────────────────────
class TestAnnouncementEmail:
    @pytest.fixture
    def sent(self, monkeypatch):
        from app.services import email as email_service

        calls: list[dict] = []

        async def fake(to, *, title, content):
            calls.append({"to": to, "title": title, "content": content})
            return {"sent": True, "stub": True}

        monkeypatch.setattr(email_service, "send_announcement_email", fake)
        return calls

    async def _add_user(self, tenant_id: str, email: str, role: str, active=True):
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text(
                    "INSERT INTO users (id, tenant_id, email, password_hash, role,"
                    " is_active, created_at, updated_at) VALUES (:id, :t, :e, 'x',"
                    " :r, :a, now(), now())"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "t": tenant_id,
                    "e": email,
                    "r": role,
                    "a": active,
                },
            )
            await session.commit()

    async def test_sends_to_active_admins_of_targets_only(
        self, client, super_headers, announcement_factory, test_tenant, sent
    ):
        from app.workers import announcement as worker

        t = test_tenant["id"]
        await self._add_user(t, "owner@shop.com", "TENANT_ADMIN")
        await self._add_user(t, "OWNER@shop.com ", "TENANT_ADMIN")  # 같은 주소
        await self._add_user(t, "viewer@shop.com", "TENANT_VIEWER")
        await self._add_user(t, "gone@shop.com", "TENANT_ADMIN", active=False)

        created = await _create(
            client,
            super_headers,
            announcement_factory,
            target_type="SELECTIVE",
            target_tenants=[t],
            send_email=True,
            title="정기 점검 안내",
            content="5월 26일 새벽 2시~4시\n점검이 진행됩니다.",
        )
        result = await worker._send_announcement(created["id"])

        assert [c["to"].lower() for c in sent] == ["owner@shop.com"]
        assert sent[0]["title"] == "정기 점검 안내"
        assert "점검이 진행됩니다" in sent[0]["content"]
        assert result["email_sent"] == 1
        assert result["email_failed"] == 0

    async def test_no_email_when_switch_off(
        self, client, super_headers, announcement_factory, test_tenant, sent
    ):
        from app.workers import announcement as worker

        await self._add_user(test_tenant["id"], "owner2@shop.com", "TENANT_ADMIN")
        created = await _create(
            client,
            super_headers,
            announcement_factory,
            target_type="SELECTIVE",
            target_tenants=[test_tenant["id"]],
            send_email=False,
        )
        result = await worker._send_announcement(created["id"])
        assert sent == []
        assert result["email_sent"] == 0

    async def test_one_failure_does_not_stop_others(
        self, client, super_headers, announcement_factory, test_tenant, monkeypatch
    ):
        from app.services import email as email_service
        from app.workers import announcement as worker

        async def flaky(to, *, title, content):
            if to.startswith("bad"):
                raise RuntimeError("SES down")
            return {"sent": True}

        monkeypatch.setattr(email_service, "send_announcement_email", flaky)
        t = test_tenant["id"]
        await self._add_user(t, "bad@shop.com", "TENANT_ADMIN")
        await self._add_user(t, "good@shop.com", "TENANT_ADMIN")
        created = await _create(
            client,
            super_headers,
            announcement_factory,
            target_type="SELECTIVE",
            target_tenants=[t],
            send_email=True,
        )
        result = await worker._send_announcement(created["id"])
        assert result["email_sent"] == 1
        assert result["email_failed"] == 1

    def test_email_template_renders_title_and_content_safely(self):
        from app.services.email import render_email

        html = render_email(
            "announcement",
            {
                "title": "점검 <안내>",
                "content": "줄1\n<script>x</script>",
                "admin_url": "http://admin",
            },
        )
        assert "점검 &lt;안내&gt;" in html
        assert "<script>" not in html
        assert 'href="http://admin"' in html
