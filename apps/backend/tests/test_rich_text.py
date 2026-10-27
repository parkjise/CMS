"""서식 있는 글(RICH_TEXT) — 미니 툴바 저장 · XSS 차단 (기획서 12.2, T-065-A)."""

import pytest
from httpx import AsyncClient

from app.services.rich_text import (
    RichTextError,
    accepts_rich_text,
    normalize_rich_text,
    rich_text_length,
    sanitize_rich_text,
    to_plain_text,
)

_BATCH = "/api/v1/edit/batch-save"


class TestSanitize:
    def test_keeps_allowed_formatting(self):
        value = "<b>굵게</b> <i>기울임</i> <strong>s</strong> <em>e</em>줄<br>바꿈"
        assert sanitize_rich_text(value) == value

    def test_keeps_theme_classes(self):
        value = '<span class="rt-c-primary">색</span><span class="rt-s-lg">큰</span>'
        assert sanitize_rich_text(value) == value

    def test_link_opens_new_window_with_noopener(self):
        out = sanitize_rich_text('<a href="https://example.com">사이트</a>')
        assert 'href="https://example.com"' in out
        assert 'target="_blank"' in out
        assert "noopener" in out

    @pytest.mark.parametrize(
        "href", ["tel:010-1234-5678", "mailto:a@example.com", "/about"]
    )
    def test_safe_link_targets_kept(self, href: str):
        assert f'href="{href}"' in sanitize_rich_text(f'<a href="{href}">x</a>')

    @pytest.mark.parametrize(
        "payload",
        [
            "<script>alert(1)</script>",
            "<img src=x onerror=alert(1)>",
            "<svg onload=alert(1)><script>1</script></svg>",
            "<iframe src=https://evil.example></iframe>",
            '<a href="javascript:alert(1)">x</a>',
            '<a href="JaVaScRiPt:alert(1)">x</a>',
            '<a href="data:text/html,<script>alert(1)</script>">x</a>',
            '<a href="vbscript:msgbox(1)">x</a>',
            '<b onclick="alert(1)">x</b>',
            '<span style="background:url(javascript:alert(1))">x</span>',
            '<span class="rt-c-primary" onmouseover="alert(1)">x</span>',
            "<style>body{display:none}</style>",
            "<form action=https://evil.example><input name=pw></form>",
            "<!-- <script>alert(1)</script> -->",
            "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
        ],
    )
    def test_dangerous_markup_removed(self, payload: str):
        out = sanitize_rich_text(payload).lower()
        for marker in (
            "<script",
            "onerror",
            "onload",
            "onclick",
            "onmouseover",
            "javascript:",
            "vbscript:",
            "data:",
            "<iframe",
            "<img",
            "<style",
            "<form",
            "<input",
            "style=",
        ):
            assert marker not in out

    def test_unknown_classes_dropped(self):
        out = sanitize_rich_text('<span class="rt-c-primary evil">x</span>')
        assert out == '<span class="rt-c-primary">x</span>'

    def test_escaped_angle_brackets_stay_text(self):
        assert sanitize_rich_text("&lt;무료 상담&gt;") == "&lt;무료 상담&gt;"


class TestLength:
    def test_counts_text_not_markup(self):
        assert rich_text_length('<b>가나</b><span class="rt-c-accent">다</span>') == 3

    def test_br_and_entities_count_as_one(self):
        assert rich_text_length("a<br>b &amp; c") == 7

    def test_limit_uses_text_length(self):
        long_markup = "<b>" + "가" * 40 + "</b>"
        assert normalize_rich_text("main_title", long_markup, 40) == long_markup
        with pytest.raises(RichTextError):
            normalize_rich_text("main_title", "<b>" + "가" * 41 + "</b>", 40)

    def test_plain_text(self):
        assert to_plain_text("<b>a</b><br>&lt;b&gt;") == "a\n<b>"


class TestFieldRules:
    @pytest.mark.parametrize(
        "field", ["phone", "email", "cta_text", "bg_image_url", "gallery_items"]
    )
    def test_plain_only_fields(self, field: str):
        assert not accepts_rich_text(field)
        with pytest.raises(RichTextError):
            normalize_rich_text(field, "<b>x</b>", None)

    @pytest.mark.parametrize("field", ["main_title", "intro_text", "description"])
    def test_text_fields_accept(self, field: str):
        assert accepts_rich_text(field)


async def _settings(client: AsyncClient, headers: dict, section_id: str) -> dict:
    resp = await client.get(f"/api/v1/sections/{section_id}", headers=headers)
    assert resp.status_code == 200
    return {s["field_key"]: s for s in resp.json()["data"]["settings"]}


class TestBatchSaveRich:
    async def test_rich_saved_sanitized(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        sid = test_section["id"]
        resp = await client.post(
            _BATCH,
            headers=auth_headers,
            json={
                "changes": [
                    {
                        "section_id": sid,
                        "field": "main_title",
                        "value": "<b>환영</b><script>alert(1)</script>",
                        "format": "rich",
                    }
                ]
            },
        )
        assert resp.json()["data"]["saved_count"] == 1
        row = (await _settings(client, auth_headers, sid))["main_title"]
        assert row["field_value"] == "<b>환영</b>"
        assert row["value_type"] == "RICH_TEXT"

    async def test_plain_save_after_rich_resets_type(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        sid = test_section["id"]
        rich = {"section_id": sid, "field": "sub_title", "value": "<i>a</i>"}
        await client.post(
            _BATCH, headers=auth_headers, json={"changes": [{**rich, "format": "rich"}]}
        )
        await client.post(
            _BATCH,
            headers=auth_headers,
            json={"changes": [{**rich, "value": "<무료 상담>"}]},
        )
        row = (await _settings(client, auth_headers, sid))["sub_title"]
        # 일반 글자는 손대지 않고 그대로 — 홈페이지가 글자로 표시
        assert row["field_value"] == "<무료 상담>"
        assert row["value_type"] != "RICH_TEXT"

    async def test_rich_over_limit_fails(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        resp = await client.post(
            _BATCH,
            headers=auth_headers,
            json={
                "changes": [
                    {
                        "section_id": test_section["id"],
                        "field": "main_title",
                        "value": "<b>" + "가" * 41 + "</b>",
                        "format": "rich",
                    }
                ]
            },
        )
        assert resp.json()["data"]["failed_count"] == 1

    async def test_rich_on_plain_only_field_fails(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        resp = await client.post(
            _BATCH,
            headers=auth_headers,
            json={
                "changes": [
                    {
                        "section_id": test_section["id"],
                        "field": "phone",
                        "value": "<b>010</b>",
                        "format": "rich",
                    }
                ]
            },
        )
        assert resp.json()["data"]["failed_count"] == 1

    async def test_unknown_format_rejected(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        resp = await client.post(
            _BATCH,
            headers=auth_headers,
            json={
                "changes": [
                    {
                        "section_id": test_section["id"],
                        "field": "main_title",
                        "value": "x",
                        "format": "html",
                    }
                ]
            },
        )
        assert resp.status_code in (400, 422)


class TestAdminPatchRich:
    async def test_rich_kept_and_sanitized(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        sid = test_section["id"]
        resp = await client.patch(
            f"/api/v1/sections/{sid}",
            headers=auth_headers,
            json={
                "settings": [
                    {
                        "field_key": "main_title",
                        "field_value": '<b>제목</b><img src=x onerror="alert(1)">',
                        "value_type": "RICH_TEXT",
                    }
                ]
            },
        )
        assert resp.status_code == 200
        row = {s["field_key"]: s for s in resp.json()["data"]["settings"]}["main_title"]
        assert row["field_value"] == "<b>제목</b>"
        assert row["value_type"] == "RICH_TEXT"

    async def test_rich_title_limit_counts_text(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        sid = test_section["id"]
        ok = await client.patch(
            f"/api/v1/sections/{sid}",
            headers=auth_headers,
            json={
                "settings": [
                    {
                        "field_key": "main_title",
                        "field_value": (
                            '<span class="rt-c-primary">' + "가" * 40 + "</span>"
                        ),
                        "value_type": "RICH_TEXT",
                    }
                ]
            },
        )
        assert ok.status_code == 200
        too_long = await client.patch(
            f"/api/v1/sections/{sid}",
            headers=auth_headers,
            json={
                "settings": [
                    {
                        "field_key": "main_title",
                        "field_value": "<b>" + "가" * 41 + "</b>",
                        "value_type": "RICH_TEXT",
                    }
                ]
            },
        )
        assert too_long.status_code == 400
