"""기능 플래그가 실제로 동작하는지 (T-138, 기획서 14.3 · 14.5)."""

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import select, text

from app.core.security import create_access_token
from app.models.feature import Feature
from app.services import feature as svc
from app.services import notification as notification_service
from tests.conftest import _TestSession  # type: ignore

_DISABLED = "이 기능은 현재 비활성화되어 있습니다."


async def _sql(sql: str, **params):
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        row = result.first() if result.returns_rows else None
        await s.commit()
    return row


async def _set_plan(tenant_id: str, plan: str) -> None:
    await _sql("UPDATE tenants SET plan_type = :p WHERE id = :t", p=plan, t=tenant_id)
    await svc.invalidate_cache(tenant_id)


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
    await svc.invalidate_cache(tenant_id)


@pytest.fixture
async def tenant(test_tenant, test_user):
    await svc.invalidate_cache(test_tenant["id"])
    yield test_tenant
    await _sql("DELETE FROM tenant_features WHERE tenant_id = :t", t=test_tenant["id"])
    await svc.invalidate_cache(test_tenant["id"])


@pytest.fixture
async def super_headers() -> AsyncIterator[dict]:
    user_id = uuid.uuid4()
    await _sql(
        "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
        " created_at, updated_at) VALUES (:i, NULL, :e, 'x', 'SUPER_ADMIN', true,"
        " now(), now())",
        i=user_id,
        e=f"sa-{user_id.hex[:8]}@example.com",
    )
    token = create_access_token(
        user_id=user_id, tenant_id=None, role="SUPER_ADMIN", is_super_admin=True
    )
    yield {"Authorization": f"Bearer {token}"}
    await _sql("DELETE FROM audit_logs WHERE actor_id = :i", i=user_id)
    await _sql("DELETE FROM users WHERE id = :i", i=user_id)


async def _flags(tenant_id: str) -> dict:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        return (await svc.get_tenant_features(s, uuid.UUID(tenant_id)))["flags"]


class TestEffectiveFlags:
    """슈퍼 어드민이 정한 값이 없어도 정상 고객의 기능이 꺼지지 않는다"""

    @pytest.mark.parametrize(
        ("plan", "chat"),
        [("FREE", False), ("BASIC", False), ("STANDARD", True), ("PREMIUM", True)],
    )
    async def test_defaults_by_plan(self, tenant, plan, chat):
        await _set_plan(tenant["id"], plan)
        flags = await _flags(tenant["id"])
        assert flags["SECTION_EDITOR"] is True
        assert flags["SEO_WIZARD"] is True
        assert flags["TEMPLATE_SELECT"] is True
        assert flags["DRAG_SECTION_ORDER"] is True
        assert flags["GALLERY_SECTION"] is True
        assert flags["KAKAO_NOTIFICATION"] is True
        assert flags["AI_COPY_SUGGEST"] is True  # BASIC 도 월 20회 (13.4)
        assert flags["AI_CHAT_EDIT"] is chat  # STANDARD 부터 (13.4)
        assert flags["AI_MONTHLY_REPORT"] is chat

    async def test_explicit_value_wins(self, tenant):
        await _set_plan(tenant["id"], "STANDARD")
        await _set_flag(tenant["id"], "SEO_WIZARD", False)
        assert (await _flags(tenant["id"]))["SEO_WIZARD"] is False

    async def test_inactive_feature_is_off(self, tenant):
        assert "NAVER_ANALYTICS" not in await _flags(tenant["id"])

    async def test_plan_change_refreshes_cache(self, tenant, client, super_headers):
        await _set_plan(tenant["id"], "BASIC")
        assert (await _flags(tenant["id"]))["AI_CHAT_EDIT"] is False
        res = await client.patch(
            f"/api/super/v1/tenants/{tenant['id']}/plan",
            json={"plan_type": "STANDARD"},
            headers=super_headers,
        )
        assert res.status_code == 200
        assert (await _flags(tenant["id"]))["AI_CHAT_EDIT"] is True

    async def test_all_features_registered_by_migration(self):
        async with _TestSession() as s:
            await s.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            keys = set((await s.execute(select(Feature.key))).scalars())
        assert {
            "SECTION_EDITOR",
            "DRAG_SECTION_ORDER",
            "GALLERY_SECTION",
            "KAKAO_NOTIFICATION",
            "SEO_WIZARD",
            "TEMPLATE_SELECT",
            "AI_COPY_SUGGEST",
            "AI_CHAT_EDIT",
            "AI_MONTHLY_REPORT",
            "NAVER_ANALYTICS",
        } <= keys


class TestAlwaysOn:
    async def _feature_id(self, key: str) -> str:
        return str((await _sql("SELECT id FROM features WHERE key = :k", k=key))[0])

    async def test_cannot_turn_off(self, client, tenant, super_headers):
        fid = await self._feature_id("SECTION_EDITOR")
        res = await client.patch(
            f"/api/super/v1/tenants/{tenant['id']}/features/{fid}",
            json={"is_enabled": False},
            headers=super_headers,
        )
        assert res.status_code == 409
        assert (await _flags(tenant["id"]))["SECTION_EDITOR"] is True

    async def test_stale_off_row_is_ignored(self, tenant):
        await _set_flag(tenant["id"], "SECTION_EDITOR", False)
        assert (await _flags(tenant["id"]))["SECTION_EDITOR"] is True

    async def test_listed_as_locked(self, client, tenant, super_headers):
        res = await client.get(
            f"/api/super/v1/tenants/{tenant['id']}/features", headers=super_headers
        )
        items = {i["key"]: i for i in res.json()["data"]["items"]}
        assert items["SECTION_EDITOR"]["always_on"] is True
        assert items["SEO_WIZARD"]["always_on"] is False


# (플래그, HTTP 메서드, 경로, 본문)
_GATED = [
    ("SEO_WIZARD", "put", "/api/v1/seo-settings", {"meta_title": "x"}),
    ("TEMPLATE_SELECT", "post", "/api/v1/templates/rollback", None),
    ("TEMPLATE_SELECT", "patch", "/api/v1/templates/customize", {"css_overrides": {}}),
    ("DRAG_SECTION_ORDER", "patch", "/api/v1/sections/order", {"sections": []}),
    (
        "GALLERY_SECTION",
        "patch",
        "/api/v1/gallery/order",
        {"section_id": str(uuid.uuid4()), "items": []},
    ),
    ("AI_COPY_SUGGEST", "post", "/api/v1/ai/suggest-copy", {"section_type": "INTRO"}),
    ("AI_CHAT_EDIT", "post", "/api/v1/ai/chat-edit", {"message": "x"}),
]


class TestServerBlocks:
    @pytest.mark.parametrize(("key", "method", "path", "body"), _GATED)
    async def test_off_is_403(
        self, client, auth_headers, tenant, key, method, path, body
    ):
        await _set_plan(tenant["id"], "STANDARD")
        await _set_flag(tenant["id"], key, False)
        res = await client.request(method, path, json=body, headers=auth_headers)
        assert res.status_code == 403, res.text
        assert res.json()["error"]["message"] == _DISABLED

    @pytest.mark.parametrize(("key", "method", "path", "body"), _GATED)
    async def test_on_passes_flag_check(
        self, client, auth_headers, tenant, key, method, path, body, monkeypatch
    ):
        await _set_plan(tenant["id"], "STANDARD")
        await _set_flag(tenant["id"], key, True)
        res = await client.request(method, path, json=body, headers=auth_headers)
        # 본문 · 이력 때문에 다른 오류는 날 수 있어도 플래그로 막히지 않는다
        assert not (
            res.status_code == 403 and res.json()["error"]["message"] == _DISABLED
        ), res.text

    async def test_basic_cannot_chat_but_can_suggest(
        self, client, auth_headers, tenant
    ):
        await _set_plan(tenant["id"], "BASIC")
        chat = await client.post(
            "/api/v1/ai/chat-edit", json={"message": "x"}, headers=auth_headers
        )
        assert chat.status_code == 403
        suggest = await client.post(
            "/api/v1/ai/suggest-copy",
            json={"section_type": "INTRO"},
            headers=auth_headers,
        )
        assert not (
            suggest.status_code == 403
            and suggest.json()["error"]["message"] == _DISABLED
        )

    async def test_analytics_blocked_until_deployed(self, client, auth_headers, tenant):
        for path in ("summary", "timeseries"):
            res = await client.get(f"/api/v1/analytics/{path}", headers=auth_headers)
            assert res.status_code == 403

    async def test_reads_stay_open(self, client, auth_headers, tenant):
        await _set_flag(tenant["id"], "SEO_WIZARD", False)
        assert (
            await client.get("/api/v1/seo-settings", headers=auth_headers)
        ).status_code == 200

    async def test_public_site_unaffected(self, client, tenant):
        await _set_flag(tenant["id"], "GALLERY_SECTION", False)
        await _set_flag(tenant["id"], "SEO_WIZARD", False)
        res = await client.get(f"/api/public/site/{tenant['slug']}")
        assert res.status_code == 200


class TestGalleryAdd:
    async def test_off_hides_and_blocks(self, client, auth_headers, tenant):
        await _set_plan(tenant["id"], "STANDARD")
        await _set_flag(tenant["id"], "GALLERY_SECTION", False)
        limits = await client.get("/api/v1/sections/limits", headers=auth_headers)
        types = {t["section_type"] for t in limits.json()["data"]["addable_types"]}
        assert "GALLERY" not in types and "INTRO" in types
        res = await client.post(
            "/api/v1/sections",
            json={"section_type": "GALLERY"},
            headers=auth_headers,
        )
        assert res.status_code == 403

    async def test_on_lists_gallery(self, client, auth_headers, tenant):
        await _set_plan(tenant["id"], "STANDARD")
        limits = await client.get("/api/v1/sections/limits", headers=auth_headers)
        types = {t["section_type"] for t in limits.json()["data"]["addable_types"]}
        assert "GALLERY" in types


class TestKakaoFlag:
    async def _notify(self, tenant_id: str, monkeypatch) -> tuple[dict, list]:
        from datetime import UTC, datetime

        calls: list[str] = []

        async def kakao(**_):
            calls.append("kakao")
            return True

        async def sms(**_):
            calls.append("sms")
            return True

        monkeypatch.setattr(notification_service, "send_kakao_alimtalk", kakao)
        monkeypatch.setattr(notification_service, "send_sms", sms)
        await _sql(
            "INSERT INTO notification_settings"
            " (id, tenant_id, alimtalk_enabled, sms_enabled, recipient_phone)"
            " VALUES (gen_random_uuid(), :t, true, true, '01012345678')"
            " ON CONFLICT (tenant_id) DO UPDATE SET alimtalk_enabled = true,"
            " sms_enabled = true, recipient_phone = '01012345678'",
            t=tenant_id,
        )
        async with _TestSession() as s:
            await s.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            result = await notification_service.notify_inquiry(
                s,
                uuid.UUID(tenant_id),
                inquiry_name="홍길동",
                inquiry_phone="01099998888",
                inquiry_type="GENERAL",
                inquiry_created_at=datetime.now(UTC),
            )
        await _sql(
            "DELETE FROM notification_settings WHERE tenant_id = :t", t=tenant_id
        )
        return result, calls

    async def test_on_sends_kakao(self, tenant, monkeypatch):
        await _set_plan(tenant["id"], "STANDARD")
        _, calls = await self._notify(tenant["id"], monkeypatch)
        assert calls == ["kakao"]

    async def test_off_falls_back_to_sms(self, tenant, monkeypatch):
        await _set_plan(tenant["id"], "STANDARD")
        await _set_flag(tenant["id"], "KAKAO_NOTIFICATION", False)
        _, calls = await self._notify(tenant["id"], monkeypatch)
        assert calls == ["sms"]
