"""정지된 사이트 안내 (T-201, 기획서 10.2 #11)."""

from httpx import AsyncClient
from sqlalchemy import text

from tests.conftest import _TestSession  # type: ignore


async def _sql(sql: str, **params) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await s.execute(text(sql), params)
        await s.commit()


def _url(slug: str) -> str:
    return f"/api/public/site/{slug}/availability"


class TestAvailability:
    async def test_active_with_phone(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await client.put(
            "/api/v1/site-settings",
            json={"phone": "02-1234-5678"},
            headers=auth_headers,
        )
        resp = await client.get(_url(test_tenant["slug"]))
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"] == {
            "status": "ACTIVE",
            "name": f"Test Tenant {test_tenant['slug']}",
            "phone": "02-1234-5678",
        }

    async def test_paused_when_blocked(self, client: AsyncClient, test_tenant: dict):
        await _sql(
            "UPDATE tenants SET is_active = false WHERE id = :t", t=test_tenant["id"]
        )
        resp = await client.get(_url(test_tenant["slug"]))
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "PAUSED"
        assert resp.json()["data"]["phone"] is None
        # 홈페이지 데이터는 그대로 닫혀 있다
        site = await client.get(f"/api/public/site/{test_tenant['slug']}")
        assert site.status_code == 404

    async def test_unknown_deleted_or_purged_is_404(
        self, client: AsyncClient, test_tenant: dict
    ):
        assert (await client.get(_url("no-such-site"))).status_code == 404
        await _sql(
            "UPDATE tenants SET is_active = false, data_purged_at = now()"
            " WHERE id = :t",
            t=test_tenant["id"],
        )
        assert (await client.get(_url(test_tenant["slug"]))).status_code == 404
        await _sql(
            "UPDATE tenants SET data_purged_at = NULL, deleted_at = now()"
            " WHERE id = :t",
            t=test_tenant["id"],
        )
        assert (await client.get(_url(test_tenant["slug"]))).status_code == 404
