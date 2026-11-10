"""새 게시판 유형별 추천 칸 (T-183, 게시판 모듈 기획서 BM-02 · 7장).

게시판을 만들 때 고른 추천 칸을 같은 커밋으로 만든다. 정의는 서버에만 두고
관리자 화면은 GET /boards/presets 로 받는다. 회원 · 비회원 글쓰기를 막지 않도록
추천 칸은 모두 필수가 아니다. 일반 목록 · FAQ 는 제목 · 본문 · 카테고리로 충분해 없다.
"""

from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.models.board import Board, BoardField
from app.services.board_field import SHOW_IN_LIST_KEY

MSG_UNKNOWN_PRESET = "이 유형에서 쓸 수 없는 추천 칸입니다. 화면을 새로 고쳐 주세요."

PRESETS: dict[str, list[dict[str, Any]]] = {
    "LIST": [],
    "FAQ": [],
    "GALLERY": [
        {"key": "taken_on", "label": "촬영일", "field_type": "DATE"},
        {"key": "place", "label": "장소", "field_type": "TEXT"},
    ],
    "CARD": [
        {
            "key": "employment_type",
            "label": "근무 형태",
            "field_type": "SELECT",
            "choices": ["정규직", "계약직", "아르바이트", "인턴"],
            "show_in_list": True,
        },
        {"key": "location", "label": "근무지", "field_type": "TEXT"},
        {
            "key": "deadline",
            "label": "마감일",
            "field_type": "DATE",
            "show_in_list": True,
        },
        {"key": "apply_url", "label": "지원 링크", "field_type": "URL"},
    ],
}


def presets_response() -> dict[str, list[dict[str, Any]]]:
    """화면용 — 유형마다 추천 칸 (키 · 이름 · 유형 · 선택지 · 목록 표시)."""
    return {
        board_type: [
            {
                "key": p["key"],
                "label": p["label"],
                "field_type": p["field_type"],
                "choices": p.get("choices", []),
                "show_in_list": p.get("show_in_list", False),
            }
            for p in presets
        ]
        for board_type, presets in PRESETS.items()
    }


def check_keys(board_type: str, keys: list[str]) -> list[str]:
    """이 유형의 추천 칸 키인지 — 겹치면 하나로, 정의 순서대로 돌려준다."""
    allowed = [p["key"] for p in PRESETS.get(board_type, [])]
    unknown = set(keys) - set(allowed)
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "VALIDATION_ERROR",
                "message": MSG_UNKNOWN_PRESET,
                "field": "preset_fields",
            },
        )
    return [key for key in allowed if key in keys]


def preset_fields(board: Board, keys: list[str]) -> list[BoardField]:
    """고른 추천 칸 — 새 게시판이라 정의 순서가 곧 칸 순서다."""
    by_key = {p["key"]: p for p in PRESETS.get(board.board_type, [])}
    fields = []
    for order, key in enumerate(keys):
        preset = by_key[key]
        options: dict[str, Any] = {}
        if preset.get("choices"):
            options["choices"] = [
                {"value": f"opt_{i}", "label": label}
                for i, label in enumerate(preset["choices"], start=1)
            ]
        if preset.get("show_in_list"):
            options[SHOW_IN_LIST_KEY] = True
        fields.append(
            BoardField(
                id=uuid4(),
                tenant_id=board.tenant_id,
                board_id=board.id,
                field_key=key,
                label=preset["label"],
                field_type=preset["field_type"],
                is_required=False,
                is_visible=True,
                help_text="",
                placeholder="",
                default_value=None,
                field_options=options,
                display_order=order,
            )
        )
    return fields
