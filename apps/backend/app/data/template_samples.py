"""코드형 템플릿 샘플 콘텐츠 원본 (기획서 11.8, T-120).

app/data/templates/{code}.json 은 클라이언트
apps/client/templates/{key}/sample-content.json 과 같은 내용이어야 한다
(tests/test_seed_templates.py 가 비교).
시드가 이 값을 templates.sample_content 로 동기화한다.
"""

import json
from functools import lru_cache
from pathlib import Path

_DIR = Path(__file__).resolve().parent / "templates"


@lru_cache
def load_sample(code: str) -> dict:
    """템플릿 코드의 샘플 콘텐츠. 파일이 없으면 빈 dict."""
    path = _DIR / f"{code}.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache
def load_menu(code: str) -> list[dict]:
    """코드형 템플릿 메뉴 페이지 [{key, title, parent?}] (T-036-B · T-223).

    app/data/templates/{code}.menu.json — 클라이언트 templates/{key}/manifest.ts 의
    menu: 'gnb' 페이지(parent 없음)와 그 아래 menu: 'sub' 페이지(parent)가 같은 순서 ·
    이름이어야 한다 (클라이언트 테스트가 비교). 상단 메뉴 기본값은 parent 없는 것만.
    """
    path = _DIR / f"{code}.menu.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def template_pages(code: str) -> list[dict]:
    """코드형 템플릿의 모든 페이지 [{key, title, parent?}] — 홈 · 메뉴 · 샘플 순.

    메뉴에 없는 페이지(샘플에만 있는 것)는 이름 대신 주소를 쓴다.
    """
    pages = [{"key": "home", "title": "홈"}, *load_menu(code)]
    known = {p["key"] for p in pages}
    sample_pages = load_sample(code).get("pages") or {}
    pages += [{"key": key, "title": key} for key in sample_pages if key not in known]
    return pages
