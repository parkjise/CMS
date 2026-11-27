"""시작용 콘텐츠 유형 5개 (T-253, 콘텐츠 관리 기획서 CM-03).

기본 칸(제목 · 요약 · 본문 · 대표 사진 · 카테고리 · 태그)은 모든 유형에 있으므로
여기에는 유형마다 더하는 칸만 둔다. 칸 모양은 ContentFieldInput 과 같다.
"""

from typing import Any

CONTENT_PRESETS: dict[str, dict[str, Any]] = {
    "service": {
        "name": "서비스 소개",
        "description": "제공하는 서비스 · 진료 과목 · 상품을 카드로 보여 줍니다.",
        "fields": [
            {"field_key": "price_note", "label": "가격 안내", "field_type": "TEXT"},
            {"field_key": "link", "label": "자세히 보기 링크", "field_type": "URL"},
        ],
    },
    "faq": {
        "name": "자주 묻는 질문",
        "description": "제목에 질문, 본문에 답변을 씁니다.",
        "fields": [],
    },
    "history": {
        "name": "연혁",
        "description": "연도 · 월과 함께 걸어온 길을 보여 줍니다.",
        "fields": [
            {
                "field_key": "year",
                "label": "연도",
                "field_type": "NUMBER",
                "is_required": True,
                "min": 1900,
                "max": 2100,
            },
            {
                "field_key": "month",
                "label": "월",
                "field_type": "NUMBER",
                "min": 1,
                "max": 12,
            },
        ],
    },
    "team": {
        "name": "팀 · 의료진 소개",
        "description": "대표 사진에 인물 사진, 직책과 전문 분야를 씁니다.",
        "fields": [
            {
                "field_key": "role",
                "label": "직책",
                "field_type": "TEXT",
                "is_required": True,
            },
            {"field_key": "specialty", "label": "전문 분야", "field_type": "TEXT"},
        ],
    },
    "partner": {
        "name": "고객사 · 파트너",
        "description": "대표 사진에 로고를 넣어 줄지어 보여 줍니다.",
        "fields": [
            {"field_key": "link", "label": "홈페이지 링크", "field_type": "URL"},
        ],
    },
}


def preset_options() -> list[dict[str, Any]]:
    """화면의 '시작용 유형' 고르기 — 이름 · 설명 · 더해지는 칸 이름."""
    return [
        {
            "key": key,
            "name": preset["name"],
            "description": preset["description"],
            "fields": [f["label"] for f in preset["fields"]],
        }
        for key, preset in CONTENT_PRESETS.items()
    ]
