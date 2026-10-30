"""사업체 공통 정보 (T-036-A) — 홈페이지 전체에 한 번만 정하는 값."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.template_samples import load_menu
from app.models.section import Section
from app.models.site import SiteSetting
from app.models.template import Template
from app.schemas.site import (
    MenuItemResponse,
    MenuResponse,
    MenuUpdate,
    SiteSettingsUpdate,
)
from app.services import site_cache
from app.services import template as template_service
from app.services.section_manage import THEME_SECTION_TYPES

FIELDS = tuple(SiteSettingsUpdate.model_fields)


async def get_site_settings(db: AsyncSession) -> SiteSetting | None:
    """현재 테넌트(RLS)의 공통 정보"""
    result = await db.execute(select(SiteSetting))
    return result.scalar_one_or_none()


async def update_site_settings(
    db: AsyncSession, tenant_id: UUID, data: SiteSettingsUpdate
) -> SiteSetting:
    setting = await get_site_settings(db)
    if setting is None:
        setting = SiteSetting(tenant_id=tenant_id)
        db.add(setting)
    for field in FIELDS:
        value = getattr(data, field)
        if value is not None:  # None = 바꾸지 않음
            setattr(setting, field, value or None)  # "" = 지우기
    setting.updated_at = datetime.now(UTC)
    await db.commit()
    # 푸터 · 로고 · 구조화 데이터가 공개 사이트 응답에 들어간다
    await site_cache.purge_site(db, tenant_id)
    db.expire_all()
    saved = await get_site_settings(db)
    assert saved is not None
    return saved


# ── 상단 메뉴 (T-036-B) ────────────────────────────────────────────────


async def _menu_candidates(
    db: AsyncSession, tenant_id: UUID
) -> tuple[str, list[tuple[str, str]]]:
    """지금 템플릿의 기본 메뉴 [(key, 이름)].

    코드형은 템플릿 페이지(menu.json), 테마형은 노출 중인 홈 섹션.
    """
    override = await template_service.get_current_override(db, tenant_id)
    template = await db.get(Template, override.template_id) if override else None
    if template and template.renderer == "code" and template.code:
        pages = load_menu(template.code)
        if pages:
            return "code", [(p["key"], p["title"]) for p in pages]
    result = await db.execute(
        select(Section)
        .where(
            Section.tenant_id == tenant_id,
            Section.deleted_at.is_(None),
            Section.is_active.is_(True),
            Section.page_key == "home",
            Section.section_type.in_(THEME_SECTION_TYPES),
        )
        .order_by(Section.display_order)
    )
    return "theme", [(str(sec.id), sec.label) for sec in result.scalars()]


def _merge(
    candidates: list[tuple[str, str]], saved: list[dict], reorderable: bool
) -> list[MenuItemResponse]:
    by_key = {str(i.get("key")): i for i in saved}
    keys = [k for k, _ in candidates]
    if reorderable:
        # 저장한 순서 먼저, 새로 생긴 메뉴는 기본 순서대로 뒤에
        saved_order = [str(i.get("key")) for i in saved if str(i.get("key")) in keys]
        keys = saved_order + [k for k in keys if k not in saved_order]
    labels = dict(candidates)
    items = []
    for key in keys:
        entry = by_key.get(key, {})
        items.append(
            MenuItemResponse(
                key=key,
                default_label=labels[key],
                label=entry.get("label") or None,
                visible=bool(entry.get("visible", True)),
            )
        )
    return items


async def get_menu(db: AsyncSession, tenant_id: UUID) -> MenuResponse:
    mode, candidates = await _menu_candidates(db, tenant_id)
    setting = await get_site_settings(db)
    saved = list(setting.menu_items or []) if setting else []
    reorderable = mode == "code"
    return MenuResponse(
        mode=mode,
        reorderable=reorderable,
        items=_merge(candidates, saved, reorderable),
    )


async def update_menu(
    db: AsyncSession, tenant_id: UUID, data: MenuUpdate
) -> MenuResponse:
    """지금 템플릿의 메뉴만 바꾼다 — 다른 템플릿용 저장값은 남겨 되돌리면 다시 쓴다."""
    _mode, candidates = await _menu_candidates(db, tenant_id)
    keys = {k for k, _ in candidates}
    seen: set[str] = set()
    for item in data.items:
        if item.key not in keys:
            raise ValueError("지금 템플릿에 없는 메뉴입니다. 화면을 새로 고쳐 주세요.")
        if item.key in seen:
            raise ValueError("같은 메뉴가 두 번 들어 있습니다.")
        seen.add(item.key)

    setting = await get_site_settings(db)
    if setting is None:
        setting = SiteSetting(tenant_id=tenant_id)
        db.add(setting)
    others = [i for i in (setting.menu_items or []) if str(i.get("key")) not in keys]
    setting.menu_items = [
        {"key": i.key, "label": i.label, "visible": i.visible} for i in data.items
    ] + others
    setting.updated_at = datetime.now(UTC)
    await db.commit()
    await site_cache.purge_site(db, tenant_id)
    db.expire_all()
    return await get_menu(db, tenant_id)
