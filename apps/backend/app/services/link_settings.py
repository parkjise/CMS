"""주소 칸(`*_url`) 검사 — 편집 모드 버튼 팝업 · 관리자 저장 공통.

기획서 12.4, T-065-B. 버튼 링크 · 이미지 주소가 `javascript:` 같은 주소로
저장되면 방문자 화면에서 실행될 수 있다.
허용: http(s) · 메일 · 전화 · 사이트 안 경로(`/about`) · 같은 페이지 위치(`#문의`),
빈 값. 주소 안의 공백 · 꺾쇠 · 따옴표는 거절한다.
"""

import re

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
