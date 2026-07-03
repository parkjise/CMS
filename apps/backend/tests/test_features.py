"""T-086 기능 플래그 시스템 API 테스트."""

import uuid

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from tests.conftest import _TestSession  # type: ignore


@pytest.fixture
async def super_headers() -> dict:
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


@pytest.fixture
async def bypass_session():
    session = _TestSession()
    await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    yield session
    await session.close()


@pytest.fixture
async def feature_factory():
    """생성된 feature id를 추적해 teardown에서 정리."""
    created: list[str] = []

    def _register(fid: str) -> None:
        created.append(fid)

    yield _register

    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        for fid in created:
            await session.execute(
                text("DELETE FROM feature_deployments WHERE feature_id = :fid"),
                {"fid": fid},
            )
            # tenant_features는 ON DELETE CASCADE
            await session.execute(
                text("DELETE FROM features WHERE id = :fid"), {"fid": fid}
            )
        await session.commit()


def _feature_payload(**overrides) -> dict:
    payload = {
        "key": f"TEST_FEAT_{uuid.uuid4().hex[:8].upper()}",
        "name": "테스트 기능",
        "category": "AI",
        "default_enabled": False,
    }
    payload.update(overrides)
    return payload


async def _create_feature(client, super_headers, feature_factory, **overrides) -> dict:
    resp = await client.post(
        "/api/super/v1/features",
        headers=super_headers,
        json=_feature_payload(**overrides),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    feature_factory(data["id"])
    return data


# ── 기능 마스터 CRUD ─────────────────────────────────────────────────────
class TestFeatureCrud:
    async def test_create_feature_success(
        self, client: AsyncClient, super_headers, feature_factory
    ):
        data = await _create_feature(client, super_headers, feature_factory)
        assert data["key"].startswith("TEST_FEAT_")
        assert data["is_active"] is True

    async def test_create_duplicate_key_conflict(
        self, client: AsyncClient, super_headers, feature_factory
    ):
        first = await _create_feature(client, super_headers, feature_factory)
        resp = await client.post(
            "/api/super/v1/features",
            headers=super_headers,
            json=_feature_payload(key=first["key"]),
        )
        assert resp.status_code == 409

    async def test_list_features_includes_created(
        self, client: AsyncClient, super_headers, feature_factory
    ):
        created = await _create_feature(client, super_headers, feature_factory)
        resp = await client.get("/api/super/v1/features", headers=super_headers)
        assert resp.status_code == 200
        keys = [i["key"] for i in resp.json()["data"]["items"]]
        assert created["key"] in keys

    async def test_create_requires_super_admin(self, client: AsyncClient, auth_headers):
        resp = await client.post(
            "/api/super/v1/features", headers=auth_headers, json=_feature_payload()
        )
        assert resp.status_code == 403

    async def test_list_unauthorized(self, client: AsyncClient):
        resp = await client.get("/api/super/v1/features")
        assert resp.status_code == 401


# ── 배포 ─────────────────────────────────────────────────────────────────
class TestDeploymentHistory:
    async def test_deploy_appears_in_history(
        self, client, super_headers, feature_factory, test_tenant
    ):
        feature = await _create_feature(client, super_headers, feature_factory)
        await client.post(
            f"/api/super/v1/features/{feature['id']}/deploy",
            headers=super_headers,
            json={
                "deployment_type": "SELECTIVE",
                "target_tenants": [test_tenant["id"]],
                "notes": "첫 배포",
            },
        )
        resp = await client.get(
            f"/api/super/v1/features/{feature['id']}/deployments",
            headers=super_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] >= 1
        assert data["items"][0]["deployment_type"] == "SELECTIVE"

    async def test_history_requires_super_admin(
        self, client, auth_headers, feature_factory, super_headers
    ):
        feature = await _create_feature(client, super_headers, feature_factory)
        resp = await client.get(
            f"/api/super/v1/features/{feature['id']}/deployments",
            headers=auth_headers,
        )
        assert resp.status_code == 403


class TestDeployment:
    async def test_selective_deploy_enables_tenant(
        self, client, super_headers, feature_factory, test_tenant, auth_headers
    ):
        feature = await _create_feature(client, super_headers, feature_factory)

        resp = await client.post(
            f"/api/super/v1/features/{feature['id']}/deploy",
            headers=super_headers,
            json={
                "deployment_type": "SELECTIVE",
                "target_tenants": [test_tenant["id"]],
            },
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["affected_count"] == 1

        # 테넌트 조회 API에 반영 확인 (완료 조건)
        me = await client.get("/api/v1/tenant/features", headers=auth_headers)
        assert me.status_code == 200
        body = me.json()["data"]
        assert body["flags"].get(feature["key"]) is True
        assert feature["key"] in [f["key"] for f in body["features"]]

    async def test_global_deploy(
        self, client, super_headers, feature_factory, test_tenant, auth_headers
    ):
        feature = await _create_feature(client, super_headers, feature_factory)
        resp = await client.post(
            f"/api/super/v1/features/{feature['id']}/deploy",
            headers=super_headers,
            json={"deployment_type": "GLOBAL"},
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["affected_count"] >= 1
        me = await client.get("/api/v1/tenant/features", headers=auth_headers)
        assert me.json()["data"]["flags"].get(feature["key"]) is True

    async def test_plan_based_deploy(
        self, client, super_headers, feature_factory, test_tenant, auth_headers
    ):
        # conftest test_tenant는 plan_type='FREE'
        feature = await _create_feature(client, super_headers, feature_factory)
        resp = await client.post(
            f"/api/super/v1/features/{feature['id']}/deploy",
            headers=super_headers,
            json={"deployment_type": "PLAN_BASED", "target_plan": "FREE"},
        )
        assert resp.status_code == 200
        me = await client.get("/api/v1/tenant/features", headers=auth_headers)
        assert me.json()["data"]["flags"].get(feature["key"]) is True

    async def test_plan_based_requires_target_plan(
        self, client, super_headers, feature_factory
    ):
        feature = await _create_feature(client, super_headers, feature_factory)
        resp = await client.post(
            f"/api/super/v1/features/{feature['id']}/deploy",
            headers=super_headers,
            json={"deployment_type": "PLAN_BASED"},
        )
        assert resp.status_code == 400

    async def test_gradual_deploy_full_rollout(
        self, client, super_headers, feature_factory, test_tenant, auth_headers
    ):
        feature = await _create_feature(client, super_headers, feature_factory)
        resp = await client.post(
            f"/api/super/v1/features/{feature['id']}/deploy",
            headers=super_headers,
            json={"deployment_type": "GRADUAL", "rollout_percent": 100},
        )
        assert resp.status_code == 200
        me = await client.get("/api/v1/tenant/features", headers=auth_headers)
        assert me.json()["data"]["flags"].get(feature["key"]) is True

    async def test_rollback_disables_feature(
        self, client, super_headers, feature_factory, test_tenant, auth_headers
    ):
        feature = await _create_feature(client, super_headers, feature_factory)
        deploy = await client.post(
            f"/api/super/v1/features/{feature['id']}/deploy",
            headers=super_headers,
            json={
                "deployment_type": "SELECTIVE",
                "target_tenants": [test_tenant["id"]],
            },
        )
        deployment_id = deploy.json()["data"]["deployment_id"]

        rb = await client.post(
            f"/api/super/v1/features/{feature['id']}/rollback/{deployment_id}",
            headers=super_headers,
        )
        assert rb.status_code == 200

        me = await client.get("/api/v1/tenant/features", headers=auth_headers)
        assert me.json()["data"]["flags"].get(feature["key"]) is False

    async def test_double_rollback_conflict(
        self, client, super_headers, feature_factory, test_tenant
    ):
        feature = await _create_feature(client, super_headers, feature_factory)
        deploy = await client.post(
            f"/api/super/v1/features/{feature['id']}/deploy",
            headers=super_headers,
            json={
                "deployment_type": "SELECTIVE",
                "target_tenants": [test_tenant["id"]],
            },
        )
        deployment_id = deploy.json()["data"]["deployment_id"]
        path = f"/api/super/v1/features/{feature['id']}/rollback/{deployment_id}"
        await client.post(path, headers=super_headers)
        second = await client.post(path, headers=super_headers)
        assert second.status_code == 409


# ── 개별 토글 + 테넌트 조회 ──────────────────────────────────────────────
class TestTenantToggle:
    async def test_super_admin_toggle_reflects_in_tenant_api(
        self, client, super_headers, feature_factory, test_tenant, auth_headers
    ):
        feature = await _create_feature(client, super_headers, feature_factory)
        tid, fid = test_tenant["id"], feature["id"]

        on = await client.patch(
            f"/api/super/v1/tenants/{tid}/features/{fid}",
            headers=super_headers,
            json={"is_enabled": True, "override_reason": "베타 요청"},
        )
        assert on.status_code == 200
        me = await client.get("/api/v1/tenant/features", headers=auth_headers)
        assert me.json()["data"]["flags"].get(feature["key"]) is True

        off = await client.patch(
            f"/api/super/v1/tenants/{tid}/features/{fid}",
            headers=super_headers,
            json={"is_enabled": False},
        )
        assert off.status_code == 200
        me2 = await client.get("/api/v1/tenant/features", headers=auth_headers)
        assert me2.json()["data"]["flags"].get(feature["key"]) is False

    async def test_list_tenant_features(
        self, client, super_headers, feature_factory, test_tenant
    ):
        feature = await _create_feature(client, super_headers, feature_factory)
        resp = await client.get(
            f"/api/super/v1/tenants/{test_tenant['id']}/features",
            headers=super_headers,
        )
        assert resp.status_code == 200
        keys = [i["key"] for i in resp.json()["data"]["items"]]
        assert feature["key"] in keys

    async def test_tenant_features_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/tenant/features")
        assert resp.status_code == 401


# ── require_feature 의존성 / is_enabled 서비스 ───────────────────────────
class TestRequireFeature:
    async def test_require_feature_blocks_when_disabled(
        self, bypass_session, test_tenant
    ):
        from app.core.deps import require_feature

        class _User:
            tenant_id = uuid.UUID(test_tenant["id"])

        checker = require_feature("NONEXISTENT_FEATURE_KEY")
        with pytest.raises(HTTPException) as exc:
            await checker(current_user=_User(), db=bypass_session)
        assert exc.value.status_code == 403

    async def test_is_enabled_service(
        self, client, super_headers, feature_factory, bypass_session, test_tenant
    ):
        from app.services import feature as svc

        feature = await _create_feature(client, super_headers, feature_factory)
        tenant_id = uuid.UUID(test_tenant["id"])
        feature_id = uuid.UUID(feature["id"])

        assert await svc.is_enabled(bypass_session, tenant_id, feature["key"]) is False

        await svc.toggle_feature(
            bypass_session, tenant_id, feature_id, True, actor_id=None
        )
        assert await svc.is_enabled(bypass_session, tenant_id, feature["key"]) is True
