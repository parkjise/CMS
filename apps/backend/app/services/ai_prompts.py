"""AI 문구 추천 프롬프트 정의 (버전 관리).

프롬프트를 수정할 때는 PROMPT_VERSION 을 올리고, 변경 이력을 주석으로 남긴다.
ai_usage_log 와 응답(prompt_version)에 버전을 기록해 추후 품질 분석에 활용한다.

변경 이력:
- v1 (2026-06): 최초 작성. 업종별(HOSPITAL/PENSION/STARTUP/GENERAL) 가이드 분기.
"""

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

PROMPT_VERSION = "v1"

# 업종별 카피라이팅 가이드 — template_type 기준으로 선택
INDUSTRY_GUIDANCE: dict[str, str] = {
    "HOSPITAL": (
        "의료기관입니다. 신뢰감·전문성·안전성을 강조하고, 과장·허위 의료광고 표현"
        "(최고, 100%, 부작용 없음 등)은 피하세요."
        " 진료 분야와 환자 안심 요소를 담으세요."
    ),
    "PENSION": (
        "숙박/펜션입니다. 휴식·자연·아늑함·특별한 경험을 강조하고, 감성적이고 따뜻한"
        " 분위기를 전달하세요. 주변 풍경과 객실의 매력을 떠올리게 하세요."
    ),
    "STARTUP": (
        "스타트업/IT 서비스입니다. 혁신성·성장·문제 해결·미래지향성을 강조하고,"
        " 간결하고 임팩트 있는 표현을 사용하세요."
    ),
    "GENERAL": (
        "소상공인 사업체입니다. 핵심 가치와 차별점을 명확하고 신뢰감 있게 전달하세요."
    ),
}

# 업종별 max_length 기본값과 별개로, 필드별 길이 제한
FIELD_MAX_LENGTH: dict[str, int] = {
    "main_title": 40,
    "sub_title": 100,
    "button_text": 30,
    "description": 200,
}
_DEFAULT_FIELD_MAX_LENGTH = 40

_SYSTEM_TEMPLATE = """당신은 한국 소상공인 홈페이지 카피라이팅 전문가입니다.
업종: {template_type}
업체명: {business_name}
핵심 키워드: {keywords}
요청 톤앤매너: {tone}

업종 가이드:
{guidance}

규칙:
- 각 문구는 최대 {max_length}자 이내
- 반드시 한국어로 작성
- 키워드를 자연스럽게 포함
- 서로 뚜렷하게 다른 {count}가지 안을 제시
- 다른 설명 없이 JSON 배열로만 응답: ["문구1", "문구2", "문구3"]"""

_HUMAN_TEMPLATE = (
    "현재 문구 '{current_value}'를 {count}가지로 개선해주세요."
    " 현재 문구가 비어 있다면 새로 작성해주세요."
)


# ───────────────────────── 대화형 편집 (chat-edit) ─────────────────────────

CHAT_SYSTEM_TEMPLATE = """당신은 한국 소상공인 홈페이지 편집을 돕는 AI 어시스턴트입니다.
항상 한국어로 친근하고 간결하게 응답하세요.

현재 사이트 정보(JSON):
{site_context}

사용자의 요청을 분석해 아래 액션 중 하나 이상을 제안하세요.
변경 액션이 있으면 응답 끝에 반드시 ```json 코드 블록으로 액션 배열을 포함하세요.

지원 액션:
- 텍스트 변경:
  {{"action": "update_text", "section_id": "...",
   "field": "main_title", "new_value": "..."}}
- 테마(색상) 변경:
  {{"action": "update_theme", "css_overrides": {{"--color-primary": "#1a73e8"}}}}
- 템플릿 변경: {{"action": "change_template", "template_id": "..."}}
- 설명만: {{"action": "explain"}}

규칙:
- section_id/field 는 위 사이트 정보에 존재하는 값만 사용
- 텍스트는 한국어, 자연스럽고 신뢰감 있게 작성
- 액션이 필요 없으면 설명만 하고 explain 액션을 포함"""


def build_chat_system_prompt(site_context_json: str) -> str:
    return CHAT_SYSTEM_TEMPLATE.format(site_context=site_context_json)


def field_max_length(field: str) -> int:
    return FIELD_MAX_LENGTH.get(field, _DEFAULT_FIELD_MAX_LENGTH)


def industry_guidance(template_type: str) -> str:
    return INDUSTRY_GUIDANCE.get(template_type.upper(), INDUSTRY_GUIDANCE["GENERAL"])


def build_copy_messages(
    *,
    template_type: str,
    business_name: str,
    keywords: list[str],
    tone: str,
    current_value: str,
    count: int,
    max_length: int,
) -> list[BaseMessage]:
    """문구 추천용 system/human 메시지를 구성한다."""
    system = _SYSTEM_TEMPLATE.format(
        template_type=template_type or "일반",
        business_name=business_name or "(미지정)",
        keywords=", ".join(keywords) if keywords else "(없음)",
        tone=tone,
        guidance=industry_guidance(template_type),
        max_length=max_length,
        count=count,
    )
    human = _HUMAN_TEMPLATE.format(current_value=current_value or "", count=count)
    return [SystemMessage(content=system), HumanMessage(content=human)]
