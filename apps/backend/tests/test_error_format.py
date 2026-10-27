"""공통 에러 응답 형식 (CLAUDE.md 5) — 모든 API 오류가 같은 모양인지.

`{"success": false, "error": {"code", "message", "field", "details"}}`
(`detail` 키 없음).
"""

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request

from app.core import errors
from app.main import app


def _assert_standard(body: dict, code: str) -> dict:
    assert body["success"] is False
    assert "detail" not in body
    err = body["error"]
    assert err["code"] == code
    assert isinstance(err["message"], str) and err["message"]
    assert set(err) == {"code", "message", "field", "details"}
    return err


class TestToError:
    @pytest.mark.parametrize(
        ("status", "detail", "code", "message"),
        [
            (404, "NOT_FOUND", "NOT_FOUND", "요청한 정보를 찾을 수 없습니다"),
            (401, "UNAUTHORIZED", "UNAUTHORIZED", "로그인이 필요합니다"),
            (400, "TOO_MANY_FILES", "TOO_MANY_FILES", "한 번에 최대 10개까지"),
            (
                409,
                "이미 사용 중인 slug입니다.",
                "CONFLICT",
                "이미 사용 중인 slug입니다.",
            ),
            (400, "잘못된 값입니다.", "VALIDATION_ERROR", "잘못된 값입니다."),
            (422, "PLAN_LIMIT_EXCEEDED", "PLAN_LIMIT_EXCEEDED", "사용 한도"),
            (422, "이번 달 한도를 초과했습니다.", "PLAN_LIMIT_EXCEEDED", "이번 달"),
            (502, "AI 서버 오류", "INTERNAL_ERROR", "AI 서버 오류"),
            (403, None, "FORBIDDEN", "접근 권한이 없습니다"),
            (418, "SOME_NEW_CODE", "SOME_NEW_CODE", "SOME_NEW_CODE"),
        ],
    )
    def test_mapping(self, status, detail, code, message):
        err = errors.to_error(status, detail).error
        assert err.code == code
        assert message in err.message

    def test_dict_detail_kept(self):
        err = errors.to_error(
            400, {"code": "X_CODE", "message": "문구", "field": "slug", "details": [1]}
        ).error
        assert (err.code, err.message, err.field, err.details) == (
            "X_CODE",
            "문구",
            "slug",
            [1],
        )

    async def test_headers_preserved(self):
        req = Request({"type": "http", "method": "GET", "path": "/", "headers": []})
        exc = HTTPException(401, "UNAUTHORIZED", headers={"WWW-Authenticate": "Bearer"})
        resp = await errors.http_exception_handler(req, exc)
        assert resp.status_code == 401
        assert resp.headers["www-authenticate"] == "Bearer"

    async def test_rate_limit(self):
        req = Request({"type": "http", "method": "GET", "path": "/", "headers": []})

        class _Limit:
            error_message = None
            limit = "3 per 1 minute"

        resp = await errors.rate_limit_handler(req, RateLimitExceeded(_Limit()))
        assert resp.status_code == 429
        import json

        _assert_standard(json.loads(resp.body), "RATE_LIMIT_EXCEEDED")


class TestApiResponses:
    async def test_login_failure_message(self, client: AsyncClient, test_user: dict):
        resp = await client.post(
            "/api/v1/auth/login",
            json={
                "email": test_user["email"],
                "password": "wrong-password",
                "tenant_slug": test_user["tenant_slug"],
            },
        )
        assert resp.status_code == 401
        err = _assert_standard(resp.json(), "UNAUTHORIZED")
        assert err["message"] == "이메일 또는 비밀번호가 올바르지 않습니다"

    async def test_401_without_token(self, client: AsyncClient):
        resp = await client.get("/api/v1/sections")
        assert resp.status_code == 401
        _assert_standard(resp.json(), "UNAUTHORIZED")

    async def test_unknown_route_404(self, client: AsyncClient):
        resp = await client.get("/api/v1/no-such-route")
        assert resp.status_code == 404
        err = _assert_standard(resp.json(), "NOT_FOUND")
        assert err["message"] == "요청한 정보를 찾을 수 없습니다"  # "Not Found" 아님

    async def test_method_not_allowed(self, client: AsyncClient):
        resp = await client.delete("/api/v1/auth/login")
        assert resp.status_code == 405
        err = _assert_standard(resp.json(), "METHOD_NOT_ALLOWED")
        assert err["message"] == "허용되지 않은 요청입니다"

    async def test_validation_400_with_field(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/login", json={"email": "a@b.com"})
        assert resp.status_code == 400
        err = _assert_standard(resp.json(), "VALIDATION_ERROR")
        assert err["field"] == "password"
        assert err["message"] == "필수 입력 항목입니다"
        assert {d["field"] for d in err["details"]} >= {"password", "tenant_slug"}

    async def test_korean_detail_becomes_message(
        self, client: AsyncClient, auth_headers
    ):
        resp = await client.post(
            "/api/v1/templates/rollback", headers=auth_headers, json={}
        )
        assert resp.status_code in (400, 404)
        err = _assert_standard(
            resp.json(), "NOT_FOUND" if resp.status_code == 404 else "VALIDATION_ERROR"
        )
        assert any("가" <= ch <= "힣" for ch in err["message"])

    async def test_member_api_keeps_detailed_validation(self, client: AsyncClient):
        resp = await client.post("/api/public/no-such/auth/login", json={})
        assert resp.status_code in (400, 404)
        _assert_standard(
            resp.json(), "VALIDATION_ERROR" if resp.status_code == 400 else "NOT_FOUND"
        )

    async def test_unhandled_exception_is_500_without_internals(self):
        @app.get("/api/v1/__boom_for_test")
        async def _boom():  # pragma: no cover - 테스트 전용 라우트
            raise RuntimeError("secret internal detail")

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app, raise_app_exceptions=False),
                base_url="http://test",
            ) as ac:
                resp = await ac.get("/api/v1/__boom_for_test")
        finally:
            app.router.routes = [
                r
                for r in app.router.routes
                if getattr(r, "path", "") != "/api/v1/__boom_for_test"
            ]
        assert resp.status_code == 500
        err = _assert_standard(resp.json(), "INTERNAL_ERROR")
        assert "secret" not in resp.text
        assert err["message"].startswith("서버 오류")
