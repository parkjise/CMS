"""T-206 섹션 저장 전 미리보기 (AD-02 [미리보기])."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.redis import get_redis
from app.core.security import create_access_token
from app.services import section_draft
from tests.conftest import _TestSession

PUBLIC = "/api/public/site/{slug}/draft/{token}"


def _url(section_id: str) -> str:
    return f"/api/v1/sections/{section_id}/preview"


async def _sql(sql: str, **params) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await s.execute(text(sql), params)
        await s.commit()


def _title(value: str) -> dict:
    return {"settings": [{"field_key": "main_title", "field_value": value}]}


def _settings(site: dict, section_id: str) -> dict:
    section = next(s for s in site["sections"] if s["id"] == section_id)
    return {s["field_key"]: s["field_value"] for s in section["settings"]}


@pytest.fixture
async def saved_title(test_section) -> dict:
    """저장된 제목 '원래 제목' + 부제."""
    for key, value in (("main_title", "원래 제목"), ("sub_title", "그대로 부제")):
        await _sql(
            "INSERT INTO section_settings (id, tenant_id, section_id, field_key,"
            " field_value, value_type, created_at, updated_at) VALUES"
            " (gen_random_uuid(), :t, :s, :k, :v, 'STRING', now(), now())",
            t=test_section["tenant_id"],
            s=test_section["id"],
            k=key,
            v=value,
        )
    return test_section


class TestCreateDraft:
    async def test_preview_shows_draft_without_saving(
        self, client: AsyncClient, auth_headers, test_tenant, saved_title
    ):
        sid = saved_title["id"]
        resp = await client.post(
            _url(sid), json=_title("새 제목"), headers=auth_headers
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["page_key"] == "home"
        assert data["expires_in"] == 600

        site = (
            await client.get(
                PUBLIC.format(slug=test_tenant["slug"], token=data["token"])
            )
        ).json()["data"]
        # 바꾼 칸만 덮고, 나머지는 저장된 값
        assert _settings(site, sid) == {
            "main_title": "새 제목",
            "sub_title": "그대로 부제",
        }

        # DB · 실제 홈페이지는 그대로
        real = (await client.get(f"/api/public/site/{test_tenant['slug']}")).json()
        assert _settings(real["data"], sid)["main_title"] == "원래 제목"
        section = (
            await client.get(f"/api/v1/sections/{sid}", headers=auth_headers)
        ).json()["data"]
        titles = [s for s in section["settings"] if s["field_key"] == "main_title"]
        assert titles[0]["field_value"] == "원래 제목"

    async def test_hidden_section_is_shown_in_preview(
        self, client, auth_headers, test_tenant, saved_title
    ):
        await _sql(
            "UPDATE sections SET is_active = false WHERE id = :s", s=saved_title["id"]
        )
        token = (
            await client.post(
                _url(saved_title["id"]), json=_title("새 제목"), headers=auth_headers
            )
        ).json()["data"]["token"]
        site = (
            await client.get(PUBLIC.format(slug=test_tenant["slug"], token=token))
        ).json()["data"]
        section = next(s for s in site["sections"] if s["id"] == saved_title["id"])
        assert section["is_active"] is True

    async def test_same_validation_as_save(self, client, auth_headers, test_section):
        """주소 칸 javascript: · 너무 긴 제목은 저장처럼 400."""
        bad_url = {
            "settings": [{"field_key": "cta_url", "field_value": "javascript:alert(1)"}]
        }
        for body in (bad_url, _title("가" * 41)):
            resp = await client.post(
                _url(test_section["id"]), json=body, headers=auth_headers
            )
            assert resp.status_code == 400, body

    async def test_rich_text_is_cleaned(
        self, client, auth_headers, test_tenant, test_section
    ):
        """서식 글은 허용 태그만 — 공개 미리보기에 스크립트가 실리지 않게."""
        body = {
            "settings": [
                {
                    "field_key": "description",
                    "field_value": "<b>굵게</b><script>alert(1)</script>",
                    "value_type": "RICH_TEXT",
                }
            ]
        }
        token = (
            await client.post(_url(test_section["id"]), json=body, headers=auth_headers)
        ).json()["data"]["token"]
        site = (
            await client.get(PUBLIC.format(slug=test_tenant["slug"], token=token))
        ).json()["data"]
        value = _settings(site, test_section["id"])["description"]
        assert "<script" not in value
        assert "굵게" in value

    async def test_not_found_404(self, client, auth_headers, test_tenant):
        resp = await client.post(
            _url(str(uuid.uuid4())), json=_title("x"), headers=auth_headers
        )
        assert resp.status_code == 404

    async def test_unauthenticated_401(self, client, test_section):
        resp = await client.post(_url(test_section["id"]), json=_title("x"))
        assert resp.status_code == 401

    async def test_viewer_403(self, client, test_tenant, test_section):
        user_id = uuid.uuid4()
        await _sql(
            "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active,"
            " created_at, updated_at)"
            " VALUES (:id, :t, :e, 'x', 'TENANT_VIEWER', true, now(), now())",
            id=str(user_id),
            t=test_tenant["id"],
            e=f"{user_id.hex[:8]}@example.com",
        )
        token = create_access_token(
            user_id=user_id,
            tenant_id=uuid.UUID(test_tenant["id"]),
            role="TENANT_VIEWER",
        )
        resp = await client.post(
            _url(test_section["id"]),
            json=_title("x"),
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    async def test_other_tenant_404(self, client, test_section):
        """다른 사업체 관리자는 남의 섹션 미리보기를 만들 수 없다 (RLS)."""
        tenant_id, user_id = uuid.uuid4(), uuid.uuid4()
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
                _url(test_section["id"]),
                json=_title("x"),
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 404
        finally:
            await _sql("DELETE FROM users WHERE tenant_id = :t", t=str(tenant_id))
            await _sql("DELETE FROM tenants WHERE id = :t", t=str(tenant_id))


class TestPublicDraft:
    async def test_unknown_token_404(self, client, test_tenant):
        resp = await client.get(PUBLIC.format(slug=test_tenant["slug"], token="nope"))
        assert resp.status_code == 404

    async def test_other_slug_404(
        self, client, auth_headers, test_tenant, test_section
    ):
        """토큰은 만든 사업체 주소에서만 — 다른 사업체 주소로 열면 404."""
        token = (
            await client.post(
                _url(test_section["id"]), json=_title("새 제목"), headers=auth_headers
            )
        ).json()["data"]["token"]
        other_id = uuid.uuid4()
        slug = f"other-{other_id.hex[:8]}"
        await _sql(
            "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
            " updated_at) VALUES (:id, 'other', :s, 'STANDARD', true, now(), now())",
            id=str(other_id),
            s=slug,
        )
        try:
            resp = await client.get(PUBLIC.format(slug=slug, token=token))
            assert resp.status_code == 404
        finally:
            await _sql("DELETE FROM tenants WHERE id = :t", t=str(other_id))

    async def test_expired_token_404(
        self, client, auth_headers, test_tenant, test_section
    ):
        token = (
            await client.post(
                _url(test_section["id"]), json=_title("새 제목"), headers=auth_headers
            )
        ).json()["data"]["token"]
        redis = await get_redis()
        assert 0 < await redis.ttl(f"section-draft:{token}") <= 600
        await redis.delete(f"section-draft:{token}")
        resp = await client.get(PUBLIC.format(slug=test_tenant["slug"], token=token))
        assert resp.status_code == 404

    async def test_too_long_token_ignored(self):
        assert await section_draft.load_draft("x" * 65) is None
