"""AI 템플릿 추천 (기획서 13.4, T-070-A).

업종 · 홈페이지 내용 · 요금제로 쓸 수 있는 템플릿 중 어울리는 3개를 이유와 함께 고른다.
- AI 키가 없거나 장애 · 응답 이상이면 업종 기준 기본 추천으로 (source="rule")
- AI 가 무엇을 말하든 실제로 있고 잠기지 않은 후보만 돌려준다
"""

import hashlib
import json
import logging
import uuid

from fastapi import HTTPException, status
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import get_redis
from app.models.ai import AiUsageLog
from app.models.template import Template
from app.models.tenant import Tenant
from app.schemas.ai import TemplateRecommendation, TemplateRecommendResponse
from app.services import ai as ai_service
from app.services import template as template_service

logger = logging.getLogger("app.ai")

ACTION_TEMPLATE_RECOMMEND = "TEMPLATE_RECOMMEND"
RECOMMEND_COUNT = 3
ALLOWED_PLANS = frozenset({"STANDARD", "PREMIUM"})
PLAN_REQUIRED_MESSAGE = "AI 템플릿 추천은 STANDARD 이상 요금제에서 쓸 수 있습니다."
_CACHE_TTL = 60 * 60  # 1시간 — 내용 · 후보가 바뀌면 키가 달라진다

INDUSTRY_LABELS = {
    "HOSPITAL": "병원·의원",
    "PENSION": "펜션·숙박",
    "STARTUP": "스타트업·IT",
    "GENERAL": "일반",
}


def _industry(code: str | None) -> str:
    return INDUSTRY_LABELS.get((code or "").upper(), code or "일반")


def rule_based(
    tenant_industry: str, candidates: list[Template], count: int = RECOMMEND_COUNT
) -> list[TemplateRecommendation]:
    """업종이 같은 템플릿 → 범용 → 나머지 순. 같은 순위는 이름순."""

    def rank(t: Template) -> tuple[int, str]:
        if t.template_type == tenant_industry:
            return (0, t.name)
        if t.template_type == "GENERAL":
            return (1, t.name)
        return (2, t.name)

    picked = sorted(candidates, key=rank)[:count]
    result = []
    for t in picked:
        if t.template_type == tenant_industry:
            reason = f"{_industry(tenant_industry)} 업종에 맞춰 만든 템플릿입니다."
        elif t.template_type == "GENERAL":
            reason = "어느 업종에나 무난하게 어울리는 범용 템플릿입니다."
        else:
            style = _industry(t.template_type)
            reason = f"{style} 분위기의 다른 스타일을 시도해 볼 수 있어요."
        result.append(
            TemplateRecommendation(template_id=str(t.id), name=t.name, reason=reason)
        )
    return result


def build_messages(
    tenant: Tenant, site_summary: str, candidates: list[Template]
) -> list[BaseMessage]:
    lines = [
        f"{i}. {t.name} | 업종: {_industry(t.template_type)} | {t.description or ''}"
        for i, t in enumerate(candidates, start=1)
    ]
    system = (
        "너는 소상공인 홈페이지 디자인 컨설턴트다. "
        f"후보 템플릿 중 사업체에 가장 어울리는 {RECOMMEND_COUNT}개를 골라 "
        "한국어로 짧은 이유(40자 이내)를 단다. "
        '반드시 JSON 배열만 출력: [{"index": 후보번호, "reason": "이유"}]'
    )
    human = (
        f"사업체: {tenant.name}\n업종: {_industry(tenant.template_type)}\n"
        f"홈페이지 내용 요약:\n{site_summary or '(아직 내용 없음)'}\n\n"
        "후보 템플릿:\n" + "\n".join(lines)
    )
    return [SystemMessage(content=system), HumanMessage(content=human)]


def parse_recommendations(
    content: str, candidates: list[Template]
) -> list[TemplateRecommendation]:
    """모델 응답 → 추천. 없는 번호 · 중복 · 빈 이유는 버린다 (없으면 ValueError)."""
    text = content.strip()
    start, end = text.find("["), text.rfind("]")
    if start < 0 or end <= start:
        raise ValueError("JSON 배열 없음")
    try:
        items = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ValueError("JSON 해석 실패") from exc
    result: list[TemplateRecommendation] = []
    seen: set[int] = set()
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        index, reason = item.get("index"), str(item.get("reason") or "").strip()
        if not isinstance(index, int) or not 1 <= index <= len(candidates):
            continue
        if index in seen or not reason:
            continue
        seen.add(index)
        t = candidates[index - 1]
        result.append(
            TemplateRecommendation(
                template_id=str(t.id), name=t.name, reason=reason[:80]
            )
        )
        if len(result) >= RECOMMEND_COUNT:
            break
    if not result:
        raise ValueError("쓸 수 있는 추천 없음")
    return result


def _summarize(site_context: dict) -> str:
    """AI 에 넘길 홈페이지 내용 — 글자 칸만, 길이 제한."""
    parts: list[str] = []
    for section in site_context.get("sections", []):
        if not section.get("is_active"):
            continue
        texts = [
            v
            for v in (section.get("fields") or {}).values()
            if isinstance(v, str)
            and v
            and not v.lstrip().startswith(("[", "{", "http"))
        ]
        if texts:
            parts.append(f"- {section.get('label')}: " + " / ".join(texts)[:200])
    return "\n".join(parts)[:1500]


def _cache_key(tenant_id: uuid.UUID, summary: str, candidates: list[Template]) -> str:
    raw = summary + "|" + ",".join(str(t.id) for t in candidates)
    return f"ai:tplrec:{tenant_id}:{hashlib.sha256(raw.encode()).hexdigest()[:24]}"


async def _cached(key: str) -> list[TemplateRecommendation] | None:
    try:
        raw = await (await get_redis()).get(key)
    except Exception:  # noqa: BLE001 - 캐시는 best-effort
        return None
    if not raw:
        return None
    return [TemplateRecommendation(**r) for r in json.loads(raw)]


async def _store(key: str, recs: list[TemplateRecommendation]) -> None:
    try:
        await (await get_redis()).setex(
            key,
            _CACHE_TTL,
            json.dumps([r.model_dump() for r in recs], ensure_ascii=False),
        )
    except Exception:  # noqa: BLE001
        pass


async def recommend_templates(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    refresh: bool = False,
) -> TemplateRecommendResponse:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    if (tenant.plan_type or "").upper() not in ALLOWED_PLANS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=PLAN_REQUIRED_MESSAGE
        )

    items, current_id = await template_service.list_templates(db, tenant_id)
    candidates = [t for t, locked in items if not locked and t.id != current_id]
    if not candidates:
        return TemplateRecommendResponse(recommendations=[], source="rule")

    summary = _summarize(await ai_service.build_site_context(db, tenant_id))
    if not settings.openai_api_key:
        # 키가 없으면 모델을 부르지 않는다 (개발 · CI)
        return TemplateRecommendResponse(
            recommendations=rule_based(tenant.template_type, candidates), source="rule"
        )

    key = _cache_key(tenant_id, summary, candidates)
    if not refresh:
        hit = await _cached(key)
        if hit is not None:
            return TemplateRecommendResponse(recommendations=hit, source="ai")

    await ai_service.ensure_not_abusing(tenant_id)
    try:
        content, tokens = await ai_service._call_model(
            build_messages(tenant, summary, candidates)
        )
        recs = parse_recommendations(content, candidates)
    except Exception:  # noqa: BLE001 - 모델 장애 · 응답 이상 → 기본 추천
        logger.warning("AI 템플릿 추천 실패 — 기본 추천으로", exc_info=True)
        return TemplateRecommendResponse(
            recommendations=rule_based(tenant.template_type, candidates), source="rule"
        )

    db.add(
        AiUsageLog(
            tenant_id=tenant_id,
            user_id=user_id,
            action_type=ACTION_TEMPLATE_RECOMMEND,
            tokens_used=tokens,
        )
    )
    await db.commit()
    await _store(key, recs)
    return TemplateRecommendResponse(recommendations=recs, source="ai")
