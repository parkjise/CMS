import pytest
from httpx import AsyncClient


class TestLogin:
    async def test_login_success(self, client: AsyncClient, test_user: dict):
        resp = await client.post(
            "/api/v1/auth/login",
            json={
                "email": test_user["email"],
                "password": test_user["password"],
                "tenant_slug": test_user["tenant_slug"],
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert "access_token" in body["data"]
        assert body["data"]["user"]["email"] == test_user["email"]
        # refresh_token cookie 발급 확인
        assert "refresh_token" in resp.cookies

    async def test_login_wrong_password(self, client: AsyncClient, test_user: dict):
        resp = await client.post(
            "/api/v1/auth/login",
            json={
                "email": test_user["email"],
                "password": "wrong-password",
                "tenant_slug": test_user["tenant_slug"],
            },
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "UNAUTHORIZED"

    async def test_login_wrong_email(self, client: AsyncClient, test_user: dict):
        resp = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "nobody@example.com",
                "password": test_user["password"],
                "tenant_slug": test_user["tenant_slug"],
            },
        )
        assert resp.status_code == 401

    async def test_login_nonexistent_tenant(self, client: AsyncClient, test_user: dict):
        resp = await client.post(
            "/api/v1/auth/login",
            json={
                "email": test_user["email"],
                "password": test_user["password"],
                "tenant_slug": "no-such-tenant-slug",
            },
        )
        assert resp.status_code == 401

    async def test_login_missing_fields(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/login", json={"email": "a@b.com"})
        assert resp.status_code == 422


class TestMe:
    async def test_me_with_bearer(self, client: AsyncClient, test_user: dict):
        login = await client.post(
            "/api/v1/auth/login",
            json={
                "email": test_user["email"],
                "password": test_user["password"],
                "tenant_slug": test_user["tenant_slug"],
            },
        )
        access_token = login.json()["data"]["access_token"]

        resp = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["email"] == test_user["email"]

    async def test_me_with_cookie(self, client: AsyncClient, test_user: dict):
        login = await client.post(
            "/api/v1/auth/login",
            json={
                "email": test_user["email"],
                "password": test_user["password"],
                "tenant_slug": test_user["tenant_slug"],
            },
        )
        # AsyncClient가 Set-Cookie를 자동으로 유지함
        assert "refresh_token" in login.cookies

        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 200
        assert resp.json()["data"]["email"] == test_user["email"]

    async def test_me_unauthenticated(self, client: AsyncClient):
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401


class TestRefresh:
    async def test_refresh_issues_new_token(self, client: AsyncClient, test_user: dict):
        await client.post(
            "/api/v1/auth/login",
            json={
                "email": test_user["email"],
                "password": test_user["password"],
                "tenant_slug": test_user["tenant_slug"],
            },
        )

        resp = await client.post("/api/v1/auth/refresh")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert "access_token" in body["data"]

    async def test_refresh_without_cookie(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/refresh")
        assert resp.status_code == 401

    async def test_refresh_rotates_cookie(self, client: AsyncClient, test_user: dict):
        await client.post(
            "/api/v1/auth/login",
            json={
                "email": test_user["email"],
                "password": test_user["password"],
                "tenant_slug": test_user["tenant_slug"],
            },
        )
        old_cookie = client.cookies.get("refresh_token")

        await client.post("/api/v1/auth/refresh")
        new_cookie = client.cookies.get("refresh_token")

        assert new_cookie is not None
        assert new_cookie != old_cookie


class TestLogout:
    async def test_logout_clears_cookie(self, client: AsyncClient, test_user: dict):
        await client.post(
            "/api/v1/auth/login",
            json={
                "email": test_user["email"],
                "password": test_user["password"],
                "tenant_slug": test_user["tenant_slug"],
            },
        )

        resp = await client.post("/api/v1/auth/logout")
        assert resp.status_code == 204

    async def test_logout_invalidates_token(self, client: AsyncClient, test_user: dict):
        await client.post(
            "/api/v1/auth/login",
            json={
                "email": test_user["email"],
                "password": test_user["password"],
                "tenant_slug": test_user["tenant_slug"],
            },
        )

        await client.post("/api/v1/auth/logout")

        # 로그아웃 후 /me 쿠키 경로는 401 반환해야 함
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    async def test_logout_without_cookie(self, client: AsyncClient):
        # 쿠키 없이도 204 반환 (멱등성)
        resp = await client.post("/api/v1/auth/logout")
        assert resp.status_code == 204
