"""AI 문구 추천 프롬프트 정의 (버전 관리).

프롬프트를 수정할 때는 PROMPT_VERSION 을 올리고, 변경 이력을 주석으로 남긴다.
ai_usage_log 와 응답(prompt_version)에 버전을 기록해 추후 품질 분석에 활용한다.

변경 이력:
- v1 (2026-06): 최초 작성. 업종별(HOSPITAL/PENSION/STARTUP/GENERAL) 가이드 분기.
- v2 (2026-06): 토큰 최소화(T-073). 업종 가이드를 1문장으로 압축하고 system 프롬프트의
  중복·군더더기를 제거해 입력 토큰을 약 40% 절감. 품질 핵심(키워드/톤/길이/JSON)은 유지.
"""

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

PROMPT_VERSION = "v2"

# 업종별 카피라이팅 가이드 — template_type 기준으로 선택 (v2: 1문장으로 압축)
INDUSTRY_GUIDANCE: dict[str, str] = {
    "HOSPITAL": ("의료기관: 신뢰·전문·안전을 강조하고 과장·허위 의료광고 표현은 금지."),
    "PENSION": "숙박/펜션: 휴식·자연·아늑함을 감성적이고 따뜻하게 전달.",
    "STARTUP": "스타트업/IT: 혁신·성장·문제해결을 간결하고 임팩트 있게 표현.",
    "GENERAL": "소상공인: 핵심 가치와 차별점을 명확하고 신뢰감 있게 전달.",
}

# 업종별 max_length 기본값과 별개로, 필드별 길이 제한
FIELD_MAX_LENGTH: dict[str, int] = {
    "main_title": 40,
    "sub_title": 100,
    "button_text": 30,
    "description": 200,
}
_DEFAULT_FIELD_MAX_LENGTH = 40

_SYSTEM_TEMPLATE = """한국 소상공인 홈페이지 카피라이팅 전문가.
업종: {template_type} / 업체명: {business_name}
키워드: {keywords} / 톤: {tone}
가이드: {guidance}

규칙: 한국어, 각 {max_length}자 이내, 키워드 자연 포함, \
서로 다른 {count}개 안, JSON 배열로만 응답 예) ["문구1","문구2"]"""

_HUMAN_TEMPLATE = (
    "현재 문구 '{current_value}'를 {count}가지로 개선(비어있으면 새로 작성)."
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
