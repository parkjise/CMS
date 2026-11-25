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
    # 리뷰형 (T-218) — 별점은 만들 때 늘 추가한다. 필수 표시 대신 서버가 별점을 요구해
    # 홈페이지 회원 · 비회원 글쓰기가 꺼지지 않는다 (board_field.review_rating_key)
    "REVIEW": [
        {
            "key": "rating",
            "label": "별점",
            "field_type": "RATING",
            "show_in_list": True,
        },
    ],
    "WEBZINE": [
        {"key": "tags", "label": "태그", "field_type": "TEXT", "show_in_list": True},
    ],
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


# 콘텐츠형 게시판 (T-243, 페이지 기획서 CM-03) — '게시판 연결' 섹션으로 보여 준다.
# 화면은 이름 · 설명 · 유형을 채우고 방문자 글쓰기 꺼짐 · 상단 메뉴 빼기로 시작한다.
# 칸은 유형 추천 칸 대신 이 칸을 고른다 — 키는 유형 추천 칸과 겹치지 않게
CONTENT_PRESETS: list[dict[str, Any]] = [
    {
        "key": "services",
        "name": "서비스 소개",
        "description": "제공하는 서비스를 사진과 함께 소개합니다.",
        "board_type": "CARD",
        "fields": [],
    },
    {
        "key": "faq",
        "name": "자주 묻는 질문",
        "description": "자주 받는 질문과 답변을 모았습니다.",
        "board_type": "FAQ",
        "fields": [],
    },
    {
        "key": "history",
        "name": "연혁",
        "description": "걸어온 길을 연도별로 정리합니다.",
        "board_type": "LIST",
        "fields": [
            {
                "key": "year",
                "label": "연도",
                "field_type": "TEXT",
                "show_in_list": True,
            },
        ],
    },
    {
        "key": "team",
        "name": "의료진 · 팀 소개",
        "description": "함께하는 사람들을 사진과 함께 소개합니다.",
        "board_type": "CARD",
        "fields": [
            {
                "key": "role",
                "label": "직책",
                "field_type": "TEXT",
                "show_in_list": True,
            },
            {
                "key": "specialty",
                "label": "전문 분야",
                "field_type": "TEXT",
                "show_in_list": True,
            },
        ],
    },
    {
        "key": "reviews",
        "name": "후기",
        "description": "고객 후기를 모아 보여 줍니다.",
        "board_type": "REVIEW",
        "fields": [],
    },
]


def _definitions(board_type: str) -> list[dict[str, Any]]:
    """이 유형에서 만들 수 있는 칸 — 유형 추천 칸 + 같은 유형 콘텐츠형 프리셋 칸."""
    found = list(PRESETS.get(board_type, []))
    for preset in CONTENT_PRESETS:
        if preset["board_type"] == board_type:
            found += [f for f in preset["fields"] if f not in found]
    return found


def _field_view(board_type: str, p: dict[str, Any]) -> dict[str, Any]:
    return {
        "key": p["key"],
        "label": p["label"],
        "field_type": p["field_type"],
        "choices": p.get("choices", []),
        "show_in_list": p.get("show_in_list", False),
        # 고르지 않아도 늘 만든다 — 화면은 체크를 풀 수 없게 (T-218)
        "always": p["key"] in ALWAYS.get(board_type, set()),
    }


def content_presets_response() -> list[dict[str, Any]]:
    """화면용 콘텐츠형 프리셋 — 늘 만드는 칸(리뷰형 별점)도 함께 보여 준다."""
    return [
        {
            **{k: preset[k] for k in ("key", "name", "description", "board_type")},
            "fields": [
                _field_view(preset["board_type"], p)
                for p in [
                    *(
                        p
                        for p in PRESETS.get(preset["board_type"], [])
                        if p["key"] in ALWAYS.get(preset["board_type"], set())
                    ),
                    *preset["fields"],
                ]
            ],
        }
        for preset in CONTENT_PRESETS
    ]


def presets_response() -> dict[str, list[dict[str, Any]]]:
    """화면용 — 유형마다 추천 칸 (키 · 이름 · 유형 · 선택지 · 목록 표시)."""
    return {
        board_type: [_field_view(board_type, p) for p in presets]
        for board_type, presets in PRESETS.items()
    }


# 고르지 않아도 늘 만드는 추천 칸
ALWAYS = {"REVIEW": {"rating"}}


def check_keys(board_type: str, keys: list[str]) -> list[str]:
    """이 유형의 추천 칸 키인지 — 겹치면 하나로, 정의 순서대로 돌려준다."""
    allowed = [p["key"] for p in _definitions(board_type)]
    keys = [*keys, *ALWAYS.get(board_type, set())]
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


def preset_fields(board: Board, keys: list[str], start: int = 0) -> list[BoardField]:
    """고른 추천 칸 — 새 게시판이라 정의 순서가 곧 칸 순서다 (start 부터)."""
    by_key = {p["key"]: p for p in _definitions(board.board_type)}
    fields = []
    for order, key in enumerate(keys, start=start):
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
