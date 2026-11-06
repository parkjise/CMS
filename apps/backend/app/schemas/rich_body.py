"""글 본문 검사 (T-143, 게시판 모듈 기획서 10장 · D-11).

Tiptap 문서의 노드 목록을 받아 허용 목록대로 다시 만든다 — 모르는 노드 · 마크는 거부하고
모르는 속성은 버린다. HTML 을 저장하지 않으므로 화면은 이 값을 그대로 태그로 옮긴다.
이전 형식(p · ul · image)도 그대로 받는다 — 기존 글 · 샘플이 이 형식이다.
"""

import re
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, ValidationError, field_validator

MAX_TOP_NODES = 500
MAX_TOTAL_NODES = 5000
MAX_DEPTH = 12
MAX_TEXT = 5000
MAX_URL = 500
MAX_ALT = 200
MAX_TABLE_SPAN = 20

MSG_INVALID_BODY = "본문 형식이 올바르지 않습니다."
MSG_TOO_LONG = "본문이 너무 깁니다."
MSG_INVALID_IMAGE_URL = "사진 주소가 올바르지 않습니다."
MSG_INVALID_LINK = "링크 주소가 올바르지 않습니다."

# http(s) 또는 사이트 안 경로만 — javascript: · data: · //다른사이트 차단
SAFE_IMAGE_URL = re.compile(r"^(https?://|/(?!/))", re.IGNORECASE)
_SAFE_LINK = re.compile(r"^(https?://|mailto:|tel:|/(?!/)|#)", re.IGNORECASE)
_COLOR = re.compile(
    r"^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$",
    re.IGNORECASE,
)
_ALIGNS = frozenset({"left", "center", "right"})

_BLOCKS = frozenset(
    {
        "paragraph",
        "heading",
        "bulletList",
        "orderedList",
        "blockquote",
        "horizontalRule",
        "image",
        "table",
    }
)
_INLINE = frozenset({"text", "hardBreak"})
# 노드마다 안에 둘 수 있는 노드
_CHILDREN: dict[str, frozenset[str]] = {
    "paragraph": _INLINE,
    "heading": _INLINE,
    "bulletList": frozenset({"listItem"}),
    "orderedList": frozenset({"listItem"}),
    "listItem": _BLOCKS,
    "blockquote": _BLOCKS,
    "table": frozenset({"tableRow"}),
    "tableRow": frozenset({"tableHeader", "tableCell"}),
    "tableHeader": _BLOCKS,
    "tableCell": _BLOCKS,
    "horizontalRule": frozenset(),
    "image": frozenset(),
    "hardBreak": frozenset(),
}


class _LegacyBlock(BaseModel):
    model_config = {"extra": "forbid"}


class ParagraphBlock(_LegacyBlock):
    type: str = "p"
    text: str

    @field_validator("text")
    @classmethod
    def _text(cls, value: str) -> str:
        if len(value) > MAX_TEXT:
            raise ValueError(MSG_TOO_LONG)
        return value


class ListBlock(_LegacyBlock):
    type: str = "ul"
    items: list[str]

    @field_validator("items")
    @classmethod
    def _items(cls, value: list[str]) -> list[str]:
        if not 1 <= len(value) <= 50 or any(len(item) > 500 for item in value):
            raise ValueError(MSG_INVALID_BODY)
        return value


class ImageBlock(_LegacyBlock):
    type: str = "image"
    src: str
    alt: str = ""

    @field_validator("src")
    @classmethod
    def _src(cls, value: str) -> str:
        if not value or len(value) > MAX_URL or not SAFE_IMAGE_URL.match(value):
            raise ValueError(MSG_INVALID_IMAGE_URL)
        return value

    @field_validator("alt")
    @classmethod
    def _alt(cls, value: str) -> str:
        if len(value) > MAX_ALT:
            raise ValueError(MSG_INVALID_BODY)
        return value


def _clean_legacy(model: type[BaseModel], node: dict[str, Any]) -> dict[str, Any]:
    try:
        return model.model_validate(node).model_dump()
    except ValidationError as e:
        message = e.errors()[0]["msg"].removeprefix("Value error, ")
        allowed = (MSG_TOO_LONG, MSG_INVALID_IMAGE_URL)
        raise ValueError(message if message in allowed else MSG_INVALID_BODY) from e


def _align(attrs: dict[str, Any]) -> dict[str, Any]:
    align = attrs.get("textAlign")
    return {"textAlign": align} if align in _ALIGNS else {}


def _heading_attrs(attrs: dict[str, Any]) -> dict[str, Any]:
    if attrs.get("level") not in (2, 3):
        raise ValueError(MSG_INVALID_BODY)
    return {"level": attrs["level"], **_align(attrs)}


def _ordered_attrs(attrs: dict[str, Any]) -> dict[str, Any]:
    start = attrs.get("start")
    valid = isinstance(start, int) and not isinstance(start, bool) and start > 1
    return {"start": start} if valid else {}


def _image_attrs(attrs: dict[str, Any]) -> dict[str, Any]:
    src, alt = attrs.get("src"), attrs.get("alt") or ""
    if not isinstance(src, str) or len(src) > MAX_URL or not SAFE_IMAGE_URL.match(src):
        raise ValueError(MSG_INVALID_IMAGE_URL)
    if not isinstance(alt, str) or len(alt) > MAX_ALT:
        raise ValueError(MSG_INVALID_BODY)
    return {"src": src, "alt": alt}


def _cell_attrs(attrs: dict[str, Any]) -> dict[str, Any]:
    cleaned = {}
    for key in ("colspan", "rowspan"):
        value = attrs.get(key)
        if isinstance(value, int) and not isinstance(value, bool):
            if 1 < value <= MAX_TABLE_SPAN:
                cleaned[key] = value
    return cleaned


_ATTRS: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    "paragraph": _align,
    "heading": _heading_attrs,
    "orderedList": _ordered_attrs,
    "image": _image_attrs,
    "tableHeader": _cell_attrs,
    "tableCell": _cell_attrs,
}


def _clean_mark(mark: Any) -> dict[str, Any] | None:
    if not isinstance(mark, dict):
        raise ValueError(MSG_INVALID_BODY)
    kind = mark.get("type")
    if kind in ("bold", "italic", "underline", "strike"):
        return {"type": kind}
    raw = mark.get("attrs")
    attrs: dict[str, Any] = raw if isinstance(raw, dict) else {}
    if kind == "link":
        href = attrs.get("href")
        if (
            not isinstance(href, str)
            or len(href) > MAX_URL
            or not _SAFE_LINK.match(href)
        ):
            raise ValueError(MSG_INVALID_LINK)
        return {"type": "link", "attrs": {"href": href}}
    if kind == "textStyle":
        color = attrs.get("color")
        if isinstance(color, str) and _COLOR.match(color):
            return {"type": "textStyle", "attrs": {"color": color}}
        return None
    raise ValueError(MSG_INVALID_BODY)


def _clean_marks(raw: Any) -> list[dict[str, Any]]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError(MSG_INVALID_BODY)
    return [mark for mark in map(_clean_mark, raw) if mark]


def _clean_text(node: dict[str, Any]) -> dict[str, Any]:
    text = node.get("text")
    if not isinstance(text, str) or not text:
        raise ValueError(MSG_INVALID_BODY)
    if len(text) > MAX_TEXT:
        raise ValueError(MSG_TOO_LONG)
    marks = _clean_marks(node.get("marks"))
    return {"type": "text", "text": text, **({"marks": marks} if marks else {})}


def _clean_node(
    node: Any, allowed: frozenset[str], depth: int, seen: list[int]
) -> dict:
    if not isinstance(node, dict) or depth > MAX_DEPTH:
        raise ValueError(MSG_INVALID_BODY)
    seen[0] += 1
    if seen[0] > MAX_TOTAL_NODES:
        raise ValueError(MSG_TOO_LONG)
    kind = node.get("type")
    if kind not in allowed:
        raise ValueError(MSG_INVALID_BODY)
    if kind == "text":
        return _clean_text(node)
    children = node.get("content", [])
    if not isinstance(children, list):
        raise ValueError(MSG_INVALID_BODY)
    raw = node.get("attrs")
    rule = _ATTRS.get(kind)
    attrs = rule(raw if isinstance(raw, dict) else {}) if rule else {}
    content = [
        _clean_node(child, _CHILDREN[kind], depth + 1, seen) for child in children
    ]
    return {
        "type": kind,
        **({"attrs": attrs} if attrs else {}),
        **({"content": content} if content else {}),
    }


def clean_body(nodes: list[Any]) -> list[dict[str, Any]]:
    """저장할 본문 — 틀리면 ValueError(사용자 메시지)."""
    if len(nodes) > MAX_TOP_NODES:
        raise ValueError(MSG_TOO_LONG)
    seen = [0]
    cleaned = []
    for node in nodes:
        kind = node.get("type") if isinstance(node, dict) else None
        if kind == "p":
            cleaned.append(_clean_legacy(ParagraphBlock, node))
        elif kind == "ul":
            cleaned.append(_clean_legacy(ListBlock, node))
        elif kind == "image" and "src" in node:
            cleaned.append(_clean_legacy(ImageBlock, node))
        else:
            cleaned.append(_clean_node(node, _BLOCKS, 1, seen))
    return cleaned


def first_image(nodes: list[Any]) -> str | None:
    """본문의 첫 사진 주소 — 갤러리 썸네일. 표 · 인용 안의 사진도 찾는다."""
    for node in nodes:
        if not isinstance(node, dict):
            continue
        if node.get("type") == "image":
            src = node.get("src") or (node.get("attrs") or {}).get("src")
            if src:
                return src
        found = first_image(node.get("content") or [])
        if found:
            return found
    return None


def _plain_text(nodes: list[Any]) -> list[str]:
    parts: list[str] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        if isinstance(node.get("text"), str):
            parts.append(node["text"].replace("**", ""))
        items = node.get("items")
        if isinstance(items, list):
            parts.extend(item for item in items if isinstance(item, str))
        parts.extend(_plain_text(node.get("content") or []))
    return parts


def body_summary(nodes: list[Any], limit: int) -> str:
    """본문 앞부분 글자 — 카드형 요약. 이전 형식(p · ul)도 읽는다."""
    text = " ".join(" ".join(_plain_text(nodes)).split())
    return text if len(text) <= limit else f"{text[:limit].rstrip()}…"


def text_to_body(text: str) -> list[dict[str, Any]]:
    """홈페이지 회원 글쓰기의 글자 → 본문 (T-150-B). 빈 줄로 문단, 줄바꿈은 그대로.

    노드를 서버가 만들어 방문자가 서식 · 링크 · 사진을 넣을 수 없다.
    """
    paragraphs = [p.strip("\n") for p in text.replace("\r\n", "\n").split("\n\n")]
    body: list[dict[str, Any]] = []
    for paragraph in paragraphs:
        if not paragraph.strip():
            continue
        content: list[dict[str, Any]] = []
        for index, line in enumerate(paragraph.split("\n")):
            if index:
                content.append({"type": "hardBreak"})
            if line:
                content.append({"type": "text", "text": line})
        body.append({"type": "paragraph", "content": content})
    return body


def body_to_text(nodes: list[Any]) -> str:
    """회원 글 고치기 화면의 글자 — text_to_body 의 반대."""
    paragraphs: list[str] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        parts: list[str] = []
        for child in node.get("content") or []:
            if not isinstance(child, dict):
                continue
            if child.get("type") == "hardBreak":
                parts.append("\n")
            elif isinstance(child.get("text"), str):
                parts.append(child["text"])
        if not parts:
            parts = _plain_text([node])
        paragraphs.append("".join(parts))
    return "\n\n".join(paragraphs)
