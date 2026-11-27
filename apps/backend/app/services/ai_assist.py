"""AI 보조 (관리자 화면 개선 · AI 보조 기획서 2장, T-231-B).

`POST /ai/assist/{kind}` — kind 마다 서버가 사이트 정보를 직접 읽어 프롬프트를 만들고,
모델 답을 결과 스키마로 검증(한 번 다시 묻고 그래도 안 되면 502)한 뒤 저장 API 와 같은
규칙으로 잘라서 돌려준다. 저장은 하지 않는다 — 화면이 폼에 채우고 관리자가 저장한다.

- page_seo: 페이지 하나의 검색 제목 · 설명 (페이지 관리 PM-02, T-248)
- 한도: 'AI 문구 추천' 월 한도를 함께 쓴다 (ai.copy_quota_used)
- 분당 제한 · 같은 입력 1시간 캐시 · ai_usage_log(action_type = assist_{kind})
"""

import difflib
import hashlib
import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, get_args

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import ColumnElement, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.redis import get_redis
from app.models.ai import AiUsageLog
from app.models.board import Board, BoardCategory
from app.models.page import Page
from app.models.section import Section
from app.models.site import SiteSetting
from app.models.tenant import Tenant
from app.schemas.ai_assist import (
    MEMO_MAX,
    PURPOSE_MAX,
    AssistRequest,
    AssistResponse,
    AssistResult,
    AssistUsage,
    BoardAssistResult,
    GeoAssistResult,
    PageSeoAssistResult,
    PolicySummaryResult,
    PostAssistResult,
    SeoAssistResult,
    SuggestedField,
)
from app.schemas.board import BoardOperation, BoardPermissions, BoardType, FieldType
from app.schemas.seo import GEO_DESCRIPTION_MAX, GEO_TOPIC_LENGTH, GEO_TOPICS_MAX
from app.services import ai as ai_service
from app.services import board as board_service
from app.services import board_access, site_policy
from app.services import board_field as field_service
from app.services import feature as feature_service
from app.services.ai_prompts import ASSIST_PROMPT_VERSION, build_assist_messages
from app.services.rich_text import RICH_TEXT_VALUE_TYPE, to_plain_text
from app.services.seo import (
    KEYWORD_MAX_LENGTH,
    KEYWORDS_MAX,
    get_seo_settings,
    keywords_allowed,
)

logger = logging.getLogger("app.ai")

AI_SITE_ASSIST = "AI_SITE_ASSIST"
AI_BOARD_ASSIST = "AI_BOARD_ASSIST"

# kind → 기능 스위치 (기획서 2.0 표)
ASSIST_FLAGS: dict[str, str] = {
    "seo": AI_SITE_ASSIST,
    "geo": AI_SITE_ASSIST,
    "board": AI_BOARD_ASSIST,
    "post": AI_BOARD_ASSIST,
    "policy_summary": AI_SITE_ASSIST,
    "page_seo": AI_SITE_ASSIST,
}
RESULT_MODELS: dict[str, type[AssistResult]] = {
    "seo": SeoAssistResult,
    "geo": GeoAssistResult,
    "board": BoardAssistResult,
    "post": PostAssistResult,
    "policy_summary": PolicySummaryResult,
    "page_seo": PageSeoAssistResult,
}

META_TITLE_MAX = 60
META_DESC_MAX = 160

# 게시판 구성 추천 (A-2) — 저장 API 규칙과 같게
BOARD_TYPES: tuple[str, ...] = get_args(BoardType)
FIELD_TYPES: tuple[str, ...] = get_args(FieldType)
BOARD_NAME_MAX = 100
BOARD_DESC_MAX = 200
FIELD_LABEL_MAX = 50
FIELD_CHOICE_MAX = 100
FIELD_CHOICES_MAX = 20
CATEGORY_NAME_MAX = 30
BOARD_FIELDS_MAX = 8
BOARD_CATEGORIES_MAX = 10
REASON_MAX = 300
_BOARDS_IN_PROMPT = 30
# 별점은 리뷰형이 늘 만든다 — 추천 칸으로는 받지 않는다
_SKIPPED_FIELD_TYPES = frozenset({"RATING"})
# 글쓰기 화면에 원래 있는 칸 — 같은 이름의 추가 칸은 받지 않는다
_BASE_FIELDS = ("제목", "내용", "본문", "작성자", "작성일")
# 공지 · FAQ 글 초안 (A-3) — 제목은 글 저장 규칙(200자), 본문은 문단 · 목록만
POST_TITLE_MAX = 200
POST_TITLE_HINT = 40
POST_TITLES = 3
DRAFT_BLOCKS_MAX = 12
DRAFT_TEXT_MAX = 1000
DRAFT_ITEMS_MAX = 10
DRAFT_ITEM_MAX = 200
# 약관 변경 요약 (A-4) — 바뀐 줄만 보낸다. 약관 전체를 보내지 않게 줄 수 · 글자 수 제한
POLICY_SUMMARY_LINES = 3
CHANGED_LINES_MAX = 200
CHANGED_CHARS_MAX = 6000
_POLICY_TITLES = {"terms": "이용약관", "privacy": "개인정보처리방침"}
_TYPE_LABELS = {
    "LIST": "목록형",
    "GALLERY": "갤러리형",
    "FAQ": "FAQ형",
    "CARD": "카드형",
    "WEBZINE": "웹진형",
    "REVIEW": "리뷰형",
    "QNA": "문의형",
}
_SECTIONS_MAX = 12
_DAY_LABELS = {
    "mon": "월",
    "tue": "화",
    "wed": "수",
    "thu": "목",
    "fri": "금",
    "sat": "토",
    "sun": "일",
}

ASSIST_FAILED_MESSAGE = "AI 가 알맞은 답을 주지 못했어요. 잠시 뒤 다시 시도해 주세요."
UNKNOWN_KIND_MESSAGE = "지원하지 않는 AI 보조예요."
PURPOSE_REQUIRED_MESSAGE = "어떤 게시판인지 한두 문장으로 적어 주세요."
MEMO_REQUIRED_MESSAGE = "어떤 글을 쓸지 메모를 적어 주세요."
BOARD_REQUIRED_MESSAGE = "글을 쓸 게시판을 알려 주세요."
POLICY_KIND_MESSAGE = "요약할 문서(이용약관 · 개인정보처리방침)를 알려 주세요."
POLICY_UNCHANGED_MESSAGE = "공개본과 바뀐 곳이 없어요."
PAGE_REQUIRED_MESSAGE = "검색 문구를 만들 페이지를 알려 주세요."
PAGE_NOT_FOUND_MESSAGE = "페이지를 찾을 수 없습니다."
PAGE_HOME_MESSAGE = "홈은 사이트 관리 > SEO 설정에서 만들어 주세요."
# 홈 페이지 키 — services.page.HOME_PAGE 와 같다 (page 서비스를 끌어오지 않게)
_HOME_PAGE = "home"
BOARD_NOT_FOUND_MESSAGE = "게시판을 찾을 수 없습니다."
NOTE_GUEST_REVIEW = "후기는 비회원 글쓰기를 꺼서 광고 · 도배 글을 막았어요."
NOTE_GUEST_MEMBER_ONLY = "비회원 글쓰기는 회원 글쓰기 게시판에서만 켤 수 있어 껐어요."
NOTE_READ_BLOCKED = "회원 기능을 쓸 수 없어 누구나 읽기로 했어요."
NOTE_WRITE_BLOCKED = "회원 글쓰기를 쓸 수 없어 관리자 글쓰기로 했어요."


@dataclass
class AssistContext:
    """결과를 고칠 때 쓰는 사업체 사정 — 프롬프트에 알려 줘도 서버가 다시 지킨다."""

    allow_keywords: bool = True
    # 게시판 구성 (board)
    blocked_types: dict[str, str] = field(default_factory=dict)
    read_blocked: str | None = None
    write_blocked: str | None = None
    # 있는 게시판에 더하기 — 그 게시판 유형 그대로, 이미 있는 이름은 건너뜀
    fixed_type: str | None = None
    taken_fields: set[str] = field(default_factory=set)
    taken_categories: set[str] = field(default_factory=set)
    # 글 초안 (post) — FAQ 게시판이면 질문 하나 · 답변
    faq: bool = False


FEATURE_OFF_MESSAGE = "이 기능은 현재 비활성화되어 있습니다."
LIMIT_MESSAGE = "이번 달 AI 문구 추천 사용 한도를 초과했습니다."


def action_type(kind: str) -> str:
    return f"{ai_service.ASSIST_ACTION_PREFIX}{kind}"


# ───────────────────────── 결과 검증 · 자르기 ─────────────────────────


def _clean_words(raw: Any, *, max_count: int, max_length: int) -> list[str]:
    """공백 정리 · 빈 값 · 중복(대소문자 무시) · 너무 긴 낱말을 빼고 개수로 자른다."""
    if not isinstance(raw, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for item in raw:
        word = " ".join(str(item).split())
        if not word or len(word) > max_length or word.lower() in seen:
            continue
        seen.add(word.lower())
        result.append(word)
    return result[:max_count]


def _text(raw: Any, max_length: int) -> str:
    return " ".join(str(raw or "").split())[:max_length]


def same_name(name: str) -> str:
    """이름 비교 — 띄어쓰기 · 대소문자 무시 (화면 lib/boardSuggestion.ts 와 같게)."""
    return "".join(name.split()).lower()


# 홈페이지 분류 탭이 늘 앞에 붙이는 이름 — 추천에 오면 빼서 겹치지 않게 (T-252)
ALL_CATEGORY_NAMES = frozenset({"전체", "all"})


def _board_fields(raw: Any, taken: set[str]) -> list[SuggestedField]:
    """기존 칸 유형만, 고르기 칸은 선택지가 있을 때만 — 있는 이름 · 별점은 건너뜀."""
    if not isinstance(raw, list):
        return []
    seen = set(taken)
    result: list[SuggestedField] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        label = _text(item.get("label"), FIELD_LABEL_MAX)
        field_type = str(item.get("field_type") or "").upper()
        if (
            not label
            or field_type not in FIELD_TYPES
            or field_type in _SKIPPED_FIELD_TYPES
            or same_name(label) in seen
        ):
            continue
        choices = (
            _clean_words(
                item.get("choices"),
                max_count=FIELD_CHOICES_MAX,
                max_length=FIELD_CHOICE_MAX,
            )
            if field_type in field_service.CHOICE_TYPES
            else []
        )
        if field_type in field_service.CHOICE_TYPES and not choices:
            continue
        seen.add(same_name(label))
        result.append(
            SuggestedField.model_validate(
                {"label": label, "field_type": field_type, "choices": choices}
            )
        )
        if len(result) == BOARD_FIELDS_MAX:
            break
    return result


def _board_result(parsed: dict, ctx: AssistContext) -> BoardAssistResult:
    """모델 답 → 게시판 추천. 고를 수 없는 유형 · 위험한 권한 조합은 기본값으로 고치고
    까닭을 덧붙인다 (기획서 A-2 안전)."""
    notes: list[str] = []
    raw_type = str(parsed.get("board_type") or "").upper()
    if ctx.fixed_type:
        board_type = ctx.fixed_type
    elif raw_type in BOARD_TYPES and raw_type not in ctx.blocked_types:
        board_type = raw_type
    else:
        board_type = "LIST"
        if raw_type in ctx.blocked_types:
            notes.append(f"{ctx.blocked_types[raw_type]} 목록형으로 바꿨어요.")

    name = _text(parsed.get("name"), BOARD_NAME_MAX)
    if not name:
        raise ValueError("게시판 이름이 비어 있습니다.")

    categories = [
        c
        for c in _clean_words(
            parsed.get("categories"),
            max_count=BOARD_CATEGORIES_MAX * 2,
            max_length=CATEGORY_NAME_MAX,
        )
        if same_name(c) not in ctx.taken_categories
        and same_name(c) not in ALL_CATEGORY_NAMES
    ]
    deduped: list[str] = []
    for c in categories:
        if same_name(c) not in {same_name(d) for d in deduped}:
            deduped.append(c)

    perms = parsed.get("permissions")
    perms = perms if isinstance(perms, dict) else {}
    read = perms.get("read") if perms.get("read") in ("PUBLIC", "MEMBER") else "PUBLIC"
    write = perms.get("write") if perms.get("write") in ("ADMIN", "MEMBER") else "ADMIN"
    if read == "MEMBER" and ctx.read_blocked:
        read = "PUBLIC"
        notes.append(NOTE_READ_BLOCKED)
    if write == "MEMBER" and ctx.write_blocked:
        write = "ADMIN"
        notes.append(NOTE_WRITE_BLOCKED)

    op = parsed.get("operation")
    op = op if isinstance(op, dict) else {}
    allow_guest = op.get("allow_guest") is True
    if allow_guest and board_type == board_service.REVIEW_TYPE:
        allow_guest = False
        notes.append(NOTE_GUEST_REVIEW)
    elif allow_guest and write != "MEMBER":
        allow_guest = False
        notes.append(NOTE_GUEST_MEMBER_ONLY)

    reason = " ".join([_text(parsed.get("reason"), REASON_MAX), *notes]).strip()
    return BoardAssistResult.model_validate(
        {
            "board_type": board_type,
            "name": name,
            "description": _text(parsed.get("description"), BOARD_DESC_MAX),
            "fields": _board_fields(parsed.get("fields"), ctx.taken_fields),
            "categories": deduped[:BOARD_CATEGORIES_MAX],
            "permissions": BoardPermissions.model_validate(
                {"read": read, "write": write}
            ),
            "operation": BoardOperation(
                allow_secret=op.get("allow_secret") is True,
                notify_new_post=op.get("notify_new_post") is True,
                allow_guest=allow_guest,
            ),
            "reason": reason[:REASON_MAX],
        }
    )


def _lines(raw: Any, max_length: int) -> str:
    """문단 글자 — 줄바꿈은 두고 줄마다 띄어쓰기만 정리한다."""
    lines = [" ".join(line.split()) for line in str(raw or "").splitlines()]
    return "\n".join(line for line in lines if line)[:max_length]


def _draft_body(raw: Any) -> list[dict]:
    """본문 — 문단 · 글머리 목록만. 모르는 칸 · 빈 칸은 빼고, 글 하나면 빈 줄로 나눔."""
    if isinstance(raw, str):
        raw = [{"type": "p", "text": part} for part in raw.split("\n\n")]
    if not isinstance(raw, list):
        return []
    blocks: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "ul":
            raw_items = item.get("items")
            items = [
                _text(i, DRAFT_ITEM_MAX)
                for i in (raw_items if isinstance(raw_items, list) else [])
            ]
            items = [i for i in items if i][:DRAFT_ITEMS_MAX]
            if items:
                blocks.append({"type": "ul", "items": items})
        elif item.get("type") == "p":
            text = _lines(item.get("text"), DRAFT_TEXT_MAX)
            if text:
                blocks.append({"type": "p", "text": text})
        if len(blocks) == DRAFT_BLOCKS_MAX:
            break
    return blocks


def _post_result(parsed: dict, ctx: AssistContext) -> PostAssistResult:
    raw_titles = parsed.get("titles")
    if not isinstance(raw_titles, list):
        raw_titles = [parsed.get("question") or parsed.get("title")]
    titles: list[str] = []
    for raw in raw_titles:
        title = _text(raw, POST_TITLE_MAX)
        if title and title not in titles:
            titles.append(title)
    titles = titles[: 1 if ctx.faq else POST_TITLES]
    body = _draft_body(parsed.get("body", parsed.get("answer")))
    if not titles or not body:
        raise ValueError("제목 · 본문이 비어 있습니다.")
    return PostAssistResult.model_validate({"titles": titles, "body": body})


def changed_lines(before: str, after: str) -> tuple[list[str], int, int]:
    """줄 단위 비교 (화면 lib/lineDiff.ts 와 같은 뜻) — 바뀐 줄만 '+ ' · '- ' 를 붙여서.

    빈 줄은 빼고, (바뀐 줄, 더한 줄 수, 뺀 줄 수). 바뀐 줄은 개수 · 글자 수로 자른다.
    """
    a = before.splitlines()
    b = after.splitlines()
    lines: list[str] = []
    added = removed = 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(
        a=a, b=b, autojunk=False
    ).get_opcodes():
        if tag in ("replace", "delete"):
            for line in a[i1:i2]:
                if line.strip():
                    removed += 1
                    lines.append(f"- {line.strip()}")
        if tag in ("replace", "insert"):
            for line in b[j1:j2]:
                if line.strip():
                    added += 1
                    lines.append(f"+ {line.strip()}")
    kept: list[str] = []
    size = 0
    for line in lines[:CHANGED_LINES_MAX]:
        size += len(line)
        if size > CHANGED_CHARS_MAX:
            break
        kept.append(line)
    return kept, added, removed


def _summary_result(parsed: dict) -> PolicySummaryResult:
    """요약 — 1 ~ 3줄, 500자. 비면 다시 묻는다."""
    text = _lines(parsed.get("summary"), site_policy.SUMMARY_MAX)
    summary = "\n".join(text.splitlines()[:POLICY_SUMMARY_LINES])
    if not summary:
        raise ValueError("요약이 비어 있습니다.")
    return PolicySummaryResult(summary=summary)


def parse_assist_result(
    kind: str, content: str, ctx: AssistContext | None = None
) -> AssistResult:
    """모델 답 → 결과 스키마. 모양이 맞지 않거나 필수 글이 비면 ValueError."""
    try:
        parsed = json.loads(ai_service._strip_code_fence(content))
    except json.JSONDecodeError as exc:
        raise ValueError("AI 응답을 JSON 으로 읽을 수 없습니다.") from exc
    if not isinstance(parsed, dict):
        raise ValueError("AI 응답이 객체가 아닙니다.")
    ctx = ctx or AssistContext()

    try:
        if kind == "board":
            return _board_result(parsed, ctx)
        if kind == "post":
            return _post_result(parsed, ctx)
        if kind == "policy_summary":
            return _summary_result(parsed)
        if kind == "page_seo":
            page_seo = PageSeoAssistResult(
                seo_title=_text(parsed.get("seo_title"), META_TITLE_MAX),
                seo_description=_text(parsed.get("seo_description"), META_DESC_MAX),
            )
            if not page_seo.seo_title or not page_seo.seo_description:
                raise ValueError("검색 제목 · 설명이 비어 있습니다.")
            return page_seo
        if kind == "seo":
            seo = SeoAssistResult(
                meta_title=_text(parsed.get("meta_title"), META_TITLE_MAX),
                meta_description=_text(parsed.get("meta_description"), META_DESC_MAX),
                keywords=(
                    _clean_words(
                        parsed.get("keywords"),
                        max_count=KEYWORDS_MAX,
                        max_length=KEYWORD_MAX_LENGTH,
                    )
                    if ctx.allow_keywords
                    else []
                ),
            )
            if not seo.meta_title or not seo.meta_description:
                raise ValueError("메타 제목 · 설명이 비어 있습니다.")
            return seo
        geo = GeoAssistResult(
            description=str(parsed.get("description") or "").strip()[
                :GEO_DESCRIPTION_MAX
            ],
            topics=_clean_words(
                parsed.get("topics"),
                max_count=GEO_TOPICS_MAX,
                max_length=GEO_TOPIC_LENGTH,
            ),
        )
    except ValidationError as exc:
        raise ValueError("AI 응답 모양이 맞지 않습니다.") from exc
    if not geo.description:
        raise ValueError("기업 소개가 비어 있습니다.")
    return geo


# ───────────────────────── 사이트 정보 (서버가 직접 읽음) ─────────────────────────


def _area(address: str | None) -> str | None:
    """주소는 시 · 구까지만 — 번지 · 상세 주소는 보내지 않는다."""
    parts = (address or "").split()
    return " ".join(parts[:2]) or None


def _hours_summary(site: SiteSetting) -> str | None:
    weekly = site.weekly_hours if isinstance(site.weekly_hours, dict) else None
    if weekly:
        days: list[str] = []
        for key, label in _DAY_LABELS.items():
            day = weekly.get(key)
            if not isinstance(day, dict):
                continue
            if day.get("status") == "open" and day.get("open") and day.get("close"):
                days.append(f"{label} {day['open']}~{day['close']}")
            elif day.get("status") == "closed":
                days.append(f"{label} 휴무")
        if days:
            return ", ".join(days)
    parts = [
        f"평일 {site.hours_weekday}" if site.hours_weekday else "",
        f"토요일 {site.hours_saturday}" if site.hours_saturday else "",
        site.hours_note or "",
    ]
    return " / ".join(p for p in parts if p) or None


async def build_assist_facts(db: AsyncSession, tenant: Tenant, kind: str) -> dict:
    """사업체가 직접 입력한 정보만 — 방문자 글 · 이름 · 연락처는 넣지 않는다 (2.0)."""
    site = (await db.execute(select(SiteSetting))).scalar_one_or_none()
    seo = await get_seo_settings(db)
    facts: dict[str, Any] = {
        "업종": tenant.template_type,
        "사이트명": (site.site_name if site else None) or tenant.name,
        "회사명": site.company_name if site else None,
        "업태": site.business_type if site else None,
        "종목": site.business_item if site else None,
        "지역": _area(site.address) if site else None,
        "운영시간": _hours_summary(site) if site else None,
        "주차": site.parking if site else None,
        "섹션 제목": await _section_titles(db),
    }
    if kind == "seo":
        facts["지금 SEO"] = {
            "메타 제목": seo.meta_title if seo else None,
            "메타 설명": seo.meta_description if seo else None,
            "키워드": list(seo.keywords or []) if seo else [],
        }
    else:
        geo = (seo.geo if seo else None) or {}
        facts["지금 GEO"] = {
            "기업 소개": geo.get("description") or None,
            "주제": geo.get("topics") or [],
        }
    return {k: v for k, v in facts.items() if v not in (None, "", [], {})}


async def _section_titles(db: AsyncSession, page_key: str | None = None) -> list[str]:
    """보이는 섹션의 큰 제목 (없으면 섹션 이름) — page_key 가 있으면 그 페이지만."""
    conditions: list[ColumnElement[bool]] = [
        Section.deleted_at.is_(None),
        Section.is_active.is_(True),
    ]
    if page_key is not None:
        conditions.append(Section.page_key == page_key)
    sections = (
        (
            await db.execute(
                select(Section)
                .where(*conditions)
                .options(selectinload(Section.settings))
                .order_by(Section.display_order)
            )
        )
        .scalars()
        .all()
    )
    titles: list[str] = []
    for section in sections[:_SECTIONS_MAX]:
        main = next(
            (
                to_plain_text(s.field_value)
                if s.value_type == RICH_TEXT_VALUE_TYPE and s.field_value
                else s.field_value
                for s in section.settings
                if s.field_key == "main_title"
            ),
            None,
        )
        title = " ".join(str(main or section.label or "").split())
        if title and title not in titles:
            titles.append(title[:80])
    return titles


# ───────────────────────── 캐시 ─────────────────────────


def _cache_key(tenant_id: uuid.UUID, kind: str, tone: str, facts: dict) -> str:
    payload = json.dumps(
        {"kind": kind, "tone": tone, "facts": facts, "v": ASSIST_PROMPT_VERSION},
        ensure_ascii=False,
        sort_keys=True,
    )
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]
    return f"ai:assist:{tenant_id}:{kind}:{digest}"


async def _get_cached(key: str) -> dict | None:
    try:
        cached = await (await get_redis()).get(key)
        if cached:
            parsed = json.loads(cached)
            return parsed if isinstance(parsed, dict) else None
    except Exception:  # noqa: BLE001 - 캐시는 best-effort
        logger.warning("AI 보조 캐시 조회 실패", exc_info=True)
    return None


async def _set_cached(key: str, result: AssistResult) -> None:
    try:
        await (await get_redis()).setex(
            key, settings.ai_cache_ttl_seconds, result.model_dump_json()
        )
    except Exception:  # noqa: BLE001 - 캐시는 best-effort
        logger.warning("AI 보조 캐시 저장 실패", exc_info=True)


# ───────────────────────── 생성 ─────────────────────────


async def generate(
    kind: str, messages: list, ctx: AssistContext
) -> tuple[AssistResult, int]:
    """모델 호출 → 결과 검증(한 번 다시 묻기). 장애 · 키 없음 · 계속 틀리면 502."""
    last_error: Exception | None = None
    for _ in range(ai_service.MAX_PARSE_RETRIES + 1):
        try:
            content, tokens = await ai_service._call_model(messages)
        except Exception as exc:  # noqa: BLE001 - OpenAI 장애 · 키 오류 · 시간 초과
            logger.warning("AI 보조 모델 호출 실패 kind=%s", kind, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY, detail=ASSIST_FAILED_MESSAGE
            ) from exc
        try:
            return parse_assist_result(kind, content, ctx), tokens
        except ValueError as exc:
            last_error = exc
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY, detail=ASSIST_FAILED_MESSAGE
    ) from last_error


def _usage(used: int, limit: int | None) -> AssistUsage:
    return AssistUsage(
        used=used,
        limit=limit,
        remaining=None if limit is None else max(limit - used, 0),
    )


def _validation_error(message: str, field_name: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": "VALIDATION_ERROR", "message": message, "field": field_name},
    )


async def build_board_context(
    db: AsyncSession, tenant: Tenant, body: AssistRequest
) -> tuple[dict, AssistContext]:
    """게시판 구성 추천 — 목적 · 업종 · 있는 게시판 · 고를 수 있는 유형 · 회원 기능.

    board_id 가 있으면 그 게시판(유형 · 설명 · 있는 필드 · 카테고리)에 더할 것만.
    """
    purpose = _text(body.purpose, PURPOSE_MAX)
    if not purpose:
        raise _validation_error(PURPOSE_REQUIRED_MESSAGE, "purpose")

    ctx = AssistContext(
        blocked_types=await board_service.blocked_types(db, tenant.id),
        read_blocked=await board_access.tenant_read_blocked(db, tenant.id),
        write_blocked=await board_access.tenant_write_blocked(db, tenant.id),
        taken_fields={same_name(n) for n in _BASE_FIELDS},
    )
    site = (await db.execute(select(SiteSetting))).scalar_one_or_none()
    boards = (
        await db.execute(
            select(Board.name, Board.board_type)
            .where(Board.tenant_id == tenant.id, Board.deleted_at.is_(None))
            .order_by(Board.created_at)
            .limit(_BOARDS_IN_PROMPT)
        )
    ).all()
    facts: dict[str, Any] = {
        "목적": purpose,
        "업종": tenant.template_type,
        "사이트명": (site.site_name if site else None) or tenant.name,
        "업태": site.business_type if site else None,
        "종목": site.business_item if site else None,
        "있는 게시판": [f"{name} ({_TYPE_LABELS.get(t, t)})" for name, t in boards],
        "고를 수 있는 유형": [
            f"{t} {_TYPE_LABELS[t]}" for t in BOARD_TYPES if t not in ctx.blocked_types
        ],
        "회원 읽기": "쓸 수 없음" if ctx.read_blocked else "쓸 수 있음",
        "회원 글쓰기": "쓸 수 없음" if ctx.write_blocked else "쓸 수 있음",
    }

    if body.board_id is not None:
        board = await board_service.get_board(db, tenant.id, body.board_id)
        if board is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=BOARD_NOT_FOUND_MESSAGE
            )
        fields = await field_service.list_fields(db, board.id)
        categories = (
            (
                await db.execute(
                    select(BoardCategory.name).where(
                        BoardCategory.board_id == board.id,
                        BoardCategory.deleted_at.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        ctx.fixed_type = board.board_type
        ctx.taken_fields |= {same_name(f.label) for f in fields}
        ctx.taken_categories = {same_name(c) for c in categories}
        facts["지금 게시판"] = {
            "이름": board.name,
            "유형": _TYPE_LABELS.get(board.board_type, board.board_type),
            "설명": (board.settings or {}).get(board_service.DESCRIPTION_KEY) or None,
            "있는 필드": [f.label for f in fields],
            "있는 카테고리": list(categories),
        }
    return {k: v for k, v in facts.items() if v not in (None, "", [], {})}, ctx


async def build_post_context(
    db: AsyncSession, tenant: Tenant, body: AssistRequest
) -> tuple[dict, AssistContext]:
    """글 초안 — 메모 · 게시판 이름 · 유형 · 사업체 이름 · 사업체 연락처.

    연락처는 사이트 기본정보에 사업체가 적은 것만 (방문자 정보는 보내지 않는다, 2.0).
    """
    memo = _lines(body.memo, MEMO_MAX)
    if not memo:
        raise _validation_error(MEMO_REQUIRED_MESSAGE, "memo")
    if body.board_id is None:
        raise _validation_error(BOARD_REQUIRED_MESSAGE, "board_id")
    board = await board_service.get_board(db, tenant.id, body.board_id)
    if board is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=BOARD_NOT_FOUND_MESSAGE
        )
    site = (await db.execute(select(SiteSetting))).scalar_one_or_none()
    type_label = _TYPE_LABELS.get(board.board_type, board.board_type)
    facts: dict[str, Any] = {
        "메모": memo,
        "게시판": f"{board.name} ({type_label})",
        "업종": tenant.template_type,
        "사업체 이름": (site.site_name if site else None) or tenant.name,
        "전화": ((site.phone or site.cs_phone) if site else None),
        "이메일": site.email if site else None,
    }
    ctx = AssistContext(faq=board.board_type == "FAQ")
    return {k: v for k, v in facts.items() if v not in (None, "")}, ctx


async def build_policy_context(
    db: AsyncSession, tenant: Tenant, body: AssistRequest
) -> tuple[dict, AssistContext]:
    """약관 요약 — 공개본(없으면 기본 문안)은 서버가 읽고, 바뀐 줄만 보낸다 (A-4)."""
    if body.kind is None:
        raise _validation_error(POLICY_KIND_MESSAGE, "kind")
    published = (await site_policy.get_policy(db, tenant, body.kind))["body"]
    lines, added, removed = changed_lines(published, body.body)
    if not lines:
        raise _validation_error(POLICY_UNCHANGED_MESSAGE, "body")
    facts: dict[str, Any] = {
        "문서": _POLICY_TITLES[body.kind],
        "더한 줄 수": added,
        "뺀 줄 수": removed,
        "바뀐 줄": lines,
    }
    shown = len(lines)
    if shown < added + removed:
        facts["보내지 않은 바뀐 줄"] = added + removed - shown
    return facts, AssistContext()


async def build_page_seo_context(
    db: AsyncSession, tenant: Tenant, body: AssistRequest
) -> tuple[dict, AssistContext]:
    """페이지 검색 문구 — 사업체 정보 + 그 페이지 이름 · 섹션 제목 · 지금 검색 문구.

    홈은 사이트 SEO 설정 값을 쓰므로 받지 않는다 (공개 화면도 홈엔 페이지 값을 안 씀).
    """
    if body.page_id is None:
        raise _validation_error(PAGE_REQUIRED_MESSAGE, "page_id")
    page = (
        await db.execute(
            select(Page).where(
                Page.tenant_id == tenant.id,
                Page.id == body.page_id,
                Page.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if page is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=PAGE_NOT_FOUND_MESSAGE
        )
    if page.page_key == _HOME_PAGE:
        raise _validation_error(PAGE_HOME_MESSAGE, "page_id")
    site = (await db.execute(select(SiteSetting))).scalar_one_or_none()
    seo = await get_seo_settings(db)
    facts: dict[str, Any] = {
        "업종": tenant.template_type,
        "사이트명": (site.site_name if site else None) or tenant.name,
        "업태": site.business_type if site else None,
        "종목": site.business_item if site else None,
        "지역": _area(site.address) if site else None,
        "사이트 검색 제목": seo.meta_title if seo else None,
        "페이지 이름": page.title,
        "페이지 섹션 제목": await _section_titles(db, page.page_key),
        "지금 페이지 검색 문구": {
            "제목": page.seo_title,
            "설명": page.seo_description,
        },
    }
    if not (page.seo_title or page.seo_description):
        del facts["지금 페이지 검색 문구"]
    facts = {k: v for k, v in facts.items() if v not in (None, "", [], {})}
    return facts, AssistContext()


async def _prepare(
    db: AsyncSession, tenant: Tenant, kind: str, body: AssistRequest
) -> tuple[dict, AssistContext, dict[str, Any]]:
    """kind 마다 (사이트 정보, 결과 고칠 사정, 프롬프트 한도)."""
    if kind == "policy_summary":
        facts, ctx = await build_policy_context(db, tenant, body)
        return (
            facts,
            ctx,
            {
                "lines_max": POLICY_SUMMARY_LINES,
                "summary_max": site_policy.SUMMARY_MAX,
            },
        )
    if kind == "post":
        facts, ctx = await build_post_context(db, tenant, body)
        return (
            facts,
            ctx,
            {
                "titles_count": POST_TITLES,
                "title_len": POST_TITLE_HINT,
                "blocks_max": DRAFT_BLOCKS_MAX,
            },
        )
    if kind == "page_seo":
        facts, ctx = await build_page_seo_context(db, tenant, body)
        return facts, ctx, {"title_max": META_TITLE_MAX, "desc_max": META_DESC_MAX}
    if kind == "board":
        facts, ctx = await build_board_context(db, tenant, body)
        return (
            facts,
            ctx,
            {
                "desc_max": BOARD_DESC_MAX,
                "fields_max": BOARD_FIELDS_MAX,
                "categories_max": BOARD_CATEGORIES_MAX,
                "field_types": "|".join(
                    t for t in FIELD_TYPES if t not in _SKIPPED_FIELD_TYPES
                ),
                "board_types": "|".join(BOARD_TYPES),
            },
        )
    ctx = AssistContext(allow_keywords=keywords_allowed(tenant.plan_type))
    facts = await build_assist_facts(db, tenant, kind)
    if kind == "seo":
        return (
            facts,
            ctx,
            {
                "title_max": META_TITLE_MAX,
                "desc_max": META_DESC_MAX,
                "keywords_max": KEYWORDS_MAX,
                "keyword_len": KEYWORD_MAX_LENGTH,
            },
        )
    return (
        facts,
        ctx,
        {
            "desc_max": GEO_DESCRIPTION_MAX,
            "topics_max": GEO_TOPICS_MAX,
            "topic_len": GEO_TOPIC_LENGTH,
        },
    )


async def assist(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    kind: str,
    body: AssistRequest,
) -> AssistResponse:
    flag = ASSIST_FLAGS.get(kind)
    if flag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=UNKNOWN_KIND_MESSAGE
        )
    if not await feature_service.is_enabled(db, tenant_id, flag):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=FEATURE_OFF_MESSAGE
        )

    await ai_service.ensure_not_abusing(tenant_id)
    tenant = await ai_service._get_tenant(db, tenant_id)
    limit = ai_service.monthly_limit(tenant.plan_type)
    used = await ai_service.copy_quota_used(db, tenant_id)

    facts, ctx, limits = await _prepare(db, tenant, kind, body)
    # 게시판 추천은 말투를 받지 않는다
    tone = body.tone if kind in ("seo", "geo", "page_seo") else "trust"
    cache_key = _cache_key(tenant_id, kind, tone, {**facts, "kw": ctx.allow_keywords})
    cached = await _get_cached(cache_key)
    if cached is not None:
        # 같은 입력이면 다시 부르지 않는다 — 비용 0, 사용량도 그대로
        return AssistResponse(
            result=RESULT_MODELS[kind].model_validate(cached),
            usage=_usage(used, limit),
        )

    if limit is not None and used >= limit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=LIMIT_MESSAGE
        )

    messages = build_assist_messages(
        kind="post_faq" if ctx.faq else kind,
        tone=tone,
        template_type=tenant.template_type,
        facts_json=json.dumps(facts, ensure_ascii=False),
        limits=limits,
        keywords_allowed=ctx.allow_keywords,
    )
    result, tokens = await generate(kind, messages, ctx)

    db.add(
        AiUsageLog(
            tenant_id=tenant_id,
            user_id=user_id,
            action_type=action_type(kind),
            tokens_used=tokens,
        )
    )
    await db.commit()
    await _set_cached(cache_key, result)
    logger.info(
        "ai_cost action=%s tenant=%s tokens=%d cost_usd=%.6f",
        action_type(kind),
        tenant_id,
        tokens,
        ai_service.estimate_cost_usd(tokens),
    )
    return AssistResponse(result=result, usage=_usage(used + 1, limit))
