"""템플릿 샘플 이미지 공용 스토리지 (기획서 11.8, T-120).

- 샘플 이미지는 공용 경로 `templates/{key}/{version}/…` 에 한 번 올리고
  모든 테넌트가 같은 URL 을 참조한다 (scripts/upload_template_assets.py)
- 샘플 JSON 의 주소는 `/templates/…` 상대 주소. 샘플을 테넌트 섹션으로 복사할 때
  TEMPLATE_ASSET_BASE_URL 이 있으면 공용 스토리지 주소로 바꾼다
- 공용 원본은 수정 · 삭제 불가 — 스토리지 쓰기 · 삭제 전에 is_protected_key 로 막는다
"""

from typing import Any

from app.core.config import settings

TEMPLATE_KEY_PREFIX = "templates/"
_SAMPLE_PATH_PREFIX = "/" + TEMPLATE_KEY_PREFIX


class ProtectedAssetError(Exception):
    """공용 템플릿 원본을 덮어쓰거나 지우려 할 때."""


def is_protected_key(key: str) -> bool:
    """스토리지 키가 공용 템플릿 원본 경로인지 (선행 슬래시 · ./ 무시)."""
    normalized = key.lstrip("/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized.startswith(TEMPLATE_KEY_PREFIX)


def ensure_writable(key: str) -> None:
    if is_protected_key(key):
        raise ProtectedAssetError(
            f"공용 템플릿 원본은 수정 · 삭제할 수 없습니다: {key}"
        )


def resolve_sample_url(value: str) -> str:
    """`/templates/…` 샘플 주소 → 공용 스토리지 주소 (설정이 없으면 그대로)."""
    base = settings.template_asset_base_url.rstrip("/")
    if not base or not value.startswith(_SAMPLE_PATH_PREFIX):
        return value
    return f"{base}{value}"


def resolve_sample_value(value: Any) -> Any:
    """설정 값 안의 샘플 주소를 모두 바꾼다 (목록 · 객체 재귀)."""
    if isinstance(value, str):
        return resolve_sample_url(value)
    if isinstance(value, list):
        return [resolve_sample_value(v) for v in value]
    if isinstance(value, dict):
        return {k: resolve_sample_value(v) for k, v in value.items()}
    return value
