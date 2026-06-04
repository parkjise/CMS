"""
app/services/auth.py 단위 테스트
DB는 AsyncMock으로 대체 — T-013에서 실 DB 통합 테스트 추가 예정
"""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.security import create_access_token, create_refresh_token, decode_token, verify_password
from app.models.tenant import Tenant
from app.models.user import User
from app.services.auth import authenticate_user, get_user_by_id, issue_tokens, verify_token


# ── security.py 단위 테스트 ────────────────────────────────────────────

def test_hash_and_verify_password():
    from app.core.security import hash_password
    hashed = hash_password("secret123")
    assert verify_password("secret123", hashed)
    assert not verify_password("wrong", hashed)


def test_create_and_decode_access_token():
    user_id = uuid.uuid4()
    tenant_id = uuid.uuid4()
    token = create_access_token(user_id, tenant_id, "TENANT_ADMIN")
    payload = decode_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["tenant_id"] == str(tenant_id)
    assert payload["role"] == "TENANT_ADMIN"
    assert payload["is_super_admin"] is False


def test_create_access_token_super_admin_no_tenant():
    user_id = uuid.uuid4()
    token = create_access_token(user_id, None, "SUPER_ADMIN", is_super_admin=True)
    payload = decode_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["tenant_id"] is None
    assert payload["is_super_admin"] is True


def test_decode_invalid_token_raises():
    with pytest.raises(ValueError):
        decode_token("not.a.valid.token")


def test_create_refresh_token():
    user_id = uuid.uuid4()
    token = create_refresh_token(user_id)
    payload = decode_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["type"] == "refresh"


# ── auth service 단위 테스트 (DB mock) ────────────────────────────────

def _make_tenant(slug: str = "test-shop") -> Tenant:
    t = MagicMock(spec=Tenant)
    t.id = uuid.uuid4()
    t.slug = slug
    t.is_active = True
    t.deleted_at = None
    return t


def _make_user(tenant_id: uuid.UUID, email: str = "admin@test.com") -> User:
    from app.core.security import hash_password
    u = MagicMock(spec=User)
    u.id = uuid.uuid4()
    u.tenant_id = tenant_id
    u.email = email
    u.password_hash = hash_password("pass1234")
    u.role = "TENANT_ADMIN"
    u.is_active = True
    u.deleted_at = None
    return u


@pytest.mark.asyncio
async def test_authenticate_user_success():
    tenant = _make_tenant()
    user = _make_user(tenant.id)

    db = AsyncMock()
    # set_config 호출 무시
    db.execute = AsyncMock()

    tenant_result = MagicMock()
    tenant_result.scalar_one_or_none.return_value = tenant
    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = user
    db.execute.side_effect = [
        AsyncMock(return_value=None),   # _bypass_rls set_config
        tenant_result,                  # tenant 조회
        user_result,                    # user 조회
    ]

    result = await authenticate_user(db, user.email, "pass1234", tenant.slug)
    assert result is user


@pytest.mark.asyncio
async def test_authenticate_user_wrong_password():
    tenant = _make_tenant()
    user = _make_user(tenant.id)

    db = AsyncMock()
    tenant_result = MagicMock()
    tenant_result.scalar_one_or_none.return_value = tenant
    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = user
    db.execute.side_effect = [
        AsyncMock(return_value=None),
        tenant_result,
        user_result,
    ]

    with pytest.raises(ValueError, match="UNAUTHORIZED"):
        await authenticate_user(db, user.email, "wrongpassword", tenant.slug)


@pytest.mark.asyncio
async def test_authenticate_user_tenant_not_found():
    db = AsyncMock()
    tenant_result = MagicMock()
    tenant_result.scalar_one_or_none.return_value = None
    db.execute.side_effect = [
        AsyncMock(return_value=None),
        tenant_result,
    ]

    with pytest.raises(ValueError, match="UNAUTHORIZED"):
        await authenticate_user(db, "any@email.com", "pass", "nonexistent")


@pytest.mark.asyncio
async def test_get_user_by_id_found():
    user = _make_user(uuid.uuid4())
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    db.execute.return_value = result

    found = await get_user_by_id(db, user.id)
    assert found is user


@pytest.mark.asyncio
async def test_get_user_by_id_not_found():
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute.return_value = result

    found = await get_user_by_id(db, uuid.uuid4())
    assert found is None


def test_issue_tokens():
    tenant = _make_tenant()
    user = _make_user(tenant.id)
    user.role = "TENANT_ADMIN"

    access_token, refresh_token = issue_tokens(user)

    access_payload = decode_token(access_token)
    assert access_payload["sub"] == str(user.id)
    assert access_payload["role"] == "TENANT_ADMIN"
    assert access_payload["is_super_admin"] is False

    refresh_payload = decode_token(refresh_token)
    assert refresh_payload["sub"] == str(user.id)
    assert refresh_payload["type"] == "refresh"


def test_verify_token_valid():
    user_id = uuid.uuid4()
    token = create_access_token(user_id, uuid.uuid4(), "TENANT_ADMIN")
    payload = verify_token(token)
    assert payload["sub"] == str(user_id)


def test_verify_token_invalid():
    with pytest.raises(ValueError):
        verify_token("bad.token.value")
