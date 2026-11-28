"""섹션 추가 · 삭제 + 요금제 섹션 수 한도 (기획서 AD-02 · 3.2 · 오픈 이슈 #6, T-037-A).

- BASIC: 5개 고정 — 추가 · 삭제 불가 (처음 만들어진 섹션은 그대로 둔다)
- STANDARD: 홈 섹션 10개까지 / PREMIUM: 무제한
- 한도는 서버에서 강제한다 (오픈 이슈 #6 — 화면 제한만으로는 API 직접 호출을 못 막음)
- 코드형 템플릿은 매니페스트의 정해진 구성으로 그려져 추가 · 삭제가 의미 없다 → 숨기기만
- 직접 만든 페이지(T-241)는 코드형 · 테마형 모두 추가 · 삭제 — 한도는 페이지마다
  같은 값. 코드형은 템플릿 샘플의 서브 페이지 섹션(상단 비주얼 · 사진+글 배치 ·
  연혁 · 오시는 길)을 샘플 값 그대로 넣는다
"""

import json
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.template_samples import load_sample
from app.models.page import Page
from app.models.section import Section, SectionSetting
from app.models.template import Template, TenantTemplateOverride
from app.models.tenant import Tenant
from app.services import feature as feature_service
from app.services import site_cache

HOME_PAGE = "home"
LABEL_MAX_LEN = 100

# 요금제별 홈 섹션 수 한도 — None 은 무제한
SECTION_LIMITS: dict[str, int | None] = {
    "FREE": 5,
    "BASIC": 5,
    "STANDARD": 10,
    "PREMIUM": None,
}
# FREE · BASIC 은 '고정' — 개수와 상관없이 추가 · 삭제를 막는다 (모르는 요금제도 고정)
FIXED_PLANS = frozenset({"FREE", "BASIC"})

# 테마형 템플릿 홈페이지가 그릴 수 있는 섹션 (client SectionRenderer)
THEME_SECTION_TYPES: dict[str, str] = {
    "HERO_BANNER": "메인 배너",
    "INTRO": "소개",
    "SERVICES": "서비스",
    "GALLERY": "갤러리",
    "CONTACT": "문의하기",
    "MAP": "지도",
    # 게시판 최신 글 (T-185) — 템플릿 기본 섹션이 아니라 테마 전환 때 만들지 않는다
    "BOARD_LATEST": "게시판 연결",
    # 독립 콘텐츠 (T-258) — CONTENT_MANAGE 가 켜진 사업체만 추가할 수 있다
    "CONTENT_LIST": "콘텐츠 연결",
}

# 새 섹션이 빈 화면이 되지 않도록 넣는 시작 문구 — '샘플' 표시가 붙어 바꾸도록 안내된다
STARTER_SETTINGS: dict[str, dict[str, str]] = {
    "HERO_BANNER": {
        "main_title": "새 메인 배너 제목을 입력하세요",
        "sub_copy": "짧은 소개 문구를 입력하세요",
    },
    "INTRO": {"intro_text": "사업체를 소개하는 글을 입력하세요."},
    "SERVICES": {"section_title": "서비스 안내", "services_list": "[]"},
    "GALLERY": {"section_title": "갤러리", "gallery_items": "[]"},
    "CONTACT": {"section_title": "문의하기", "description": "궁금한 점을 남겨 주세요."},
    "MAP": {"address": "주소를 입력하세요"},
    # 게시판은 고객이 고른다 — 고르기 전에는 홈페이지에 보이지 않는다
    "BOARD_LATEST": {"section_title": "최신 글"},
    # 유형은 고객이 고른다 — 고르기 전에는 홈페이지에 보이지 않는다
    "CONTENT_LIST": {"section_title": "콘텐츠"},
}

PLAN_FIXED_MESSAGE = (
    "현재 요금제에서는 섹션 구성이 고정되어 있습니다. "
    "STANDARD 이상에서 섹션을 추가 · 삭제할 수 있어요."
)
CODE_TEMPLATE_MESSAGE = (
    "이 템플릿은 정해진 구성으로 만들어져 섹션을 추가 · 삭제할 수 없습니다. "
    "필요 없는 섹션은 숨겨 주세요."
)


class SectionLimitError(Exception):
    """요금제 한도 · 고정 구성 — 422 PLAN_LIMIT_EXCEEDED."""


class SectionTypeError(ValueError):
    """지원하지 않는 섹션 종류 · 템플릿 — 400."""


class PageNotFoundError(LookupError):
    """섹션을 넣을 페이지가 없다 (지운 · 없는 · 스위치 꺼짐) — 404."""


PAGES_FEATURE = "CUSTOM_PAGES"
# 코드형 직접 페이지에 넣지 않는 섹션 — 메인 전용 · 게시판(공지 · 상담 · 예약 화면 전용)
CODE_PAGE_EXCLUDED = frozenset(
    {"HERO_SLIDER", "INTRO", "SERVICES", "VIDEO_PLAYLIST", "NOTICE_LATEST", "BOARD"}
)


@dataclass
class SectionLimits:
    plan_type: str
    count: int
    limit: int | None
    can_add: bool
    can_delete: bool
    reason: str | None
    addable_types: list[dict] = field(default_factory=list)


async def _plan_type(db: AsyncSession, tenant_id: UUID) -> str:
    tenant = await db.get(Tenant, tenant_id)
    return tenant.plan_type if tenant else "BASIC"


async def _code_template(db: AsyncSession, tenant_id: UUID) -> str | None:
    """코드형 템플릿이면 그 코드(없으면 ''), 테마형이면 None"""
    row = await db.execute(
        select(Template.renderer, Template.code)
        .join(TenantTemplateOverride, TenantTemplateOverride.template_id == Template.id)
        .where(TenantTemplateOverride.tenant_id == tenant_id)
    )
    found = row.first()
    if found is None or found.renderer != "code":
        return None
    return found.code or ""


async def _uses_code_template(db: AsyncSession, tenant_id: UUID) -> bool:
    return await _code_template(db, tenant_id) is not None


async def _page_count(db: AsyncSession, tenant_id: UUID, page_key: str) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(Section)
        .where(
            Section.tenant_id == tenant_id,
            Section.page_key == page_key,
            Section.deleted_at.is_(None),
        )
    )
    return int(result.scalar_one())


async def _is_custom_page(db: AsyncSession, tenant_id: UUID, page_key: str) -> bool:
    """섹션을 넣을 수 있는 직접 만든 페이지 — 스위치가 꺼졌으면 없다 (T-241)"""
    if not await feature_service.is_enabled(db, tenant_id, PAGES_FEATURE):
        return False
    found = await db.execute(
        select(Page.id).where(
            Page.tenant_id == tenant_id,
            Page.page_key == page_key,
            Page.origin == "CUSTOM",
            Page.deleted_at.is_(None),
        )
    )
    return found.scalar() is not None


# 사진+글 배치 이름 — 샘플 섹션 이름(브랜드 이야기 · 약속 …)은 내용이라 겹치고 낯설다
LAYOUT_LABELS: dict[str, str] = {
    "page-intro": "소개 문구",
    "media-row": "사진 + 글",
    "strength-list": "강점 목록",
    "area-rows": "영역 소개",
    "photo-gallery": "사진 모음",
    "consult-links": "상담 안내",
    "split-story": "좌우 이야기",
    "split-story-reverse": "좌우 이야기 (반대)",
    "milestone-split": "주요 이력",
    "banner-split": "배너 + 글",
    "criteria-cards": "기준 카드",
    "value-circles": "가치 소개",
}


def _sample_value(value: object) -> tuple[str, str]:
    if isinstance(value, str):
        return value, "STRING"
    return json.dumps(value, ensure_ascii=False), "JSON"


def _code_kind(sample: dict) -> dict | None:
    """샘플 섹션 하나 → 직접 페이지에 넣을 종류 (메인 전용 · 게시판이면 None)"""
    stype = sample.get("section_type")
    settings = sample.get("settings") or {}
    if stype in CODE_PAGE_EXCLUDED or not isinstance(settings, dict):
        return None
    variant = settings.get("layout") if stype == "CONTENT_BLOCK" else None
    return {
        "section_type": stype,
        "variant": variant,
        "label": LAYOUT_LABELS.get(variant or "") or sample.get("label") or stype,
        "settings": settings,
    }


def _code_sample_pages(code: str) -> list[tuple[str, list[dict]]]:
    """샘플 서브 페이지마다 넣을 수 있는 종류 [(page_key, [kind])] — 홈 제외"""
    return [
        (page_key, [k for k in map(_code_kind, sections) if k is not None])
        for page_key, sections in (load_sample(code).get("pages") or {}).items()
        if page_key != HOME_PAGE
    ]


def code_page_kinds(code: str) -> list[dict]:
    """코드형 직접 페이지에 넣을 수 있는 섹션 — 샘플 서브 페이지 섹션, 배치마다 하나.

    [{section_type, variant, label, settings}] — variant 는 사진+글 배치(layout),
    없으면 None.
    """
    kinds: list[dict] = []
    seen: set[tuple[str, str | None]] = set()
    for _, page_kinds in _code_sample_pages(code):
        for kind in page_kinds:
            if (kind["section_type"], kind["variant"]) in seen:
                continue
            seen.add((kind["section_type"], kind["variant"]))
            kinds.append(kind)
    return kinds


# 테마형 추천 구성 (T-247) — 직접 페이지는 위에 페이지 이름이 이미 나와 메인 배너는 뺀다
THEME_RECIPES: list[tuple[str, str, list[str]]] = [
    ("intro", "소개 페이지", ["INTRO", "GALLERY", "CONTACT"]),
    ("services", "서비스 안내", ["INTRO", "SERVICES", "CONTACT"]),
    ("location", "오시는 길", ["INTRO", "MAP", "CONTACT"]),
]


async def page_recipes(
    db: AsyncSession, tenant_id: UUID, titles: dict[str, str]
) -> list[dict]:
    """페이지 추가의 '추천 구성' (기획서 PM-02, T-247) — [{key, label, sections}].

    코드형은 템플릿 샘플의 서브 페이지 구성(넣을 수 있는 섹션 2개 이상) 그대로 ·
    샘플 값, 테마형은 THEME_RECIPES(갤러리는 스위치가 켜졌을 때만) · 시작 문구.
    titles 는 페이지 주소 → 이름 (코드형 구성 이름).
    """
    code = await _code_template(db, tenant_id)
    if code is not None:
        return [
            {"key": key, "label": titles.get(key, key), "sections": kinds}
            for key, kinds in _code_sample_pages(code)
            if len(kinds) >= 2
        ]
    gallery_on = await feature_service.is_enabled(db, tenant_id, "GALLERY_SECTION")
    return [
        {
            "key": key,
            "label": label,
            "sections": [
                {
                    "section_type": t,
                    "variant": None,
                    "label": THEME_SECTION_TYPES[t],
                    "settings": None,
                }
                for t in types
                if t != "GALLERY" or gallery_on
            ],
        }
        for key, label, types in THEME_RECIPES
    ]


async def add_recipe_sections(
    db: AsyncSession, tenant_id: UUID, page_key: str, sections: list[dict]
) -> None:
    """추천 구성 섹션을 새 페이지에 — 페이지 섹션 한도까지, commit 은 호출한 쪽에서"""
    limit = SECTION_LIMITS.get(await _plan_type(db, tenant_id), SECTION_LIMITS["BASIC"])
    for order, kind in enumerate(sections[:limit] if limit is not None else sections):
        await add_starter_section(
            db,
            tenant_id,
            kind["section_type"],
            kind["label"],
            order,
            page_key=page_key,
            settings=kind["settings"],
        )


async def get_limits(
    db: AsyncSession, tenant_id: UUID, page_key: str = HOME_PAGE
) -> SectionLimits:
    """page_key 페이지의 섹션 한도 · 넣을 수 있는 종류 (없으면 PageNotFoundError)"""
    plan = await _plan_type(db, tenant_id)
    code = await _code_template(db, tenant_id)
    custom = page_key != HOME_PAGE and await _is_custom_page(db, tenant_id, page_key)
    if page_key != HOME_PAGE and not custom and code is None:
        raise PageNotFoundError(page_key)
    count = await _page_count(db, tenant_id, page_key)
    limit = SECTION_LIMITS.get(plan, SECTION_LIMITS["BASIC"])
    gallery_on = await feature_service.is_enabled(db, tenant_id, "GALLERY_SECTION")
    contents_on = await feature_service.is_enabled(db, tenant_id, "CONTENT_MANAGE")
    if custom and code is not None:
        types = [
            {
                "section_type": k["section_type"],
                "label": k["label"],
                "variant": k["variant"],
            }
            for k in code_page_kinds(code)
        ]
    else:
        types = [
            {"section_type": t, "label": label}
            for t, label in THEME_SECTION_TYPES.items()
            if (t != "GALLERY" or gallery_on) and (t != "CONTENT_LIST" or contents_on)
        ]

    # 코드형 템플릿 기본 페이지는 정해진 구성 — 직접 만든 페이지만 추가 · 삭제
    if code is not None and not custom:
        return SectionLimits(plan, count, limit, False, False, CODE_TEMPLATE_MESSAGE)
    if plan in FIXED_PLANS or plan not in SECTION_LIMITS:
        return SectionLimits(plan, count, limit, False, False, PLAN_FIXED_MESSAGE)
    if limit is not None and count >= limit:
        reason = (
            f"현재 요금제는 섹션을 {limit}개까지 쓸 수 있습니다. "
            "섹션을 지우거나 PREMIUM 으로 올리면 더 추가할 수 있어요."
        )
        return SectionLimits(plan, count, limit, False, True, reason, types)
    return SectionLimits(plan, count, limit, True, True, None, types)


async def next_home_order(
    db: AsyncSession, tenant_id: UUID, page_key: str = HOME_PAGE
) -> int:
    """그 페이지(기본 홈) 맨 아래 순서"""
    last = await db.execute(
        select(func.max(Section.display_order)).where(
            Section.tenant_id == tenant_id,
            Section.page_key == page_key,
            Section.deleted_at.is_(None),
        )
    )
    max_order = last.scalar_one_or_none()
    return (max_order + 1) if max_order is not None else 0


async def add_starter_section(
    db: AsyncSession,
    tenant_id: UUID,
    section_type: str,
    label: str,
    display_order: int,
    page_key: str = HOME_PAGE,
    settings: dict | None = None,
) -> UUID:
    """시작 문구(샘플 표시)가 든 섹션 하나 — commit 은 호출한 쪽에서.

    settings 를 주면(코드형 샘플 값) 테마형 시작 문구 대신 그 값을 넣는다.
    """
    now = datetime.now(UTC)
    section_id = uuid.uuid4()
    db.add(
        Section(
            id=section_id,
            tenant_id=tenant_id,
            section_type=section_type,
            label=label,
            display_order=display_order,
            is_active=True,
            page_key=page_key,
            created_at=now,
            updated_at=now,
        )
    )
    starter: dict[str, tuple[str, str]] = (
        {key: _sample_value(value) for key, value in settings.items()}
        if settings is not None
        else {
            key: (value, "JSON" if value.startswith("[") else "STRING")
            for key, value in STARTER_SETTINGS.get(section_type, {}).items()
        }
    )
    for key, (value, value_type) in starter.items():
        db.add(
            SectionSetting(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                section_id=section_id,
                field_key=key,
                field_value=value,
                value_type=value_type,
                is_sample=True,
                created_at=now,
                updated_at=now,
            )
        )
    return section_id


async def add_section(
    db: AsyncSession,
    tenant_id: UUID,
    section_type: str,
    label: str | None,
    page_key: str = HOME_PAGE,
    variant: str | None = None,
) -> UUID:
    limits = await get_limits(db, tenant_id, page_key)
    if not limits.can_add:
        raise SectionLimitError(limits.reason or "PLAN_LIMIT_EXCEEDED")
    kind = next(
        (
            t
            for t in limits.addable_types
            if t["section_type"] == section_type and t.get("variant") == variant
        ),
        None,
    )
    if kind is None:
        raise SectionTypeError("이 템플릿에서 쓸 수 없는 섹션 종류입니다.")

    name = (label or "").strip() or kind["label"]
    if len(name) > LABEL_MAX_LEN:
        raise SectionTypeError(f"섹션 이름은 {LABEL_MAX_LEN}자 이하여야 합니다.")

    code = await _code_template(db, tenant_id)
    settings = None
    if code is not None:
        settings = next(
            k["settings"]
            for k in code_page_kinds(code)
            if k["section_type"] == section_type and k["variant"] == variant
        )
    section_id = await add_starter_section(
        db,
        tenant_id,
        section_type,
        name,
        await next_home_order(db, tenant_id, page_key),
        page_key=page_key,
        settings=settings,
    )
    await db.commit()
    await site_cache.purge_site(db, tenant_id)
    return section_id


async def delete_section(db: AsyncSession, tenant_id: UUID, section_id: UUID) -> bool:
    """소프트 삭제 + 남은 홈 섹션 순서 다시 매기기. 없는 섹션이면 False."""
    found = await db.execute(
        select(Section).where(
            Section.id == section_id,
            Section.tenant_id == tenant_id,
            Section.deleted_at.is_(None),
        )
    )
    section = found.scalar_one_or_none()
    if section is None:
        return False

    try:
        limits = await get_limits(db, tenant_id, section.page_key)
    except PageNotFoundError:
        # 지운 · 스위치 꺼진 직접 페이지의 섹션 — 고칠 곳이 없으니 지우지도 않는다
        raise SectionLimitError(PLAN_FIXED_MESSAGE) from None
    if not limits.can_delete:
        raise SectionLimitError(limits.reason or "PLAN_LIMIT_EXCEEDED")

    now = datetime.now(UTC)
    section.deleted_at = now
    section.updated_at = now
    await db.flush()

    remaining = await db.execute(
        select(Section.id)
        .where(
            Section.tenant_id == tenant_id,
            Section.page_key == section.page_key,
            Section.deleted_at.is_(None),
        )
        .order_by(Section.display_order)
    )
    for order, sid in enumerate(remaining.scalars().all()):
        await db.execute(
            update(Section)
            .where(Section.id == sid, Section.tenant_id == tenant_id)
            .values(display_order=order)
        )
    await db.commit()
    await site_cache.purge_site(db, tenant_id)
    return True
