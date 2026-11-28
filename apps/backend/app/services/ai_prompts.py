"""AI 문구 추천 프롬프트 정의 (버전 관리).

프롬프트를 수정할 때는 PROMPT_VERSION 을 올리고, 변경 이력을 주석으로 남긴다.
ai_usage_log 와 응답(prompt_version)에 버전을 기록해 추후 품질 분석에 활용한다.

변경 이력:
- v1 (2026-06): 최초 작성. 업종별(HOSPITAL/PENSION/STARTUP/GENERAL) 가이드 분기.
- v2 (2026-06): 토큰 최소화(T-073). 업종 가이드를 1문장으로 압축하고 system 프롬프트의
  중복·군더더기를 제거해 입력 토큰을 약 40% 절감. 품질 핵심(키워드/톤/길이/JSON)은 유지.
"""

from typing import Any

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


# ───────────────────────── AI 보조 (assist, 기획서 2장) ─────────────────────────
# 변경 이력:
# - assist-v1 (2026-11): seo · geo 채우기 (T-231-B)
# - assist-v1 board (2026-11): 게시판 구성 추천 (T-232-B) — 다른 kind 프롬프트는 그대로
# - assist-v1 post (2026-11): 공지 · FAQ 글 초안 (T-233-B)
# - assist-v1 policy_summary (2026-11): 약관 변경 요약 (T-234-B)
# - assist-v1 page_seo (2026-11): 페이지 하나의 검색 제목 · 설명 (T-248)
# - assist-v1 board (2026-11): 카테고리에 '전체' 넣지 않기 (T-252)
# - assist-v1 content_polish · content_tags (2026-11): 콘텐츠 문장 · 태그 (T-259)

ASSIST_PROMPT_VERSION = "assist-v1"

ASSIST_TONES: dict[str, str] = {
    "trust": "신뢰감 있게",
    "friendly": "친근하게",
    "expert": "전문적으로",
}

_ASSIST_SYSTEM = """한국 소상공인 홈페이지의 {target}을(를) 쓰는 도우미.
업종 가이드: {guidance}
말투: {tone}

규칙:
- 사용자가 주는 사이트 정보(JSON)에 있는 사실만 쓴다. 정보에 없는 수치 · 수상 · 자격 \
· 가격 · 경력 · 후기는 지어내지 않는다.
- 한국어. 아래 형식의 JSON 객체 하나로만 답한다.
{format}"""

_ASSIST_FORMATS: dict[str, str] = {
    "seo": (
        '{{"meta_title": "검색 결과 제목, {title_max}자 이내, 사이트명 포함",'
        ' "meta_description": "검색 결과 설명, {desc_max}자 이내",'
        ' "keywords": [{keywords_rule}]}}'
    ),
    "geo": (
        '{{"description": "AI 답변 서비스가 인용할 기업 소개 — 무엇을 · 어디서 · '
        '누구에게, {desc_max}자 이내",'
        ' "topics": ["이 사업체를 설명하는 주제 낱말, 최대 {topics_max}개, '
        '각 {topic_len}자 이내"]}}'
    ),
}

_ASSIST_FORMATS["board"] = (
    '{{"board_type": "{board_types} 중 \'고를 수 있는 유형\'에 있는 것 하나",'
    ' "name": "게시판 이름, 20자 안팎", "description": "한 줄 설명, {desc_max}자 이내",'
    ' "fields": [{{"label": "추가 칸 이름", "field_type": "{field_types} 중 하나",'
    ' "choices": ["SELECT · MULTI_SELECT 만 선택지"]}}],'
    ' "categories": ["카테고리 이름"],'
    ' "permissions": {{"read": "PUBLIC|MEMBER", "write": "ADMIN|MEMBER"}},'
    ' "operation": {{"allow_secret": false, "notify_new_post": false,'
    ' "allow_guest": false}},'
    ' "reason": "권한 · 운영을 이렇게 정한 까닭 한 줄"}}\n'
    "- fields 는 최대 {fields_max}개, 제목 · 본문 · 작성일은 이미 있으니 넣지 않는다\n"
    "- categories 는 최대 {categories_max}개, '전체'는 홈페이지가 늘 보여 주니 넣지 "
    "않는다\n"
    "- '지금 게시판'이 있으면 그 게시판에 더할 필드 · 카테고리만 추천하고, 이미 있는 "
    "이름은 넣지 않는다\n"
    "- 후기 · 리뷰는 회원만 쓰게(비회원 글쓰기 끔), 공지 · 소식 · FAQ 는 관리자 글쓰기"
)

_POST_RULES = (
    "- body 는 문단(p)과 글머리 목록(ul)만, 최대 {blocks_max}칸. HTML 태그 · 마크다운 "
    "기호(**, #, -)는 쓰지 않는다\n"
    "- 메모의 날짜 · 시간 · 연락 방법은 그대로 옮기고, 메모에 없는 일정 · 가격 · "
    "혜택은 지어내지 않는다\n"
    "- 사업체 연락처는 사이트 정보에 있을 때만 쓴다"
)
_ASSIST_FORMATS["post"] = (
    '{{"titles": ["제목 후보 {titles_count}개, 각 {title_len}자 안팎"],'
    ' "body": [{{"type": "p", "text": "문단"}},'
    ' {{"type": "ul", "items": ["목록 한 줄"]}}]}}\n' + _POST_RULES
)
_ASSIST_FORMATS["post_faq"] = (
    '{{"titles": ["방문자가 묻는 질문 한 문장"],'
    ' "body": [{{"type": "p", "text": "답변 문단"}},'
    ' {{"type": "ul", "items": ["목록 한 줄"]}}]}}\n'
    "- titles 는 질문 하나, body 는 그 질문의 답변\n" + _POST_RULES
)

_ASSIST_FORMATS["policy_summary"] = (
    '{{"summary": "바뀐 내용 요약 1 ~ {lines_max}줄, {summary_max}자 이내"}}\n'
    '- 사이트 정보의 \'바뀐 줄\'에서 "+ " 는 더한 줄, "- " 는 뺀 줄이다. '
    "바뀐 줄에 없는 내용은 쓰지 않는다\n"
    "- 무엇이 바뀌었는지만 쓴다. 법적 효력 · 유불리 해석은 하지 않는다\n"
    "- 버전 이력에 남는 문장이라 '~을(를) 고쳤습니다'처럼 담담하게 쓴다"
)

_ASSIST_FORMATS["page_seo"] = (
    '{{"seo_title": "이 페이지의 검색 결과 제목, {title_max}자 이내, '
    '페이지 주제와 사이트명 포함",'
    ' "seo_description": "이 페이지가 다루는 내용의 검색 결과 설명, '
    '{desc_max}자 이내"}}\n'
    "- 사이트 전체 소개가 아니라 '페이지 이름' · '페이지 섹션 제목'의 주제에 맞춘다\n"
    "- '사이트 검색 제목'과 같은 문장을 그대로 쓰지 않는다"
)

_ASSIST_FORMATS["content_polish"] = (
    '{{"summary": "카드 · 목록에 보일 요약, {summary_max}자 이내",'
    ' "body": [{{"type": "p", "text": "문단"}},'
    ' {{"type": "ul", "items": ["목록 한 줄"]}}]}}\n'
    "- 사이트 정보의 '제목' · '요약' · '본문'을 읽기 쉽게 다듬는다. 뜻 · 사실은 바꾸지 "
    "않고, 없는 내용을 더하지 않는다\n"
    "- body 는 문단(p)과 글머리 목록(ul)만, 최대 {blocks_max}칸. HTML 태그 · 마크다운 "
    "기호(**, #, -)는 쓰지 않는다. 본문이 비어 있으면 body 는 빈 목록"
)

_ASSIST_FORMATS["content_tags"] = (
    '{{"tags": ["태그, 각 {tag_len}자 이내, 최대 {tags_max}개"]}}\n'
    "- '있는 태그' 중 맞는 것을 먼저 그대로 쓰고, 꼭 필요할 때만 새 태그를 만든다\n"
    "- '지금 태그'에 있는 이름은 넣지 않는다\n"
    "- # 기호 없이 짧은 명사로"
)

_ASSIST_TARGETS = {
    "seo": "검색엔진 노출 문구(SEO)",
    "geo": "AI 답변용 기업 소개(GEO)",
    "board": "게시판 구성(유형 · 이름 · 추가 칸 · 카테고리 · 권한)",
    "post": "공지 · 소식 글 초안",
    "post_faq": "자주 묻는 질문(FAQ)의 질문 · 답변 초안",
    "policy_summary": "이용약관 · 개인정보처리방침의 변경 내용 요약",
    "page_seo": "홈페이지 한 페이지의 검색엔진 노출 문구(SEO)",
    "content_polish": "홈페이지 콘텐츠(서비스 · FAQ · 연혁 등)의 요약 · 본문 다듬기",
    "content_tags": "홈페이지 콘텐츠의 태그",
}


def build_assist_messages(
    *,
    kind: str,
    tone: str,
    template_type: str,
    facts_json: str,
    limits: dict[str, Any],
    keywords_allowed: bool = True,
) -> list[BaseMessage]:
    """AI 보조 메시지 — 사이트 정보는 사람 메시지에 JSON 으로.

    kind 는 형식 이름 — FAQ 게시판 글 초안은 post_faq.
    """
    keywords_rule = (
        f'"대표 키워드 {limits.get("keywords_max", 0)}개, '
        f'각 {limits.get("keyword_len", 0)}자 이내"'
        if keywords_allowed
        else ""
    )
    fmt = _ASSIST_FORMATS[kind].format(keywords_rule=keywords_rule, **limits)
    system = _ASSIST_SYSTEM.format(
        target=_ASSIST_TARGETS[kind],
        guidance=industry_guidance(template_type or "GENERAL"),
        tone=ASSIST_TONES.get(tone, ASSIST_TONES["trust"]),
        format=fmt,
    )
    human = f"사이트 정보:\n{facts_json}"
    return [SystemMessage(content=system), HumanMessage(content=human)]
