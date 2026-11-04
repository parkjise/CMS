import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from tests.conftest import _TestSession  # type: ignore


class TestListSections:
    async def test_list_sections_empty(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/sections", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert isinstance(body["data"], list)

    async def test_list_sections_returns_own_sections(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        resp = await client.get("/api/v1/sections", headers=auth_headers)
        assert resp.status_code == 200
        ids = [s["id"] for s in resp.json()["data"]]
        assert test_section["id"] in ids

    async def test_list_sections_unauthenticated(self, client: AsyncClient):
        resp = await client.get("/api/v1/sections")
        assert resp.status_code == 401


class TestGetSection:
    async def test_get_section_success(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        resp = await client.get(f"/api/v1/sections/{test_section['id']}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["id"] == test_section["id"]
        assert data["section_type"] == "HERO_BANNER"
        assert data["label"] == "메인 배너"
        assert isinstance(data["settings"], list)

    async def test_get_section_not_found(self, client: AsyncClient, auth_headers: dict):
        import uuid
        resp = await client.get(f"/api/v1/sections/{uuid.uuid4()}", headers=auth_headers)
        assert resp.status_code == 404


class TestUpdateSection:
    async def test_update_label(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        resp = await client.patch(
            f"/api/v1/sections/{test_section['id']}",
            json={"label": "새 레이블"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["label"] == "새 레이블"

    async def test_update_settings(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        resp = await client.patch(
            f"/api/v1/sections/{test_section['id']}",
            json={
                "settings": [
                    {"field_key": "main_title", "field_value": "환영합니다", "value_type": "STRING"},
                    {"field_key": "sub_title", "field_value": "부제목", "value_type": "STRING"},
                ]
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        settings = {s["field_key"]: s["field_value"] for s in resp.json()["data"]["settings"]}
        assert settings["main_title"] == "환영합니다"
        assert settings["sub_title"] == "부제목"

    async def test_update_main_title_too_long(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        resp = await client.patch(
            f"/api/v1/sections/{test_section['id']}",
            json={
                "settings": [
                    {"field_key": "main_title", "field_value": "a" * 41, "value_type": "STRING"}
                ]
            },
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_update_section_not_found(self, client: AsyncClient, auth_headers: dict):
        import uuid
        resp = await client.patch(
            f"/api/v1/sections/{uuid.uuid4()}",
            json={"label": "x"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_update_upserts_existing_setting(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        # 첫 번째 저장
        await client.patch(
            f"/api/v1/sections/{test_section['id']}",
            json={"settings": [{"field_key": "main_title", "field_value": "처음", "value_type": "STRING"}]},
            headers=auth_headers,
        )
        # 두 번째 저장 (upsert)
        resp = await client.patch(
            f"/api/v1/sections/{test_section['id']}",
            json={"settings": [{"field_key": "main_title", "field_value": "업데이트", "value_type": "STRING"}]},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        settings = {s["field_key"]: s["field_value"] for s in resp.json()["data"]["settings"]}
        assert settings["main_title"] == "업데이트"


class TestReorderSections:
    async def test_reorder_sections(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        resp = await client.patch(
            "/api/v1/sections/order",
            json={"sections": [{"id": test_section["id"], "display_order": 5}]},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    async def test_reorder_unauthenticated(self, client: AsyncClient, test_section: dict):
        resp = await client.patch(
            "/api/v1/sections/order",
            json={"sections": [{"id": test_section["id"], "display_order": 5}]},
        )
        assert resp.status_code == 401


class TestToggleSection:
    async def test_toggle_section(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        # 현재 is_active=True → toggle → False
        resp = await client.patch(
            f"/api/v1/sections/{test_section['id']}/toggle",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["is_active"] is False

        # 다시 toggle → True
        resp2 = await client.patch(
            f"/api/v1/sections/{test_section['id']}/toggle",
            headers=auth_headers,
        )
        assert resp2.status_code == 200
        assert resp2.json()["data"]["is_active"] is True

    async def test_toggle_not_found(self, client: AsyncClient, auth_headers: dict):
        resp = await client.patch(
            f"/api/v1/sections/{uuid.uuid4()}/toggle",
            headers=auth_headers,
        )
        assert resp.status_code == 404


class TestSectionStructure:
    async def test_section_response_has_required_fields(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        resp = await client.get(
            f"/api/v1/sections/{test_section['id']}", headers=auth_headers
        )
        data = resp.json()["data"]
        for field in ("id", "section_type", "label", "display_order", "is_active", "settings"):
            assert field in data

    async def test_list_sections_cached_second_call(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        r1 = await client.get("/api/v1/sections", headers=auth_headers)
        r2 = await client.get("/api/v1/sections", headers=auth_headers)
        assert r1.status_code == 200
        assert r2.status_code == 200
        ids1 = [s["id"] for s in r1.json()["data"]]
        ids2 = [s["id"] for s in r2.json()["data"]]
        assert ids1 == ids2

    async def test_update_invalidates_cache(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        await client.patch(
            f"/api/v1/sections/{test_section['id']}",
            json={"label": "캐시 무효화 테스트"},
            headers=auth_headers,
        )
        resp = await client.get("/api/v1/sections", headers=auth_headers)
        labels = [s["label"] for s in resp.json()["data"]]
        assert "캐시 무효화 테스트" in labels

    async def test_reorder_changes_display_order(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        await client.patch(
            "/api/v1/sections/order",
            json={"sections": [{"id": test_section["id"], "display_order": 99}]},
            headers=auth_headers,
        )
        resp = await client.get(
            f"/api/v1/sections/{test_section['id']}", headers=auth_headers
        )
        assert resp.json()["data"]["display_order"] == 99

    async def test_update_section_unauthenticated(
        self, client: AsyncClient, test_section: dict
    ):
        resp = await client.patch(
            f"/api/v1/sections/{test_section['id']}",
            json={"label": "무단 수정"},
        )
        assert resp.status_code == 401


class TestSectionFieldLimits:
    """sub_copy 80 · cta_text 20 · cta_url 200 서버 검사 (T-127)."""

    @staticmethod
    def _body(key: str, value: str) -> dict:
        return {"settings": [{"field_key": key, "field_value": value}]}

    @pytest.mark.parametrize(
        ("key", "ok", "over"),
        [
            ("sub_copy", "a" * 80, "a" * 81),
            ("cta_text", "a" * 20, "a" * 21),
            ("cta_url", "/" + "a" * 199, "/" + "a" * 200),
        ],
    )
    async def test_limits(self, client, auth_headers, test_section, key, ok, over):
        url = f"/api/v1/sections/{test_section['id']}"
        good = await client.patch(url, headers=auth_headers, json=self._body(key, ok))
        assert good.status_code == 200
        bad = await client.patch(url, headers=auth_headers, json=self._body(key, over))
        assert bad.status_code == 400

    async def test_old_long_value_saves_when_unchanged(
        self, client, auth_headers, test_section
    ):
        """한도 전에 저장된 긴 글 — 다른 칸을 고칠 때 저장이 막히지 않는다."""
        long_copy = "a" * 120
        async with _TestSession() as s:
            await s.execute(text("SELECT set_config('app.is_super_admin','true',false)"))
            await s.execute(
                text(
                    "INSERT INTO section_settings"
                    " (id, tenant_id, section_id, field_key, field_value, value_type)"
                    " VALUES (gen_random_uuid(), :t, :s, 'sub_copy', :v, 'STRING')"
                ),
                {"t": test_section["tenant_id"], "s": test_section["id"], "v": long_copy},
            )
            await s.commit()
        url = f"/api/v1/sections/{test_section['id']}"
        same = {
            "settings": [
                {"field_key": "sub_copy", "field_value": long_copy},
                {"field_key": "cta_text", "field_value": "상담"},
            ]
        }
        assert (await client.patch(url, headers=auth_headers, json=same)).status_code == 200
        changed = self._body("sub_copy", "b" * 120)
        assert (await client.patch(url, headers=auth_headers, json=changed)).status_code == 400
