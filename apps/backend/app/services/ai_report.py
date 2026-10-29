"""AI 월간 분석 리포트 (기획서 13.2 기능 3 · 13.4, T-073-A).

- 규칙 기반 점검이 기본: 제목 · 버튼 · 문의 섹션 · 글 길이 · 사진 · SEO ·
  샘플 문구 · 방문 · 문의 추이
- AI 키가 있으면 요약 · 항목 설명을 자연스럽게 다듬는다
  (실제로 있는 항목만, 실패하면 규칙 결과 그대로)
- 요금제: STANDARD 월 1회(자동) · PREMIUM 월 4회(자동 1 + 직접 3), 그 외 403
"""

import json
import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.ai import AiReport, AiUsageLog
from app.models.analytics import SiteAnalytics
from app.models.inquiry import Inquiry
from app.models.section import Section
from app.models.seo import SeoSetting
from app.models.tenant import Tenant
from app.services import ai as ai_service
from app.services.rich_text import RICH_TEXT_VALUE_TYPE, to_plain_text

logger = logging.getLogger("app.ai")

ACTION_MONTHLY_REPORT = "ANALYSIS_REPORT"
# 기획서 13.4 — 한 달에 만들 수 있는 리포트 수 (자동 포함)
REPORT_LIMITS: dict[str, int] = {"STANDARD": 1, "PREMIUM": 4}
PLAN_REQUIRED_MESSAGE = "AI 월간 리포트는 STANDARD 이상 요금제에서 쓸 수 있습니다."

TITLE_MIN = 8
INTRO_MAX = 400


# ── 기간 ──────────────────────────────────────────────────────────────────


def month_start(day: date) -> date:
    return day.replace(day=1)


def previous_month(day: date) -> date:
    return month_start(month_start(day) - timedelta(days=1))


def next_month(day: date) -> date:
    return month_start(month_start(day) + timedelta(days=32))


# ── 수집 ──────────────────────────────────────────────────────────────────


async def collect_metrics(db: AsyncSession, tenant_id: uuid.UUID, period: date) -> dict:
    """이번 달 · 지난달 방문 · 문의 (리포트 숫자 요약)."""

    async def visits(start: date) -> tuple[int, int, int]:
        row = (
            await db.execute(
                select(
                    func.coalesce(func.sum(SiteAnalytics.unique_visitors), 0),
                    func.coalesce(func.sum(SiteAnalytics.page_views), 0),
                    func.coalesce(func.sum(SiteAnalytics.mobile_views), 0),
                ).where(
                    SiteAnalytics.tenant_id == tenant_id,
                    SiteAnalytics.date >= start,
                    SiteAnalytics.date < next_month(start),
                )
            )
        ).one()
        return int(row[0]), int(row[1]), int(row[2])

    async def inquiries(start: date) -> int:
        begin = datetime(start.year, start.month, 1, tzinfo=UTC)
        end_day = next_month(start)
        end = datetime(end_day.year, end_day.month, 1, tzinfo=UTC)
        return int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(Inquiry)
                    .where(
                        Inquiry.tenant_id == tenant_id,
                        Inquiry.created_at >= begin,
                        Inquiry.created_at < end,
                    )
                )
            ).scalar_one()
        )

    prev = previous_month(period)
    visitors, page_views, mobile = await visits(period)
    prev_visitors, _, _ = await visits(prev)
    return {
        "period": period.isoformat(),
        "visitors": visitors,
        "prev_visitors": prev_visitors,
        "page_views": page_views,
        "mobile_ratio": round(mobile / page_views, 2) if page_views else None,
        "inquiries": await inquiries(period),
        "prev_inquiries": await inquiries(prev),
    }


def _plain(section: Section, key: str) -> str:
    for s in section.settings:
        if s.field_key == key and s.field_value:
            if s.value_type == RICH_TEXT_VALUE_TYPE:
                return to_plain_text(s.field_value).strip()
            return s.field_value.strip()
    return ""


def _item(code: str, title: str, detail: str, section: Section | None = None) -> dict:
    item: dict[str, Any] = {"code": code, "title": title, "detail": detail}
    if section is not None:
        item["section_id"] = str(section.id)
        item["section_label"] = section.label
    return item


def run_checks(
    sections: list[Section], seo: SeoSetting | None, metrics: dict
) -> tuple[list[dict], list[dict]]:
    """규칙 기반 점검 → (강점, 개선 필요)."""
    strengths: list[dict] = []
    improvements: list[dict] = []
    home = [s for s in sections if s.is_active and (s.page_key or "home") == "home"]
    by_type: dict[str, Section] = {}
    for s in home:
        by_type.setdefault(s.section_type, s)

    hero = by_type.get("HERO_BANNER")
    if hero is not None:
        title = _plain(hero, "main_title")
        if not title:
            improvements.append(
                _item(
                    "hero_title_missing",
                    "메인 제목이 비어 있어요",
                    "첫 화면에 사업체를 한 줄로 소개하는 제목을 넣어 주세요.",
                    hero,
                )
            )
        elif len(title) < TITLE_MIN:
            improvements.append(
                _item(
                    "hero_title_short",
                    "메인 제목이 너무 짧아요",
                    f"'{title}' — 무엇을 잘하는 곳인지 한 마디 더해 보세요.",
                    hero,
                )
            )
        else:
            strengths.append(
                _item("hero_title_ok", "메인 제목이 분명해요", title, hero)
            )
        if _plain(hero, "cta_text") and _plain(hero, "cta_url"):
            strengths.append(
                _item(
                    "cta_ok",
                    "행동 버튼이 있어요",
                    "첫 화면에서 바로 문의 · 예약으로 이어집니다.",
                    hero,
                )
            )
        else:
            improvements.append(
                _item(
                    "cta_missing",
                    "첫 화면에 버튼이 없어요",
                    "'상담 예약' · '문의하기' 같은 버튼을 메인 배너에 넣어 보세요.",
                    hero,
                )
            )
        if not _plain(hero, "bg_image_url"):
            improvements.append(
                _item(
                    "hero_image_missing",
                    "메인 배너 사진이 없어요",
                    "사업체 분위기가 보이는 사진 한 장이 첫인상을 좌우합니다.",
                    hero,
                )
            )

    if "CONTACT" in by_type:
        strengths.append(
            _item(
                "contact_ok",
                "문의 받는 곳이 있어요",
                "방문자가 홈페이지에서 바로 문의를 남길 수 있어요.",
                by_type["CONTACT"],
            )
        )
    else:
        improvements.append(
            _item(
                "contact_missing",
                "문의 섹션이 없어요",
                "방문자가 연락할 방법이 없으면 문의로 이어지지 않아요.",
            )
        )

    intro = by_type.get("INTRO")
    if intro is not None and len(_plain(intro, "intro_text")) > INTRO_MAX:
        improvements.append(
            _item(
                "intro_long",
                "소개 글이 길어요",
                f"{INTRO_MAX}자 이내로 줄이면 끝까지 읽힐 가능성이 높아져요.",
                intro,
            )
        )

    samples = sum(1 for s in home for st in s.settings if st.is_sample)
    if samples:
        improvements.append(
            _item(
                "sample_left",
                f"샘플 문구 · 사진 {samples}개가 남아 있어요",
                "템플릿 예시 내용을 우리 사업체 내용으로 바꿔 주세요.",
            )
        )

    if seo is None or not (seo.meta_description or "").strip():
        improvements.append(
            _item(
                "seo_description_missing",
                "검색 결과 설명이 없어요",
                "SEO 설정에서 검색 결과 아래에 보일 설명(150자 내외)을 넣어 주세요.",
            )
        )
    else:
        strengths.append(
            _item(
                "seo_ok",
                "검색 결과 설명이 있어요",
                "네이버 · 구글에 소개 문구가 보입니다.",
            )
        )

    visitors, prev_v = metrics["visitors"], metrics["prev_visitors"]
    if visitors == 0:
        improvements.append(
            _item(
                "no_visitors",
                "이번 달 방문자가 없어요",
                "SEO 설정의 검색 등록 안내를 따라 네이버 · 구글에 등록해 보세요.",
            )
        )
    elif prev_v and visitors > prev_v:
        strengths.append(
            _item(
                "visitors_up", "방문자가 늘었어요", f"지난달 {prev_v}명 → {visitors}명"
            )
        )
    inquiries, prev_i = metrics["inquiries"], metrics["prev_inquiries"]
    if prev_i and inquiries < prev_i:
        improvements.append(
            _item(
                "inquiries_down",
                "문의가 줄었어요",
                f"지난달 {prev_i}건 → {inquiries}건. 버튼 문구 · 위치를 바꿔 보세요.",
            )
        )
    elif inquiries > prev_i:
        strengths.append(
            _item(
                "inquiries_up", "문의가 늘었어요", f"지난달 {prev_i}건 → {inquiries}건"
            )
        )
    return strengths, improvements


def rule_summary(
    tenant: Tenant, metrics: dict, strengths: list, improvements: list
) -> str:
    return (
        f"{tenant.name}의 {metrics['period'][:7]} 홈페이지 점검 결과입니다. "
        f"방문자 {metrics['visitors']}명, 문의 {metrics['inquiries']}건. "
        f"잘 되고 있는 점 {len(strengths)}가지, "
        f"손보면 좋은 점 {len(improvements)}가지를 찾았어요."
    )


# ── AI 다듬기 ─────────────────────────────────────────────────────────────


def build_messages(
    tenant: Tenant, metrics: dict, strengths: list, improvements: list
) -> list[BaseMessage]:
    items = [
        {"code": i["code"], "title": i["title"], "detail": i["detail"]}
        for i in strengths + improvements
    ]
    system = (
        "너는 소상공인 홈페이지 컨설턴트다. "
        "점검 결과를 사장님이 이해하기 쉬운 한국어로 다듬는다. "
        "새 항목을 만들지 말고 주어진 code 만 쓴다. 반드시 JSON 만 출력: "
        '{"summary": "3문장 이내 총평", "details": {"code": "다듬은 설명(60자 이내)"}}'
    )
    human = (
        f"사업체: {tenant.name} (업종 {tenant.template_type})\n"
        f"숫자: {json.dumps(metrics, ensure_ascii=False)}\n"
        f"점검 항목: {json.dumps(items, ensure_ascii=False)}"
    )
    return [SystemMessage(content=system), HumanMessage(content=human)]


def apply_polish(
    content: str, strengths: list, improvements: list
) -> tuple[str, list, list]:
    """모델 응답 → (요약, 강점, 개선). 모르는 code 는 무시. 형식이 틀리면 ValueError."""
    text = content.strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("JSON 없음")
    data = json.loads(text[start : end + 1])
    summary = str(data.get("summary") or "").strip()
    if not summary:
        raise ValueError("요약 없음")
    details = data.get("details") or {}
    if not isinstance(details, dict):
        details = {}

    def polish(items: list) -> list:
        out = []
        for item in items:
            new = details.get(item["code"])
            out.append(
                {**item, "detail": str(new)[:120]}
                if isinstance(new, str) and new.strip()
                else item
            )
        return out

    return summary[:600], polish(strengths), polish(improvements)


# ── 생성 · 조회 ───────────────────────────────────────────────────────────


async def count_this_month(db: AsyncSession, tenant_id: uuid.UUID, today: date) -> int:
    start = datetime(today.year, today.month, 1, tzinfo=UTC)
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(AiReport)
                .where(AiReport.tenant_id == tenant_id, AiReport.created_at >= start)
            )
        ).scalar_one()
    )


def report_limit(plan_type: str | None) -> int:
    return REPORT_LIMITS.get((plan_type or "").upper(), 0)


async def generate_report(
    db: AsyncSession,
    tenant: Tenant,
    *,
    kind: str,
    period: date,
    user_id: uuid.UUID | None = None,
) -> AiReport:
    """리포트 하나 만들기 (한도 확인은 호출한 쪽)."""
    sections = list(
        (
            await db.execute(
                select(Section)
                .where(Section.tenant_id == tenant.id, Section.deleted_at.is_(None))
                .options(selectinload(Section.settings))
                .order_by(Section.display_order)
            )
        )
        .scalars()
        .all()
    )
    seo = (
        await db.execute(select(SeoSetting).where(SeoSetting.tenant_id == tenant.id))
    ).scalar_one_or_none()
    metrics = await collect_metrics(db, tenant.id, period)
    strengths, improvements = run_checks(sections, seo, metrics)
    summary = rule_summary(tenant, metrics, strengths, improvements)
    source = "rule"

    if settings.openai_api_key:
        try:
            content, tokens = await ai_service._call_model(
                build_messages(tenant, metrics, strengths, improvements)
            )
            summary, strengths, improvements = apply_polish(
                content, strengths, improvements
            )
            source = "ai"
            db.add(
                AiUsageLog(
                    tenant_id=tenant.id,
                    user_id=user_id,
                    action_type=ACTION_MONTHLY_REPORT,
                    tokens_used=tokens,
                )
            )
        except Exception:  # noqa: BLE001 - 모델 장애 · 응답 이상 → 규칙 결과로
            logger.warning("AI 리포트 다듬기 실패 — 규칙 결과로", exc_info=True)

    report = AiReport(
        tenant_id=tenant.id,
        period=period,
        kind=kind,
        source=source,
        summary=summary,
        metrics=metrics,
        strengths=strengths,
        improvements=improvements,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report


async def create_manual_report(
    db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID
) -> AiReport:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    limit = report_limit(tenant.plan_type)
    if limit == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=PLAN_REQUIRED_MESSAGE
        )
    today = datetime.now(UTC).date()
    if await count_this_month(db, tenant_id, today) >= limit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"이번 달 리포트는 {limit}번까지 만들 수 있습니다. "
                "다음 달 1일에 새로 만들어져요."
            ),
        )
    # 직접 만들기는 이번 달 지금까지를 본다
    await ai_service.ensure_not_abusing(tenant_id)
    return await generate_report(
        db, tenant, kind="MANUAL", period=month_start(today), user_id=user_id
    )


async def list_reports(db: AsyncSession, tenant_id: uuid.UUID) -> list[AiReport]:
    return list(
        (
            await db.execute(
                select(AiReport)
                .where(AiReport.tenant_id == tenant_id)
                .order_by(AiReport.created_at.desc())
                .limit(24)
            )
        )
        .scalars()
        .all()
    )


async def get_report(
    db: AsyncSession, tenant_id: uuid.UUID, report_id: uuid.UUID
) -> AiReport:
    report = (
        await db.execute(
            select(AiReport).where(
                AiReport.id == report_id, AiReport.tenant_id == tenant_id
            )
        )
    ).scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    return report


async def quota(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    tenant = await db.get(Tenant, tenant_id)
    limit = report_limit(tenant.plan_type if tenant else None)
    used = await count_this_month(db, tenant_id, datetime.now(UTC).date())
    return {"used": used, "limit": limit, "remaining": max(limit - used, 0)}
