"""갤러리 섹션 이미지 목록 설정 (T-064-A).

GALLERY 섹션은 section_settings.gallery_items 에 `[{image_url, caption}]` JSON 을 둔다.
홈페이지 편집 모드(POST /edit/batch-save)와 관리자 폼(PATCH /sections/{id}) 둘 다
저장 전에 `normalize_gallery_items()` 로 검사 · 정리한다.
"""

import json
from typing import Any

GALLERY_FIELD = "gallery_items"
GALLERY_VALUE_TYPE = "JSON"
MAX_ITEMS = 30
CAPTION_MAX_LENGTH = 100
URL_MAX_LENGTH = 500

MSG_INVALID_JSON = "갤러리 이미지 목록 형식이 올바르지 않습니다."
MSG_TOO_MANY = f"갤러리 이미지는 최대 {MAX_ITEMS}장까지 등록할 수 있습니다."
MSG_INVALID_URL = "올바른 이미지 주소가 아닙니다."
MSG_CAPTION_TOO_LONG = f"캡션은 {CAPTION_MAX_LENGTH}자 이하로 입력해주세요."


class GallerySettingError(ValueError):
    """gallery_items 값 검증 실패 — 메시지는 사용자 노출용."""


def _is_safe_url(url: str) -> bool:
    # http(s) 절대 주소 또는 같은 사이트 경로만 — javascript: · data: · //외부 차단
    if url.startswith(("https://", "http://")):
        return True
    return url.startswith("/") and not url.startswith("//")


def _clean_item(item: Any) -> dict[str, str]:
    if not isinstance(item, dict):
        raise GallerySettingError(MSG_INVALID_JSON)
    url = item.get("image_url")
    caption = item.get("caption") or ""
    if not isinstance(url, str) or not isinstance(caption, str):
        raise GallerySettingError(MSG_INVALID_JSON)
    url = url.strip()
    if not url or len(url) > URL_MAX_LENGTH or not _is_safe_url(url):
        raise GallerySettingError(MSG_INVALID_URL)
    caption = caption.strip()
    if len(caption) > CAPTION_MAX_LENGTH:
        raise GallerySettingError(MSG_CAPTION_TOO_LONG)
    return {"image_url": url, "caption": caption}


def normalize_gallery_items(raw: str | None) -> str | None:
    """JSON 문자열을 검사해 정리된 JSON 문자열로 돌려준다 (None · "" 은 그대로).

    알 수 없는 키는 버리고 image_url · caption 만 남긴다.
    """
    if raw is None or raw == "":
        return raw
    try:
        items = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise GallerySettingError(MSG_INVALID_JSON) from exc
    if not isinstance(items, list):
        raise GallerySettingError(MSG_INVALID_JSON)
    if len(items) > MAX_ITEMS:
        raise GallerySettingError(MSG_TOO_MANY)
    return json.dumps([_clean_item(i) for i in items], ensure_ascii=False)
