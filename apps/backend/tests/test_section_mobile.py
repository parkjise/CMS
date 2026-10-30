"""섹션 모바일 설정 (T-037-D) — 휴대폰에서 숨기기 · 휴대폰용 배경 이미지."""

from httpx import AsyncClient


def _settings(resp) -> dict:
    return {s["field_key"]: s for s in resp.json()["data"]["settings"]}


async def _save(client, headers, section_id, settings):
    return await client.patch(
        f"/api/v1/sections/{section_id}",
        json={"settings": settings},
        headers=headers,
    )


class TestMobileSettings:
    async def test_mobile_hidden_normalized(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        resp = await _save(
            client,
            auth_headers,
            test_section["id"],
            [{"field_key": "mobile_hidden", "field_value": " ON "}],
        )
        assert resp.status_code == 200, resp.text
        row = _settings(resp)["mobile_hidden"]
        assert row["field_value"] == "true"
        assert row["value_type"] == "BOOLEAN"

        off = await _save(
            client,
            auth_headers,
            test_section["id"],
            [{"field_key": "mobile_hidden", "field_value": ""}],
        )
        assert _settings(off)["mobile_hidden"]["field_value"] == "false"

    async def test_mobile_hidden_rejects_other_values(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        resp = await _save(
            client,
            auth_headers,
            test_section["id"],
            [{"field_key": "mobile_hidden", "field_value": "maybe"}],
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    async def test_mobile_image_url_saved_and_checked(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        ok = await _save(
            client,
            auth_headers,
            test_section["id"],
            [{"field_key": "mobile_image_url", "field_value": "https://cdn/m.webp"}],
        )
        assert ok.status_code == 200
        assert _settings(ok)["mobile_image_url"]["field_value"] == "https://cdn/m.webp"
        bad = await _save(
            client,
            auth_headers,
            test_section["id"],
            [{"field_key": "mobile_image_url", "field_value": "javascript:alert(1)"}],
        )
        assert bad.status_code == 400

    async def test_public_site_exposes_mobile_settings(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_section: dict,
        test_tenant: dict,
    ):
        await _save(
            client,
            auth_headers,
            test_section["id"],
            [
                {"field_key": "mobile_hidden", "field_value": "true"},
                {"field_key": "mobile_image_url", "field_value": "/m.webp"},
            ],
        )
        pub = await client.get(f"/api/public/site/{test_tenant['slug']}")
        section = next(
            s for s in pub.json()["data"]["sections"] if s["id"] == test_section["id"]
        )
        keys = {s["field_key"]: s["field_value"] for s in section["settings"]}
        assert keys["mobile_hidden"] == "true"
        assert keys["mobile_image_url"] == "/m.webp"
