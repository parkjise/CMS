"""이용약관 · 개인정보처리방침 (T-200, 상위 기획서 10.2 #7 · 16.3)."""

import uuid

from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from tests.conftest import _TestSession  # type: ignore
from tests.test_rls import tenant_b, tenant_b_headers  # noqa: F401 (픽스처)

URL = "/api/v1/site-settings/policies"


async def _sql(sql: str, **params) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await s.execute(text(sql), params)
        await s.commit()


def _public(slug: str, kind: str) -> str:
    return f"/api/public/site/{slug}/policies/{kind}"


class TestDefaults:
    async def test_default_uses_site_info(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        resp = await client.get(URL, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["terms"]["is_default"] is True
        assert data["terms"]["title"] == "이용약관"
        assert f"Test Tenant {test_tenant['slug']}" in data["terms"]["body"]
        # 대표자를 아직 넣지 않았으면 안내 문구
        assert "사이트 설정에서 입력해 주세요" in data["privacy"]["body"]

        await client.put(
            "/api/v1/site-settings",
            json={"ceo": "홍길동", "phone": "02-1234-5678"},
            headers=auth_headers,
        )
        privacy = (await client.get(URL, headers=auth_headers)).json()["data"][
            "privacy"
        ]
        assert "책임자: 홍길동" in privacy["body"]
        assert "02-1234-5678" in privacy["body"]

    async def test_retention_follows_plan_and_purge(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        body = (await client.get(URL, headers=auth_headers)).json()["data"]["privacy"][
            "body"
        ]
        # 테스트 사업체는 FREE — 요금제 표에 없으면 BASIC 기준
        assert "접수일로부터 30일" in body
        assert "수집일로부터 90일" in body
        assert "운영 종료 후 30일" in body

        await _sql(
            "UPDATE tenants SET plan_type = 'PREMIUM' WHERE id = :t",
            t=test_tenant["id"],
        )
        body = (await client.get(URL, headers=auth_headers)).json()["data"]["privacy"][
            "body"
        ]
        assert "사업자가 지울 때까지" in body


async def _publish(client: AsyncClient, headers: dict, kind: str, body: str) -> dict:
    """새 버전 → 본문 · 요약 저장 → 바로 공개 (T-224)"""
    created = await client.post(f"{URL}/{kind}/draft", headers=headers)
    assert created.status_code == 200, created.text
    saved = await client.put(
        f"{URL}/{kind}/draft", json={"body": body, "summary": "고침"}, headers=headers
    )
    assert saved.status_code == 200, saved.text
    resp = await client.post(f"{URL}/{kind}/publish", json={}, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


class TestEdit:
    async def test_publish_shows_on_homepage(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        doc = await _publish(client, auth_headers, "terms", "  제1조 우리 병원 약관  ")
        assert doc["body"] == "제1조 우리 병원 약관"
        assert doc["is_default"] is False
        assert doc["updated_at"] is not None
        assert doc["default_body"].startswith("제1조 (목적)")

        public = await client.get(_public(test_tenant["slug"], "terms"))
        assert public.status_code == 200
        assert public.json()["data"]["body"] == "제1조 우리 병원 약관"
        # 방침은 그대로 기본 문안
        other = await client.get(_public(test_tenant["slug"], "privacy"))
        assert other.json()["data"]["is_default"] is True

    async def test_too_long_and_bad_kind(self, client: AsyncClient, auth_headers: dict):
        await client.post(f"{URL}/terms/draft", headers=auth_headers)
        resp = await client.put(
            f"{URL}/terms/draft", json={"body": "가" * 30001}, headers=auth_headers
        )
        assert resp.status_code in (400, 422)
        resp = await client.post(f"{URL}/refund/draft", headers=auth_headers)
        assert resp.status_code in (400, 422)


class TestAccess:
    async def test_login_and_viewer(
        self, client: AsyncClient, test_tenant: dict, test_user: dict
    ):
        assert (await client.get(URL)).status_code == 401
        await _sql(
            "UPDATE users SET role = 'TENANT_VIEWER' WHERE id = :i", i=test_user["id"]
        )
        token = create_access_token(
            user_id=uuid.UUID(test_user["id"]),
            tenant_id=uuid.UUID(test_tenant["id"]),
            role="TENANT_VIEWER",
        )
        headers = {"Authorization": f"Bearer {token}"}
        assert (await client.get(URL, headers=headers)).status_code == 200
        resp = await client.post(f"{URL}/terms/draft", headers=headers)
        assert resp.status_code == 403

    async def test_tenants_are_separate(
        self,
        client: AsyncClient,
        auth_headers: dict,
        tenant_b_headers: dict,  # noqa: F811
    ):
        await _publish(client, auth_headers, "terms", "A 약관")
        other = (await client.get(URL, headers=tenant_b_headers)).json()["data"]
        assert other["terms"]["is_default"] is True
        assert "A 약관" not in other["terms"]["body"]
        assert other["terms"]["versions"] == []

    async def test_public_unknown_or_inactive(
        self, client: AsyncClient, test_tenant: dict
    ):
        assert (await client.get(_public("no-such-site", "terms"))).status_code == 404
        await _sql(
            "UPDATE tenants SET is_active = false WHERE id = :t", t=test_tenant["id"]
        )
        assert (
            await client.get(_public(test_tenant["slug"], "terms"))
        ).status_code == 404
