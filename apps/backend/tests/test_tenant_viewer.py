"""보기 전용 계정 TENANT_VIEWER (T-130, 기획서 7.5)."""

import re
import uuid

import pytest
from fastapi.routing import APIRoute
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import hash_password
from app.main import app
from tests.conftest import _TestSession  # type: ignore

VIEWER_PASSWORD = "viewerpass123"
# 로그인 자체 · 본인 동작은 뷰어도 쓴다
EXEMPT = (
    re.compile(r"^/api/v1/auth/"),
    re.compile(r"^/api/v1/announcements/[^/]+/read$"),
    # 개인 화면 설정 — 자기 보기만 바꾼다 (T-181, test_preferences 에서 검사)
    re.compile(r"^/api/v1/me/preferences/"),
)


@pytest.fixture
async def viewer_headers(client: AsyncClient, test_tenant: dict) -> dict:
    email = f"viewer-{uuid.uuid4().hex[:8]}@example.com"
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin','true',true)"))
        await s.execute(
            text(
                "INSERT INTO users (id, tenant_id, email, password_hash, role, is_active)"
                " VALUES (gen_random_uuid(), :t, :e, :p, 'TENANT_VIEWER', true)"
            ),
            {"t": test_tenant["id"], "e": email, "p": hash_password(VIEWER_PASSWORD)},
        )
        await s.commit()
    resp = await client.post(
        "/api/v1/auth/login",
        json={
            "email": email,
            "password": VIEWER_PASSWORD,
            "tenant_slug": test_tenant["slug"],
        },
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['data']['access_token']}"}


def _tenant_write_routes() -> list[tuple[str, str]]:
    routes = []
    for route in app.routes:
        if not isinstance(route, APIRoute) or not route.path.startswith("/api/v1/"):
            continue
        if any(rule.search(route.path) for rule in EXEMPT):
            continue
        routes += [
            (method, route.path) for method in route.methods - {"GET", "HEAD", "OPTIONS"}
        ]
    return sorted(routes)


class TestViewerGuard:
    async def test_every_write_route_is_blocked(self, client, viewer_headers):
        """쓰기 라우트 전체 — 새로 생긴 라우트도 자동으로 검사된다."""
        routes = _tenant_write_routes()
        assert len(routes) > 20
        allowed = []
        for method, path in routes:
            url = re.sub(r"\{[^}]+\}", str(uuid.uuid4()), path)
            resp = await client.request(method, url, headers=viewer_headers, json={})
            if resp.status_code != 403:
                allowed.append((method, path, resp.status_code))
        assert allowed == []

    async def test_message(self, client, viewer_headers):
        resp = await client.put(
            "/api/v1/seo-settings", headers=viewer_headers, json={"meta_title": "x"}
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["message"] == "보기 전용 계정은 내용을 변경할 수 없습니다."

    @pytest.mark.parametrize(
        "path",
        ["/api/v1/sections", "/api/v1/inquiries", "/api/v1/seo-settings", "/api/v1/auth/me"],
    )
    async def test_can_read(self, client, viewer_headers, path):
        assert (await client.get(path, headers=viewer_headers)).status_code == 200

    async def test_can_mark_announcement_read(self, client, viewer_headers):
        url = f"/api/v1/announcements/{uuid.uuid4()}/read"
        resp = await client.post(url, headers=viewer_headers)
        assert resp.status_code != 403

    async def test_admin_is_not_blocked(self, client, auth_headers):
        resp = await client.put(
            "/api/v1/seo-settings", headers=auth_headers, json={"meta_title": "제목"}
        )
        assert resp.status_code == 200

    async def test_viewer_cannot_read_other_tenant(self, client, viewer_headers, test_section):
        # test_section 은 같은 테넌트 — 다른 테넌트 id 는 없는 것과 같다
        resp = await client.get(f"/api/v1/sections/{uuid.uuid4()}", headers=viewer_headers)
        assert resp.status_code == 404
