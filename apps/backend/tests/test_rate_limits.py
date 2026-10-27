"""요청 한도 설정값 (T-078-A) — LOGIN_RATE_LIMIT · INQUIRY_RATE_LIMIT.

운영 기본값(10/분 · 3/분)은 그대로, E2E CI 처럼 한 IP 에서 많이 부를 때만 올린다.
(다른 테스트에서는 conftest 가 한도를 꺼 둔다 — 여기서만 잠시 켠다)
"""

import pytest
from httpx import AsyncClient

from app.api.v1.endpoints.auth import limiter as auth_limiter
from app.api.v1.endpoints.inquiries import _limiter as inquiry_limiter
from app.core.config import Settings, settings


@pytest.fixture
def enabled(monkeypatch):
    def _enable(limiter):
        limiter.reset()
        monkeypatch.setattr(limiter, "enabled", True)
        return limiter

    yield _enable
    auth_limiter.reset()
    inquiry_limiter.reset()


def test_defaults_unchanged():
    s = Settings(_env_file=None, app_secret_key="k" * 32, database_url="x")  # type: ignore[call-arg]
    assert s.login_rate_limit == "10/minute"
    assert s.inquiry_rate_limit == "3/minute"


async def test_login_limit_follows_setting(client: AsyncClient, enabled, monkeypatch):
    monkeypatch.setattr(settings, "login_rate_limit", "2/minute")
    enabled(auth_limiter)
    body = {"email": "nobody@example.com", "password": "wrong-pass", "tenant_slug": "x"}
    codes = [
        (await client.post("/api/v1/auth/login", json=body)).status_code
        for _ in range(3)
    ]
    assert codes[:2] == [401, 401]
    assert codes[2] == 429


async def test_inquiry_limit_follows_setting(client: AsyncClient, enabled, monkeypatch):
    monkeypatch.setattr(settings, "inquiry_rate_limit", "1/minute")
    enabled(inquiry_limiter)
    body = {
        "name": "홍길동",
        "phone": "010-1234-5678",
        "message": "한도 테스트 문의입니다.",
    }
    first = await client.post(
        "/api/public/inquiries", params={"tenant_slug": "no-such"}, json=body
    )
    second = await client.post(
        "/api/public/inquiries", params={"tenant_slug": "no-such"}, json=body
    )
    assert first.status_code == 404
    assert second.status_code == 429
