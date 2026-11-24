"""AI 보조 (관리자 화면 개선 · AI 보조 기획서 2장, T-231-B).

`POST /ai/assist/{kind}` — kind 마다 서버가 사이트 정보를 직접 읽어 프롬프트를 만들고,
모델 답을 결과 스키마로 검증(한 번 다시 묻고 그래도 안 되면 502)한 뒤 저장 API 와 같은
규칙으로 잘라서 돌려준다. 저장은 하지 않는다 — 화면이 폼에 채우고 관리자가 저장한다.

- 한도: 'AI 문구 추천' 월 한도를 함께 쓴다 (ai.copy_quota_used)
- 분당 제한 · 같은 입력 1시간 캐시 · ai_usage_log(action_type = assist_{kind})
"""

import hashlib
import json
import logging
import uuid
from typing import Any

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.redis import get_redis
from app.models.ai import AiUsageLog
from app.models.section import Section
from app.models.site import SiteSetting
from app.models.tenant import Tenant
from app.schemas.ai_assist import (
    AssistResponse,
    AssistResult,
    AssistUsage,
    GeoAssistResult,
    SeoAssistResult,
)
from app.schemas.seo import GEO_DESCRIPTION_MAX, GEO_TOPIC_LENGTH, GEO_TOPICS_MAX
from app.services import ai as ai_service
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

# kind → 기능 스위치. board · post · policy_summary 는 T-232-B ~ T-234-B 에서 더한다
ASSIST_FLAGS: dict[str, str] = {"seo": AI_SITE_ASSIST, "geo": AI_SITE_ASSIST}

META_TITLE_MAX = 60
META_DESC_MAX = 160
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


def parse_assist_result(
    kind: str, content: str, *, allow_keywords: bool
) -> AssistResult:
    """모델 답 → 결과 스키마. 모양이 맞지 않거나 필수 글이 비면 ValueError."""
    try:
        parsed = json.loads(ai_service._strip_code_fence(content))
    except json.JSONDecodeError as exc:
        raise ValueError("AI 응답을 JSON 으로 읽을 수 없습니다.") from exc
    if not isinstance(parsed, dict):
        raise ValueError("AI 응답이 객체가 아닙니다.")

    try:
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
                    if allow_keywords
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
    sections = (
        (
            await db.execute(
                select(Section)
                .where(Section.deleted_at.is_(None), Section.is_active.is_(True))
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

    facts: dict[str, Any] = {
        "업종": tenant.template_type,
        "사이트명": (site.site_name if site else None) or tenant.name,
        "회사명": site.company_name if site else None,
        "업태": site.business_type if site else None,
        "종목": site.business_item if site else None,
        "지역": _area(site.address) if site else None,
        "운영시간": _hours_summary(site) if site else None,
        "주차": site.parking if site else None,
        "섹션 제목": titles,
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
    kind: str, messages: list, *, allow_keywords: bool
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
            return parse_assist_result(
                kind, content, allow_keywords=allow_keywords
            ), tokens
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


async def assist(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    kind: str,
    tone: str,
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
    allow_keywords = keywords_allowed(tenant.plan_type)

    facts = await build_assist_facts(db, tenant, kind)
    cache_key = _cache_key(tenant_id, kind, tone, {**facts, "kw": allow_keywords})
    cached = await _get_cached(cache_key)
    if cached is not None:
        # 같은 입력이면 다시 부르지 않는다 — 비용 0, 사용량도 그대로
        model = SeoAssistResult if kind == "seo" else GeoAssistResult
        return AssistResponse(
            result=model.model_validate(cached), usage=_usage(used, limit)
        )

    if limit is not None and used >= limit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=LIMIT_MESSAGE
        )

    messages = build_assist_messages(
        kind=kind,
        tone=tone,
        template_type=tenant.template_type,
        facts_json=json.dumps(facts, ensure_ascii=False),
        limits=(
            {
                "title_max": META_TITLE_MAX,
                "desc_max": META_DESC_MAX,
                "keywords_max": KEYWORDS_MAX,
                "keyword_len": KEYWORD_MAX_LENGTH,
            }
            if kind == "seo"
            else {
                "desc_max": GEO_DESCRIPTION_MAX,
                "topics_max": GEO_TOPICS_MAX,
                "topic_len": GEO_TOPIC_LENGTH,
            }
        ),
        keywords_allowed=allow_keywords,
    )
    result, tokens = await generate(kind, messages, allow_keywords=allow_keywords)

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
