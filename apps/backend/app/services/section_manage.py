"""섹션 추가 · 삭제 + 요금제 섹션 수 한도 (기획서 AD-02 · 3.2 · 오픈 이슈 #6, T-037-A).

- BASIC: 5개 고정 — 추가 · 삭제 불가 (처음 만들어진 섹션은 그대로 둔다)
- STANDARD: 홈 섹션 10개까지 / PREMIUM: 무제한
- 한도는 서버에서 강제한다 (오픈 이슈 #6 — 화면 제한만으로는 API 직접 호출을 못 막음)
- 코드형 템플릿은 매니페스트의 정해진 구성으로 그려져 추가 · 삭제가 의미 없다 → 숨기기만
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.section import Section, SectionSetting
from app.models.template import Template, TenantTemplateOverride
from app.models.tenant import Tenant
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


@dataclass
class SectionLimits:
    plan_type: str
    count: int
    limit: int | None
    can_add: bool
    can_delete: bool
    reason: str | None
    addable_types: list[dict[str, str]] = field(default_factory=list)


async def _plan_type(db: AsyncSession, tenant_id: UUID) -> str:
    tenant = await db.get(Tenant, tenant_id)
    return tenant.plan_type if tenant else "BASIC"


async def _uses_code_template(db: AsyncSession, tenant_id: UUID) -> bool:
    row = await db.execute(
        select(Template.renderer)
        .join(TenantTemplateOverride, TenantTemplateOverride.template_id == Template.id)
        .where(TenantTemplateOverride.tenant_id == tenant_id)
    )
    return row.scalar_one_or_none() == "code"


async def _home_count(db: AsyncSession, tenant_id: UUID) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(Section)
        .where(
            Section.tenant_id == tenant_id,
            Section.page_key == HOME_PAGE,
            Section.deleted_at.is_(None),
        )
    )
    return int(result.scalar_one())


async def get_limits(db: AsyncSession, tenant_id: UUID) -> SectionLimits:
    plan = await _plan_type(db, tenant_id)
    count = await _home_count(db, tenant_id)
    limit = SECTION_LIMITS.get(plan, SECTION_LIMITS["BASIC"])
    types = [
        {"section_type": t, "label": label} for t, label in THEME_SECTION_TYPES.items()
    ]

    if await _uses_code_template(db, tenant_id):
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


async def add_section(
    db: AsyncSession,
    tenant_id: UUID,
    section_type: str,
    label: str | None,
) -> UUID:
    limits = await get_limits(db, tenant_id)
    if not limits.can_add:
        raise SectionLimitError(limits.reason or "PLAN_LIMIT_EXCEEDED")
    if section_type not in THEME_SECTION_TYPES:
        raise SectionTypeError("이 템플릿에서 쓸 수 없는 섹션 종류입니다.")

    name = (label or "").strip() or THEME_SECTION_TYPES[section_type]
    if len(name) > LABEL_MAX_LEN:
        raise SectionTypeError(f"섹션 이름은 {LABEL_MAX_LEN}자 이하여야 합니다.")

    last = await db.execute(
        select(func.max(Section.display_order)).where(
            Section.tenant_id == tenant_id,
            Section.page_key == HOME_PAGE,
            Section.deleted_at.is_(None),
        )
    )
    max_order = last.scalar_one_or_none()
    now = datetime.now(UTC)
    section_id = uuid.uuid4()
    db.add(
        Section(
            id=section_id,
            tenant_id=tenant_id,
            section_type=section_type,
            label=name,
            display_order=(max_order + 1) if max_order is not None else 0,
            is_active=True,
            page_key=HOME_PAGE,
            created_at=now,
            updated_at=now,
        )
    )
    for key, value in STARTER_SETTINGS.get(section_type, {}).items():
        db.add(
            SectionSetting(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                section_id=section_id,
                field_key=key,
                field_value=value,
                value_type="JSON" if value.startswith("[") else "STRING",
                is_sample=True,
                created_at=now,
                updated_at=now,
            )
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

    limits = await get_limits(db, tenant_id)
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
