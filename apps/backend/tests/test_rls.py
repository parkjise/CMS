"""
테넌트 간 RLS 격리 검증:
  - 테넌트 A의 데이터에 테넌트 B의 JWT로 접근 시 → 404 (RLS가 행을 숨김)
  - 테넌트 B의 목록 조회에 테넌트 A 데이터가 포함되지 않음
"""
import uuid
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token, hash_password
from tests.conftest import _TestSession


@pytest.fixture
async def tenant_b() -> dict:
    slug = f"tenant-b-{uuid.uuid4().hex[:6]}"
    tid = uuid.uuid4()
    uid = uuid.uuid4()

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text(
                "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at, updated_at) "
                "VALUES (:id, :name, :slug, 'FREE', true, now(), now())"
            ),
            {"id": str(tid), "name": f"Tenant B {slug}", "slug": slug},
        )
        await session.execute(
            text(
                "INSERT INTO users "
                "(id, tenant_id, email, password_hash, role, is_active, created_at, updated_at) "
                "VALUES (:id, :tid, :email, :pw, 'TENANT_ADMIN', true, now(), now())"
            ),
            {
                "id": str(uid),
                "tid": str(tid),
                "email": f"admin@{slug}.com",
                "pw": hash_password("password123"),
            },
        )
        await session.commit()

    yield {"tenant_id": str(tid), "user_id": str(uid), "slug": slug}

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("DELETE FROM users WHERE tenant_id = :tid"), {"tid": str(tid)}
        )
        await session.execute(
            text("DELETE FROM tenants WHERE id = :tid"), {"tid": str(tid)}
        )
        await session.commit()


@pytest.fixture
def tenant_b_headers(tenant_b: dict) -> dict:
    token = create_access_token(
        user_id=UUID(tenant_b["user_id"]),
        tenant_id=UUID(tenant_b["tenant_id"]),
        role="TENANT_ADMIN",
    )
    return {"Authorization": f"Bearer {token}"}


# ── Section RLS ───────────────────────────────────────────────────────────────

class TestSectionRLS:
    async def test_tenant_b_cannot_see_tenant_a_section(
        self,
        client: AsyncClient,
        test_section: dict,
        tenant_b_headers: dict,
    ):
        """테넌트 B의 토큰으로 테넌트 A 섹션 조회 → RLS가 숨겨서 404"""
        resp = await client.get(
            f"/api/v1/sections/{test_section['id']}",
            headers=tenant_b_headers,
        )
        assert resp.status_code == 404

    async def test_tenant_b_list_excludes_tenant_a_sections(
        self,
        client: AsyncClient,
        test_section: dict,
        tenant_b_headers: dict,
    ):
        """테넌트 B 목록에 테넌트 A 섹션 미포함"""
        resp = await client.get("/api/v1/sections", headers=tenant_b_headers)
        assert resp.status_code == 200
        ids = [s["id"] for s in resp.json()["data"]]
        assert test_section["id"] not in ids

    async def test_tenant_b_cannot_update_tenant_a_section(
        self,
        client: AsyncClient,
        test_section: dict,
        tenant_b_headers: dict,
    ):
        """테넌트 B가 테넌트 A 섹션 수정 시도 → 404"""
        resp = await client.patch(
            f"/api/v1/sections/{test_section['id']}",
            json={"label": "해킹 시도"},
            headers=tenant_b_headers,
        )
        assert resp.status_code == 404

    async def test_tenant_b_cannot_toggle_tenant_a_section(
        self,
        client: AsyncClient,
        test_section: dict,
        tenant_b_headers: dict,
    ):
        """테넌트 B가 테넌트 A 섹션 토글 시도 → 404"""
        resp = await client.patch(
            f"/api/v1/sections/{test_section['id']}/toggle",
            headers=tenant_b_headers,
        )
        assert resp.status_code == 404


# ── Inquiry RLS ──────────────────────────────────────────────────────────────

class TestInquiryRLS:
    async def test_tenant_b_cannot_see_tenant_a_inquiry(
        self,
        client: AsyncClient,
        test_inquiry: dict,
        tenant_b_headers: dict,
    ):
        """테넌트 B 토큰으로 테넌트 A 문의 조회 → 404"""
        resp = await client.get(
            f"/api/v1/inquiries/{test_inquiry['id']}",
            headers=tenant_b_headers,
        )
        assert resp.status_code == 404

    async def test_tenant_b_list_excludes_tenant_a_inquiries(
        self,
        client: AsyncClient,
        test_inquiry: dict,
        tenant_b_headers: dict,
    ):
        """테넌트 B 문의 목록에 테넌트 A 문의 미포함"""
        resp = await client.get("/api/v1/inquiries", headers=tenant_b_headers)
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()["data"]["items"]]
        assert test_inquiry["id"] not in ids

    async def test_tenant_b_cannot_update_tenant_a_inquiry(
        self,
        client: AsyncClient,
        test_inquiry: dict,
        tenant_b_headers: dict,
    ):
        """테넌트 B가 테넌트 A 문의 상태 변경 시도 → 404"""
        resp = await client.patch(
            f"/api/v1/inquiries/{test_inquiry['id']}",
            json={"status": "DONE"},
            headers=tenant_b_headers,
        )
        assert resp.status_code == 404

    async def test_tenant_b_cannot_delete_tenant_a_inquiry(
        self,
        client: AsyncClient,
        test_inquiry: dict,
        tenant_b_headers: dict,
    ):
        """테넌트 B가 테넌트 A 문의 삭제 시도 → 404"""
        resp = await client.delete(
            f"/api/v1/inquiries/{test_inquiry['id']}",
            headers=tenant_b_headers,
        )
        assert resp.status_code == 404


# ── Dashboard RLS ─────────────────────────────────────────────────────────────

class TestDashboardRLS:
    async def test_dashboard_stats_scoped_to_tenant(
        self,
        client: AsyncClient,
        auth_headers: dict,
        tenant_b_headers: dict,
        test_inquiry: dict,
    ):
        """각 테넌트의 대시보드 통계는 독립적"""
        resp_a = await client.get("/api/v1/dashboard/stats", headers=auth_headers)
        resp_b = await client.get("/api/v1/dashboard/stats", headers=tenant_b_headers)
        assert resp_a.status_code == 200
        assert resp_b.status_code == 200
        # 테넌트 A는 문의 있음, 테넌트 B는 없음
        pending_a = resp_a.json()["data"]["pending_inquiries"]
        pending_b = resp_b.json()["data"]["pending_inquiries"]
        assert pending_a >= 1
        assert pending_b == 0

    async def test_recent_inquiries_scoped_to_tenant(
        self,
        client: AsyncClient,
        auth_headers: dict,
        tenant_b_headers: dict,
        test_inquiry: dict,
    ):
        """최근 문의 목록이 테넌트별로 격리됨"""
        resp_b = await client.get(
            "/api/v1/dashboard/recent-inquiries", headers=tenant_b_headers
        )
        assert resp_b.status_code == 200
        ids = [item["id"] for item in resp_b.json()["data"]]
        assert test_inquiry["id"] not in ids
