"""테넌트 API 는 테넌트 계정만 (T-082-B) — get_tenant_id.

슈퍼 어드민 계정은 tenant_id 가 없다. 전에는 테넌트 API 에 None 이 그대로 넘어가
조회가 비거나 저장이 DB 오류로 실패했다 — 이제 403. 슈퍼 어드민은 /api/super 를 쓴다.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from tests.conftest import _TestSession


@pytest.fixture
async def super_headers():
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


TENANT_ENDPOINTS = [
    ("GET", "/api/v1/sections"),
    ("GET", "/api/v1/inquiries"),
    ("GET", "/api/v1/sns-settings"),
    ("GET", "/api/v1/seo-settings"),
    ("GET", "/api/v1/tenant/features"),
    ("GET", "/api/v1/announcements"),
    ("POST", "/api/v1/edit/batch-save"),
]


@pytest.mark.parametrize(("method", "url"), TENANT_ENDPOINTS)
async def test_super_admin_token_forbidden_on_tenant_api(
    client: AsyncClient, super_headers: dict, method: str, url: str
):
    body = {"changes": [{"section_id": str(uuid.uuid4()), "field": "x", "value": "v"}]}
    resp = await client.request(
        method, url, headers=super_headers, json=body if method == "POST" else None
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "FORBIDDEN"


@pytest.mark.parametrize(("method", "url"), TENANT_ENDPOINTS[:5])
async def test_tenant_admin_still_allowed(
    client: AsyncClient, auth_headers: dict, method: str, url: str
):
    resp = await client.request(method, url, headers=auth_headers)
    assert resp.status_code == 200


async def test_no_token_is_401_not_403(client: AsyncClient):
    assert (await client.get("/api/v1/sections")).status_code == 401
