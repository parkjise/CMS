"""목록 칸 안의 주소 검사 (T-037-E) — 슬라이드 · 카드 링크 등."""

import json

import pytest
from httpx import AsyncClient

from app.services.link_settings import LinkUrlError, validate_nested_urls


class TestValidateNestedUrls:
    def test_safe_lists_pass(self):
        cards = [
            {"title": "a", "image_url": "/a.jpg", "link_url": "https://x.kr"},
            {"title": "b", "image_url": "", "link_url": "#consult"},
        ]
        validate_nested_urls("cards", json.dumps(cards))
        # 목록 안의 목록 (연혁 월별) · 글자 목록
        years = [{"year": "2020", "months": [{"image_url": "/m.jpg"}]}]
        validate_nested_urls("years", json.dumps(years))
        validate_nested_urls("values", json.dumps(["정성", "신뢰"]))

    def test_not_json_or_not_list_is_ignored(self):
        validate_nested_urls("title", "javascript:alert(1)")  # 목록 아님
        validate_nested_urls("slides", "[깨진 json")
        validate_nested_urls("slides", None)

    @pytest.mark.parametrize(
        "bad",
        ["javascript:alert(1)", "data:text/html,x", "//evil.com/x", "https://a b"],
    )
    def test_bad_url_in_item(self, bad):
        cards = [{"link_url": "/ok"}, {"title": "두 번째", "link_url": bad}]
        with pytest.raises(LinkUrlError, match="cards 2번째 항목"):
            validate_nested_urls("cards", json.dumps(cards))

    def test_bad_url_in_nested_list(self):
        years = [{"months": [{"image_url": "/ok"}, {"image_url": "javascript:x"}]}]
        with pytest.raises(LinkUrlError, match="2번째 항목"):
            validate_nested_urls("years", json.dumps(years))


class TestNestedUrlsApi:
    async def test_admin_save_rejects_bad_slide_link(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        slides = [
            {"image_url": "/s1.jpg", "title": "1"},
            {"image_url": "javascript:alert(1)", "title": "2"},
        ]
        resp = await client.patch(
            f"/api/v1/sections/{test_section['id']}",
            json={
                "settings": [
                    {
                        "field_key": "slides",
                        "field_value": json.dumps(slides),
                        "value_type": "JSON",
                    }
                ]
            },
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "slides 2번째 항목" in resp.json()["error"]["message"]

    async def test_admin_save_keeps_good_list_as_is(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        value = json.dumps([{"image_url": "/s1.jpg", "mobile_image_url": "/m1.jpg"}])
        resp = await client.patch(
            f"/api/v1/sections/{test_section['id']}",
            json={
                "settings": [
                    {"field_key": "slides", "field_value": value, "value_type": "JSON"}
                ]
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        saved = {s["field_key"]: s for s in resp.json()["data"]["settings"]}
        assert json.loads(saved["slides"]["field_value"]) == json.loads(value)
