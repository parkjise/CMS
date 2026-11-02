"""주소 칸(`*_url`) 검사 — 편집 모드 버튼 팝업 · 관리자 저장 공통.

기획서 12.4, T-065-B. 버튼 링크 · 이미지 주소가 `javascript:` 같은 주소로
저장되면 방문자 화면에서 실행될 수 있다.
허용: http(s) · 메일 · 전화 · 사이트 안 경로(`/about`) · 같은 페이지 위치(`#문의`),
빈 값. 주소 안의 공백 · 꺾쇠 · 따옴표는 거절한다.
"""

import json
import re
from typing import Any

_C = r"[^\s<>\"'`]"  # 공백 · 꺾쇠 · 따옴표 제외
_SAFE_URL = re.compile(
    rf"^(https?://{_C}+|mailto:{_C}+|tel:[0-9+\-() ]+|/(?!/){_C}*|#{_C}*)$"
)
URL_MAX_LEN = 500


class LinkUrlError(ValueError):
    pass


def is_url_field(field: str) -> bool:
    return field.endswith("_url")


def validate_link_url(field: str, value: str | None) -> str | None:
    """앞뒤 공백을 지운 주소 — 허용 형식이 아니면 LinkUrlError."""
    if value is None:
        return None
    url = value.strip()
    if url == "":
        return ""
    if len(url) > URL_MAX_LEN:
        raise LinkUrlError(f"{field} 주소는 {URL_MAX_LEN}자 이하여야 합니다.")
    if not _SAFE_URL.match(url):
        raise LinkUrlError(
            f"{field} 주소는 https:// · tel: · mailto: · / 로 시작해야 합니다."
        )
    return url


def _walk_urls(field: str, data: Any, where: str) -> None:
    if isinstance(data, list):
        for i, item in enumerate(data, start=1):
            _walk_urls(field, item, f"{where} {i}번째 항목")
    elif isinstance(data, dict):
        for key, val in data.items():
            if isinstance(val, str) and is_url_field(str(key)):
                try:
                    validate_link_url(str(key), val)
                except LinkUrlError as exc:
                    raise LinkUrlError(f"{where.strip()}: {exc}") from exc
            elif isinstance(val, (list, dict)):
                _walk_urls(field, val, where)


def validate_nested_urls(field: str, value: str | None) -> None:
    """목록 칸(JSON) 안의 `*_url` 값 검사 — 슬라이드 · 카드 링크 등 (T-037-E).

    맨 바깥 칸만 검사하던 때는 목록 안에 javascript: 주소를 넣을 수 있었다.
    JSON 목록이 아니면 아무것도 하지 않는다 (다른 검사에 맡김).
    """
    text = (value or "").strip()
    if not text.startswith("["):
        return
    try:
        data = json.loads(text)
    except ValueError:
        return
    _walk_urls(field, data, field)
