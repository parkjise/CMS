"""글 본문 허용 목록 검사 (T-143)."""

import pytest

from app.schemas.rich_body import (
    MAX_TEXT,
    MAX_TOP_NODES,
    clean_body,
    first_image,
)


def para(*content, **attrs):
    node = {"type": "paragraph", "content": list(content)}
    return {**node, "attrs": attrs} if attrs else node


def text(value="글", *marks):
    node = {"type": "text", "text": value}
    return {**node, "marks": list(marks)} if marks else node


class TestAllowed:
    def test_every_format_round_trips(self):
        body = [
            {
                "type": "heading",
                "attrs": {"level": 2, "textAlign": "center"},
                "content": [text("제목")],
            },
            para(
                text("굵게", {"type": "bold"}),
                text("기울임", {"type": "italic"}),
                text("밑줄", {"type": "underline"}),
                text("취소", {"type": "strike"}),
                text("색", {"type": "textStyle", "attrs": {"color": "#ff0000"}}),
                {"type": "hardBreak"},
                text(
                    "링크",
                    {"type": "link", "attrs": {"href": "https://example.com"}},
                ),
                textAlign="right",
            ),
            {
                "type": "bulletList",
                "content": [{"type": "listItem", "content": [para(text())]}],
            },
            {
                "type": "orderedList",
                "attrs": {"start": 3},
                "content": [{"type": "listItem", "content": [para(text())]}],
            },
            {"type": "blockquote", "content": [para(text())]},
            {"type": "horizontalRule"},
            {"type": "image", "attrs": {"src": "/a.webp", "alt": "설명"}},
            {
                "type": "table",
                "content": [
                    {
                        "type": "tableRow",
                        "content": [
                            {
                                "type": "tableHeader",
                                "attrs": {"colspan": 2},
                                "content": [para(text())],
                            },
                            {"type": "tableCell", "content": [para(text())]},
                        ],
                    }
                ],
            },
        ]
        assert clean_body(body) == body

    def test_unknown_attrs_dropped(self):
        node = para(text("글"), textAlign=None, onclick="x", style="position:fixed")
        assert clean_body([node]) == [{"type": "paragraph", "content": [text("글")]}]

    def test_link_keeps_only_href(self):
        link = {
            "type": "link",
            "attrs": {"href": "/a", "target": "_blank", "class": "x", "rel": "y"},
        }
        cleaned = clean_body([para(text("글", link))])
        assert cleaned[0]["content"][0]["marks"] == [
            {"type": "link", "attrs": {"href": "/a"}}
        ]

    def test_empty_paragraph_allowed(self):
        assert clean_body([{"type": "paragraph"}]) == [{"type": "paragraph"}]

    def test_invalid_color_dropped_text_kept(self):
        mark = {"type": "textStyle", "attrs": {"color": "red;background:url(x)"}}
        assert clean_body([para(text("글", mark))]) == [para(text("글"))]

    @pytest.mark.parametrize(
        "legacy",
        [
            {"type": "p", "text": "**굵게**"},
            {"type": "ul", "items": ["하나"]},
            {"type": "image", "src": "/a.webp", "alt": ""},
        ],
    )
    def test_legacy_blocks_still_accepted(self, legacy):
        assert clean_body([legacy]) == [legacy]


class TestRejected:
    @pytest.mark.parametrize(
        "node",
        [
            {"type": "script"},
            {"type": "iframe", "attrs": {"src": "https://evil"}},
            {"type": "codeBlock"},
            {"type": "listItem"},
            {"type": "text", "text": "최상위 글자"},
            "문자열",
            para({"type": "image", "attrs": {"src": "/a"}}),
            para(text("글", {"type": "code"})),
            {"type": "heading", "attrs": {"level": 1}},
            {"type": "heading"},
            {"type": "bulletList", "content": [para(text())]},
            {"type": "table", "content": [para(text())]},
            {"type": "paragraph", "content": "글자"},
        ],
    )
    def test_invalid_structure(self, node):
        with pytest.raises(ValueError):
            clean_body([node])

    @pytest.mark.parametrize(
        "href",
        [
            "javascript:alert(1)",
            "JaVaScRiPt:alert(1)",
            "data:text/html,x",
            "//evil.example",
            "vbscript:x",
            " javascript:alert(1)",
            None,
        ],
    )
    def test_dangerous_link(self, href):
        mark = {"type": "link", "attrs": {"href": href}}
        with pytest.raises(ValueError, match="링크"):
            clean_body([para(text("글", mark))])

    @pytest.mark.parametrize(
        "src",
        ["javascript:alert(1)", "data:image/png;base64,AAAA", "//evil/a.png", None],
    )
    def test_dangerous_image(self, src):
        with pytest.raises(ValueError, match="사진"):
            clean_body([{"type": "image", "attrs": {"src": src}}])

    def test_legacy_dangerous_image(self):
        with pytest.raises(ValueError, match="사진"):
            clean_body([{"type": "image", "src": "javascript:alert(1)"}])

    def test_limits(self):
        with pytest.raises(ValueError, match="너무"):
            clean_body([{"type": "paragraph"}] * (MAX_TOP_NODES + 1))
        with pytest.raises(ValueError, match="너무"):
            clean_body([para(text("x" * (MAX_TEXT + 1)))])

    def test_depth_limit(self):
        node: dict = para(text())
        for _ in range(20):
            node = {"type": "blockquote", "content": [node]}
        with pytest.raises(ValueError):
            clean_body([node])


class TestFirstImage:
    def test_new_and_legacy(self):
        assert first_image([{"type": "image", "src": "/old"}]) == "/old"
        assert first_image([{"type": "image", "attrs": {"src": "/new"}}]) == "/new"

    def test_nested_in_order(self):
        body = [
            para(text()),
            {
                "type": "blockquote",
                "content": [{"type": "image", "attrs": {"src": "/in"}}],
            },
            {"type": "image", "attrs": {"src": "/later"}},
        ]
        assert first_image(body) == "/in"

    def test_none(self):
        assert first_image([para(text())]) is None
