"""T-055 템플릿 서비스.

- 템플릿 목록(플랜·업종 필터, 잠금 계산)
- 템플릿 적용 / 롤백 / CSS 커스터마이징 (이력 스냅샷 기반)
- 적용·커스터마이징 시 공개 사이트 캐시 퍼지로 즉시 반영

이력(TemplateChangeHistory) row 의미:
  template_id = 변경 직전(롤백 대상) 템플릿, before_css = 직전 css_overrides,
  after_css = 변경 후 css_overrides. 롤백은 최신 이력으로 복원 후 그 row를 삭제한다.
  content_snapshot = 샘플로 교체(content_mode=replace_with_sample)한 경우
  {"restored_section_ids": 교체 전 섹션, "created_section_ids": 샘플로 만든 섹션}
  — 섹션은 소프트 삭제라 롤백 시 교체 전 섹션을 되살리고 샘플 섹션은 숨긴다.
"""

import json
import logging
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.redis import get_redis
from app.db.session import set_rls_context, set_super_admin_context
from app.models.section import Section, SectionSetting
from app.models.template import (
    Template,
    TemplateChangeHistory,
    TenantTemplateOverride,
)
from app.models.tenant import Tenant
from app.schemas.public_site import (
    PublicSectionResponse,
    PublicSiteResponse,
    PublicTemplateResponse,
    PublicTenantResponse,
)
from app.services.template_assets import resolve_sample_value

logger = logging.getLogger("app.template")

# 플랜 등급 (낮을수록 하위). 템플릿 min_plan 미만이면 잠금.
PLAN_TIERS: dict[str, int] = {
    "FREE": 0,
    "BASIC": 1,
    "STANDARD": 2,
    "PREMIUM": 3,
}


def _tier(plan_type: str) -> int:
    return PLAN_TIERS.get((plan_type or "").upper(), 0)


def is_locked(plan_type: str, min_plan: str) -> bool:
    """테넌트 플랜이 템플릿 요구 최소 플랜보다 낮으면 잠금."""
    return _tier(plan_type) < _tier(min_plan)


async def _get_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> Tenant:
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="테넌트를 찾을 수 없습니다.",
        )
    return tenant


async def get_available_templates(
    db: AsyncSession,
    plan_type: str,
    industry: str | None = None,
) -> list[tuple[Template, bool]]:
    """활성 템플릿 목록과 (템플릿, 잠금여부) 튜플을 반환한다.

    industry 가 주어지면 해당 업종 + 범용(GENERAL) 템플릿만 노출한다.
    """
    stmt = select(Template).where(Template.is_active.is_(True))
    if industry:
        stmt = stmt.where(Template.template_type.in_([industry.upper(), "GENERAL"]))
    stmt = stmt.order_by(Template.template_type, Template.name)

    templates = list((await db.execute(stmt)).scalars().all())
    return [(t, is_locked(plan_type, t.min_plan)) for t in templates]


async def list_templates(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    industry: str | None = None,
) -> tuple[list[tuple[Template, bool]], uuid.UUID | None]:
    """엔드포인트용: 잠금 계산된 목록 + 현재 적용 중인 template_id."""
    tenant = await _get_tenant(db, tenant_id)
    items = await get_available_templates(db, tenant.plan_type, industry)
    override = await get_current_override(db, tenant_id)
    return items, (override.template_id if override else None)


async def get_current_override(
    db: AsyncSession, tenant_id: uuid.UUID
) -> TenantTemplateOverride | None:
    result = await db.execute(
        select(TenantTemplateOverride).where(
            TenantTemplateOverride.tenant_id == tenant_id
        )
    )
    return result.scalar_one_or_none()


async def _get_template(db: AsyncSession, template_id: uuid.UUID) -> Template:
    template = await db.get(Template, template_id)
    if not template or not template.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="템플릿을 찾을 수 없습니다.",
        )
    return template


async def _purge_site_cache(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    """공개 사이트/섹션 캐시 무효화 (best-effort)."""
    try:
        tenant = await db.get(Tenant, tenant_id)
        redis = await get_redis()
        keys = [f"sections:{tenant_id}"]
        if tenant:
            keys.append(f"site:{tenant.slug}")
        await redis.delete(*keys)
    except Exception:  # noqa: BLE001 - 캐시 퍼지는 best-effort
        logger.warning("템플릿 변경 후 캐시 퍼지 실패", exc_info=True)


CONTENT_KEEP = "keep"
CONTENT_REPLACE = "replace_with_sample"


def _sample_pages(template: Template) -> dict:
    pages = (template.sample_content or {}).get("pages") or {}
    return pages if isinstance(pages, dict) else {}


async def _active_section_ids(
    db: AsyncSession, tenant_id: uuid.UUID
) -> list[uuid.UUID]:
    result = await db.execute(
        select(Section.id).where(
            Section.tenant_id == tenant_id, Section.deleted_at.is_(None)
        )
    )
    return list(result.scalars().all())


async def _existing_slots(
    db: AsyncSession, tenant_id: uuid.UUID
) -> set[tuple[str, str]]:
    """테넌트에 이미 있는 (page_key, section_type) — 숨김 섹션 포함, 삭제 제외."""
    rows = await db.execute(
        select(Section.page_key, Section.section_type).where(
            Section.tenant_id == tenant_id, Section.deleted_at.is_(None)
        )
    )
    return {(page, stype) for page, stype in rows.all()}


async def copy_sample_sections(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    template: Template,
    *,
    only_missing: bool = False,
) -> list[uuid.UUID]:
    """템플릿 샘플 콘텐츠를 테넌트 섹션으로 복사한다 (참조가 아닌 복사 — 기획서 11.8).

    샘플 설정 값은 is_sample=True 로 만들어 관리자 화면에 '샘플' 표시가 된다.
    목록형 값(list/dict)은 JSON 문자열로 저장한다.
    only_missing=True 면 테넌트에 없는 (페이지, 섹션 타입)만 추가한다 (콘텐츠 유지).
    """
    now = datetime.now(UTC)
    created: list[uuid.UUID] = []
    existing = await _existing_slots(db, tenant_id) if only_missing else set()
    for page_key, items in _sample_pages(template).items():
        for order, item in enumerate(items or []):
            if (page_key, item["section_type"]) in existing:
                continue
            section_id = uuid.uuid4()
            db.add(
                Section(
                    id=section_id,
                    tenant_id=tenant_id,
                    section_type=item["section_type"],
                    label=item.get("label") or item["section_type"],
                    display_order=order,
                    is_active=True,
                    page_key=page_key,
                    created_at=now,
                    updated_at=now,
                )
            )
            for key, raw in (item.get("settings") or {}).items():
                value = resolve_sample_value(raw)  # 샘플 이미지 → 공용 스토리지 주소
                is_json = not isinstance(value, str)
                db.add(
                    SectionSetting(
                        id=uuid.uuid4(),
                        tenant_id=tenant_id,
                        section_id=section_id,
                        field_key=key,
                        field_value=json.dumps(value, ensure_ascii=False)
                        if is_json
                        else value,
                        value_type="JSON" if is_json else "STRING",
                        is_sample=True,
                        created_at=now,
                        updated_at=now,
                    )
                )
            created.append(section_id)
    await db.flush()
    return created


async def _set_deleted(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    section_ids: list[uuid.UUID],
    deleted: bool,
) -> None:
    if not section_ids:
        return
    rows = await db.execute(
        select(Section).where(
            Section.tenant_id == tenant_id, Section.id.in_(section_ids)
        )
    )
    now = datetime.now(UTC)
    for section in rows.scalars().all():
        section.deleted_at = now if deleted else None
        section.updated_at = now


async def apply_template(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    template_id: uuid.UUID,
    user_id: uuid.UUID | None,
    content_mode: str = CONTENT_KEEP,
) -> TenantTemplateOverride:
    """템플릿을 적용한다.

    - 플랜 잠금 템플릿이면 403
    - 기존 적용 상태가 있으면 롤백용 이력 스냅샷을 남긴다
    - content_mode=keep(기본): 콘텐츠(섹션)는 건드리지 않는다 (기획서 11.1)
    - content_mode=replace_with_sample: 현재 섹션을 숨기고 템플릿 샘플로 교체,
      교체 전 섹션은 이력의 content_snapshot 으로 롤백 가능 (기획서 11.8)
    """
    tenant = await _get_tenant(db, tenant_id)
    template = await _get_template(db, template_id)
    if is_locked(tenant.plan_type, template.min_plan):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="현재 플랜에서는 사용할 수 없는 템플릿입니다.",
        )
    replace = content_mode == CONTENT_REPLACE
    if replace and not _sample_pages(template):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이 템플릿에는 샘플 콘텐츠가 없습니다.",
        )

    content_snapshot: dict | None = None
    if not replace and template.renderer == "code":
        # 콘텐츠 유지: 기존 섹션은 그대로, 새 템플릿에만 있는 섹션만 샘플로 (11.8)
        await copy_sample_sections(db, tenant_id, template, only_missing=True)
    if replace:
        previous_ids = await _active_section_ids(db, tenant_id)
        await _set_deleted(db, tenant_id, previous_ids, deleted=True)
        created_ids = await copy_sample_sections(db, tenant_id, template)
        content_snapshot = {
            "restored_section_ids": [str(i) for i in previous_ids],
            "created_section_ids": [str(i) for i in created_ids],
        }

    override = await get_current_override(db, tenant_id)
    if override is not None:
        # 직전 상태를 롤백용 이력으로 보존
        db.add(
            TemplateChangeHistory(
                tenant_id=tenant_id,
                template_id=override.template_id,
                changed_by=user_id,
                before_css=dict(override.css_overrides or {}),
                after_css={},
                content_snapshot=content_snapshot,
            )
        )
        override.template_id = template_id
        override.css_overrides = {}
    else:
        override = TenantTemplateOverride(
            tenant_id=tenant_id,
            template_id=template_id,
            css_overrides={},
        )
        db.add(override)
        if content_snapshot is not None:
            # 첫 적용이라 되돌릴 템플릿은 없지만, 교체 전 콘텐츠는 복원할 수 있게 남긴다
            db.add(
                TemplateChangeHistory(
                    tenant_id=tenant_id,
                    template_id=template_id,
                    changed_by=user_id,
                    before_css={},
                    after_css={},
                    content_snapshot=content_snapshot,
                )
            )

    await db.commit()
    await db.refresh(override)
    await _purge_site_cache(db, tenant_id)
    return override


async def rollback_template(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> TenantTemplateOverride:
    """최근 변경 이력으로 복구한다. 이력이 없으면 400."""
    history_row = (
        await db.execute(
            select(TemplateChangeHistory)
            .where(TemplateChangeHistory.tenant_id == tenant_id)
            .order_by(TemplateChangeHistory.changed_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if history_row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="롤백할 변경 이력이 없습니다.",
        )

    override = await get_current_override(db, tenant_id)
    if override is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="적용된 템플릿이 없습니다.",
        )

    override.template_id = history_row.template_id
    override.css_overrides = dict(history_row.before_css or {})

    # 샘플로 교체했던 변경이면 콘텐츠도 되돌린다
    snapshot = history_row.content_snapshot or {}
    if snapshot:
        created = [uuid.UUID(i) for i in snapshot.get("created_section_ids", [])]
        restored = [uuid.UUID(i) for i in snapshot.get("restored_section_ids", [])]
        await _set_deleted(db, tenant_id, created, deleted=True)
        await _set_deleted(db, tenant_id, restored, deleted=False)

    await db.delete(history_row)

    await db.commit()
    await db.refresh(override)
    await _purge_site_cache(db, tenant_id)
    return override


async def customize_template(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    css_overrides: dict,
    user_id: uuid.UUID | None,
) -> TenantTemplateOverride:
    """CSS 변수를 개별 수정(병합)한다. 먼저 템플릿이 적용돼 있어야 한다."""
    override = await get_current_override(db, tenant_id)
    if override is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="먼저 템플릿을 적용해주세요.",
        )

    before = dict(override.css_overrides or {})
    merged = {**before, **css_overrides}

    db.add(
        TemplateChangeHistory(
            tenant_id=tenant_id,
            template_id=override.template_id,
            changed_by=user_id,
            before_css=before,
            after_css=merged,
        )
    )
    override.css_overrides = merged

    await db.commit()
    await db.refresh(override)
    await _purge_site_cache(db, tenant_id)
    return override


async def build_preview(
    db: AsyncSession,
    tenant_slug: str,
    template_id: uuid.UUID,
) -> PublicSiteResponse:
    """미리보기: 실제 콘텐츠(섹션) + 지정 템플릿 CSS로 사이트 응답을 구성한다.

    공개 엔드포인트용. 인증 불필요, 캐시도 사용하지 않는다(항상 최신).
    """
    await set_super_admin_context(db)
    tenant = (
        await db.execute(
            select(Tenant).where(
                Tenant.slug == tenant_slug, Tenant.deleted_at.is_(None)
            )
        )
    ).scalar_one_or_none()
    if not tenant or not tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="사이트를 찾을 수 없습니다."
        )

    template = await _get_template(db, template_id)

    await set_rls_context(db, tenant.id)
    sections = list(
        (
            await db.execute(
                select(Section)
                .where(Section.deleted_at.is_(None))
                .order_by(Section.display_order)
                .options(selectinload(Section.settings))
            )
        )
        .scalars()
        .all()
    )

    return PublicSiteResponse(
        tenant=PublicTenantResponse.model_validate(tenant),
        sections=[PublicSectionResponse.model_validate(s) for s in sections],
        seo_settings=None,
        sns_settings=None,
        template=PublicTemplateResponse.model_validate(template),
    )
