"""T-033 SSE 엔드포인트 인증 테스트.

스트림 본문은 무한히 열려있으므로 인증 분기만 검증한다.
인증 성공 경로는 `_resolve_tenant_id` 의존성을 직접 호출하여 테스트.
"""

from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.api.v1.endpoints.notifications import _resolve_tenant_id
from app.core.security import create_access_token


class TestStreamAuth:
    async def test_unauthorized_without_token(self, client):
        resp = await client.get("/api/v1/notifications/stream")
        assert resp.status_code == 401

    async def test_invalid_token_query(self, client):
        resp = await client.get(
            "/api/v1/notifications/stream?token=invalid.token.value"
        )
        assert resp.status_code == 401


class TestResolveTenantIdDependency:
    """_resolve_tenant_id는 동기 함수라 직접 호출 가능."""

    def test_returns_tenant_id_from_query_token(self, test_user_sync):
        token = create_access_token(
            user_id=UUID(test_user_sync["id"]),
            tenant_id=UUID(test_user_sync["tenant_id"]),
            role="TENANT_ADMIN",
        )
        tid = _resolve_tenant_id(credentials=None, token=token)
        assert tid == UUID(test_user_sync["tenant_id"])

    def test_returns_tenant_id_from_authorization_header(self, test_user_sync):
        token = create_access_token(
            user_id=UUID(test_user_sync["id"]),
            tenant_id=UUID(test_user_sync["tenant_id"]),
            role="TENANT_ADMIN",
        )
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        tid = _resolve_tenant_id(credentials=creds, token=None)
        assert tid == UUID(test_user_sync["tenant_id"])

    def test_authorization_header_takes_precedence_over_query(self, test_user_sync):
        token = create_access_token(
            user_id=UUID(test_user_sync["id"]),
            tenant_id=UUID(test_user_sync["tenant_id"]),
            role="TENANT_ADMIN",
        )
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        # 쿼리 토큰이 invalid이어도 헤더가 valid면 통과
        tid = _resolve_tenant_id(credentials=creds, token="garbage")
        assert tid == UUID(test_user_sync["tenant_id"])

    def test_raises_401_when_no_token(self):
        with pytest.raises(HTTPException) as exc_info:
            _resolve_tenant_id(credentials=None, token=None)
        assert exc_info.value.status_code == 401

    def test_raises_401_when_invalid(self):
        with pytest.raises(HTTPException) as exc_info:
            _resolve_tenant_id(credentials=None, token="bogus")
        assert exc_info.value.status_code == 401


# ── 동기 픽스처: test_user는 async라 동기 함수에서 못 씀 ──────────────────


@pytest.fixture
def test_user_sync():
    """_resolve_tenant_id는 동기 함수라 가짜 user 정보만 필요."""
    import uuid

    return {
        "id": str(uuid.uuid4()),
        "tenant_id": str(uuid.uuid4()),
    }
