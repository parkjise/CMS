"""이미지 저장 공간 사용량 — 요금제 화면 (T-037-C)."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from tests.conftest import _TestSession  # type: ignore

_URL = "/api/v1/billing/storage"
GB = 1024**3


async def _sql(sql: str, params: dict) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(text(sql), params)
        await session.commit()


async def _add_file(tenant_id: str, size: int) -> None:
    await _sql(
        "INSERT INTO uploaded_files (id, tenant_id, file_name, file_url, file_size,"
        " mime_type, created_at, updated_at) VALUES (:id, :tid, 'x.webp', :url,"
        " :size, 'image/webp', NOW(), NOW())",
        {
            "id": str(uuid.uuid4()),
            "tid": tenant_id,
            "url": f"http://cdn/{uuid.uuid4()}.webp",
            "size": size,
        },
    )


@pytest.fixture
async def cleanup_files(test_tenant: dict):
    yield
    await _sql(
        "DELETE FROM uploaded_files WHERE tenant_id = :t", {"t": test_tenant["id"]}
    )


class TestStorageUsage:
    async def test_requires_auth(self, client: AsyncClient):
        assert (await client.get(_URL)).status_code == 401

    async def test_empty(self, client: AsyncClient, auth_headers: dict):
        data = (await client.get(_URL, headers=auth_headers)).json()["data"]
        assert data["used_bytes"] == 0
        assert data["quota_bytes"] == 1 * GB  # FREE · 모르는 요금제는 BASIC 한도

    @pytest.mark.parametrize(
        "plan,quota", [("BASIC", 1), ("STANDARD", 5), ("PREMIUM", 20)]
    )
    async def test_sum_and_plan_quota(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_tenant: dict,
        cleanup_files,
        plan: str,
        quota: int,
    ):
        await _sql(
            "UPDATE tenants SET plan_type = :p WHERE id = :t",
            {"p": plan, "t": test_tenant["id"]},
        )
        await _add_file(test_tenant["id"], 300_000)
        await _add_file(test_tenant["id"], 200_000)
        data = (await client.get(_URL, headers=auth_headers)).json()["data"]
        assert data == {"used_bytes": 500_000, "quota_bytes": quota * GB}

    async def test_other_tenant_files_not_counted(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict, cleanup_files
    ):
        other = str(uuid.uuid4())
        await _sql(
            "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at,"
            " updated_at) VALUES (:id, '다른 곳', :slug, 'BASIC', true, now(), now())",
            {"id": other, "slug": f"o-{other[:8]}"},
        )
        try:
            await _add_file(other, 999_999)
            await _add_file(test_tenant["id"], 1_000)
            data = (await client.get(_URL, headers=auth_headers)).json()["data"]
            assert data["used_bytes"] == 1_000
        finally:
            await _sql("DELETE FROM uploaded_files WHERE tenant_id = :t", {"t": other})
            await _sql("DELETE FROM tenants WHERE id = :t", {"t": other})
