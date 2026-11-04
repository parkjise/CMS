"""글자 수 한도가 정해진 섹션 칸 (기획서 5.3, T-127).

관리자 저장 · 편집 모드 저장이 같은 한도를 쓴다. 한도가 생기기 전에 저장된 긴 글은
그 칸을 바꿀 때만 검사한다 — 안 그러면 다른 칸을 고칠 때도 저장이 막힌다.
"""

FIELD_MAX_LENGTHS: dict[str, int] = {
    "sub_copy": 80,
    "cta_text": 20,
    "cta_url": 200,
}


def changed_field_limit(
    field: str, value: str | None, current: str | None
) -> int | None:
    """값이 바뀐 칸의 글자 수 한도 — 한도가 없거나 그대로면 None."""
    return FIELD_MAX_LENGTHS.get(field) if value != current else None


def check_field_length(field: str, value: str | None, current: str | None) -> None:
    limit = changed_field_limit(field, value, current)
    if limit is not None and value is not None and len(value) > limit:
        raise ValueError(f"{field}은(는) {limit}자 이하여야 합니다.")
