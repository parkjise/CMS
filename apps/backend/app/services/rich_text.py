"""서식 있는 글(RICH_TEXT) 정리 — 인라인 편집 미니 툴바 (기획서 12.2, T-065-A).

허용 목록 밖은 모두 지운다: 굵게 · 기울임 · 줄바꿈 · 링크 · 테마 색 / 크기 클래스만.
색과 크기는 인라인 style 대신 정해진 클래스 — 템플릿 테마를 따르고 임의 CSS 를 막는다.
"""

import html
import re

import nh3

RICH_TEXT_VALUE_TYPE = "RICH_TEXT"

# 홈페이지 apps/client/lib/richText.ts 와 같은 목록
COLOR_CLASSES = frozenset({"rt-c-primary", "rt-c-accent", "rt-c-muted"})
SIZE_CLASSES = frozenset({"rt-s-sm", "rt-s-lg"})

_TAGS = {"b", "strong", "i", "em", "br", "a", "span"}
_URL_SCHEMES = {"http", "https", "mailto", "tel"}
_BR = re.compile(r"<br\s*/?>", re.IGNORECASE)

# 서식을 받지 않는 칸 — 주소 · 연락처 · 버튼처럼 글자 그대로여야 하는 값
_PLAIN_ONLY_FIELDS = frozenset({"phone", "email", "button_text", "cta_text"})


class RichTextError(ValueError):
    pass


def accepts_rich_text(field: str) -> bool:
    if field in _PLAIN_ONLY_FIELDS:
        return False
    return not (field.endswith("_url") or "image" in field or field.endswith("_items"))


def sanitize_rich_text(value: str) -> str:
    """허용 태그 · 속성만 남긴 HTML. 링크는 새 창 + noopener."""
    return nh3.clean(
        value,
        tags=_TAGS,
        attributes={"a": {"href"}},
        allowed_classes={"span": set(COLOR_CLASSES | SIZE_CLASSES)},
        url_schemes=_URL_SCHEMES,
        link_rel="noopener noreferrer nofollow",
        set_tag_attribute_values={"a": {"target": "_blank"}},
        strip_comments=True,
    ).strip()


def rich_text_length(value: str) -> int:
    """글자 수 한도용 — 태그를 뺀 실제 글자 수 (줄바꿈은 1자)."""
    text = nh3.clean(_BR.sub("\n", value), tags=set())
    return len(html.unescape(text))


def to_plain_text(value: str) -> str:
    """서식을 뺀 글자 — 검색 · SEO · AI 처럼 글자만 필요한 곳."""
    return html.unescape(nh3.clean(_BR.sub("\n", value), tags=set()))


def normalize_rich_text(field: str, value: str, limit: int | None) -> str:
    if not accepts_rich_text(field):
        raise RichTextError(f"{field}은(는) 서식을 쓸 수 없습니다.")
    cleaned = sanitize_rich_text(value)
    if limit is not None and rich_text_length(cleaned) > limit:
        raise RichTextError(f"{field}은(는) {limit}자 이하여야 합니다.")
    return cleaned
