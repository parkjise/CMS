"""주소 칸(`*_url`) 검사 — 버튼 링크 팝업 · 관리자 저장 (기획서 12.4, T-065-B)."""

import pytest
from httpx import AsyncClient

from app.services.link_settings import LinkUrlError, is_url_field, validate_link_url

_BATCH = "/api/v1/edit/batch-save"


class TestValidateLinkUrl:
    @pytest.mark.parametrize(
        "url",
        [
            "https://example.com/booking?x=1",
            "http://localhost:9000/cms-images/a.webp",
            "tel:010-1234-5678",
            "tel:+82 2-123-4567",
            "mailto:hello@example.com",
            "/about",
            "/templates/hospital-a/1.0.0/a.jpg",
            "#contact",
            "#",
        ],
    )
    def test_allowed(self, url: str):
        assert validate_link_url("cta_url", url) == url

    def test_trims_and_allows_empty(self):
        assert validate_link_url("cta_url", "  https://a.com  ") == "https://a.com"
        assert validate_link_url("cta_url", "   ") == ""
        assert validate_link_url("cta_url", None) is None

    @pytest.mark.parametrize(
        "url",
        [
            "javascript:alert(1)",
            "JavaScript:alert(1)",
            " javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "vbscript:msgbox(1)",
            "//evil.example",
            "example.com",
            "https://a.com/<script>",
            "https://a.com/ x",
            "tel:010<script>",
            "https://" + "a" * 500,
        ],
    )
    def test_blocked(self, url: str):
        with pytest.raises(LinkUrlError):
            validate_link_url("cta_url", url)

    def test_url_fields(self):
        assert is_url_field("cta_url")
        assert is_url_field("bg_image_url")
        assert not is_url_field("cta_text")


class TestBatchSaveUrl:
    async def test_button_text_and_link_saved(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        sid = test_section["id"]
        resp = await client.post(
            _BATCH,
            headers=auth_headers,
            json={
                "changes": [
                    {"section_id": sid, "field": "cta_text", "value": "상담 예약"},
                    {
                        "section_id": sid,
                        "field": "cta_url",
                        "value": " tel:02-123-4567 ",
                    },
                ]
            },
        )
        assert resp.json()["data"]["saved_count"] == 2
        got = await client.get(f"/api/v1/sections/{sid}", headers=auth_headers)
        values = {
            s["field_key"]: s["field_value"] for s in got.json()["data"]["settings"]
        }
        assert values["cta_url"] == "tel:02-123-4567"
        assert values["cta_text"] == "상담 예약"

    async def test_dangerous_link_not_saved(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        resp = await client.post(
            _BATCH,
            headers=auth_headers,
            json={
                "changes": [
                    {
                        "section_id": test_section["id"],
                        "field": "cta_url",
                        "value": "javascript:alert(1)",
                    }
                ]
            },
        )
        data = resp.json()["data"]
        assert data["saved_count"] == 0
        assert data["failed_count"] == 1


class TestAdminPatchUrl:
    async def test_dangerous_link_rejected(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        resp = await client.patch(
            f"/api/v1/sections/{test_section['id']}",
            headers=auth_headers,
            json={
                "settings": [
                    {
                        "field_key": "cta_url",
                        "field_value": "javascript:alert(1)",
                        "value_type": "URL",
                    }
                ]
            },
        )
        assert resp.status_code == 400

    async def test_safe_link_saved(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        resp = await client.patch(
            f"/api/v1/sections/{test_section['id']}",
            headers=auth_headers,
            json={
                "settings": [
                    {
                        "field_key": "cta_url",
                        "field_value": "/contact",
                        "value_type": "URL",
                    }
                ]
            },
        )
        assert resp.status_code == 200
