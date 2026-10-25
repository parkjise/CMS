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
