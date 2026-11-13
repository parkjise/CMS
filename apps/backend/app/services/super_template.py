"""T-208 슈퍼 어드민 템플릿 관리 (상위 기획서 14.1 · 10.2 #12).

templates 는 전체 사업체가 함께 쓰는 목록이다 (RLS 없음). 숨기면(is_active=False)
새로 고를 수 없을 뿐, 이미 쓰는 사업체 홈페이지는 그대로 보인다.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.models.template import Template, TenantTemplateOverride
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.super_template import SuperTemplateCreate, SuperTemplateUpdate
from app.services import site_cache

_AUDITED = ("name", "description", "thumbnail_url", "min_plan", "is_active")
_REQUIRED = ("name", "min_plan", "is_active", "css_variables")


async def _usage(db: AsyncSession) -> dict[uuid.UUID, list[uuid.UUID]]:
    """템플릿별 쓰는 사업체 — 삭제 · 파기한 사업체는 뺀다."""
    rows = await db.execute(
        select(TenantTemplateOverride.template_id, TenantTemplateOverride.tenant_id)
        .join(Tenant, Tenant.id == TenantTemplateOverride.tenant_id)
        .where(Tenant.deleted_at.is_(None))
    )
    usage: dict[uuid.UUID, list[uuid.UUID]] = {}
    for template_id, tenant_id in rows.all():
        usage.setdefault(template_id, []).append(tenant_id)
    return usage


async def list_templates(db: AsyncSession) -> list[tuple[Template, int]]:
    """숨긴 것까지 전부 — 업종 · 이름 순, 쓰는 사업체 수와 함께."""
    templates = (
        await db.execute(
            select(Template).order_by(Template.template_type, Template.name)
        )
    ).scalars()
    usage = await _usage(db)
    return [(t, len(usage.get(t.id, []))) for t in templates]


async def _get(db: AsyncSession, template_id: uuid.UUID) -> Template:
    template = await db.get(Template, template_id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="템플릿을 찾을 수 없습니다."
        )
    return template


async def create_template(
    db: AsyncSession, actor: User, data: SuperTemplateCreate
) -> Template:
    css = data.css_variables
    if data.base_template_id is not None:
        base = await _get(db, data.base_template_id)
        if base.renderer != "theme":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="색 · 글꼴은 테마형 템플릿에서만 가져올 수 있습니다.",
            )
        css = {**base.css_variables, **(css or {})}
    if not css:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="색 · 글꼴 값을 넣거나 가져올 템플릿을 골라주세요.",
        )
    duplicate = await db.scalar(
        select(func.count()).select_from(Template).where(Template.name == data.name)
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="같은 이름의 템플릿이 있습니다.",
        )
    template = Template(
        template_type=data.template_type,
        renderer="theme",
        name=data.name,
        description=data.description,
        thumbnail_url=data.thumbnail_url,
        css_variables=css,
        section_layouts=[],
        min_plan=data.min_plan,
        is_active=data.is_active,
    )
    db.add(template)
    await db.flush()
    await log_action(
        db,
        actor,
        action="TEMPLATE_CREATED",
        target_type="template",
        target_id=template.id,
        after={"name": template.name, "is_active": template.is_active},
    )
    await db.commit()
    await db.refresh(template)
    return template


async def update_template(
    db: AsyncSession, actor: User, template_id: uuid.UUID, data: SuperTemplateUpdate
) -> tuple[Template, int]:
    template = await _get(db, template_id)
    changes = data.model_dump(exclude_unset=True)
    if "css_variables" in changes and template.renderer != "theme":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="코드형 템플릿의 색 · 글꼴은 템플릿 코드에서 바꿉니다.",
        )
    if changes.get("name") and changes["name"] != template.name:
        duplicate = await db.scalar(
            select(func.count())
            .select_from(Template)
            .where(Template.name == changes["name"], Template.id != template.id)
        )
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="같은 이름의 템플릿이 있습니다.",
            )
    before = {k: getattr(template, k) for k in _AUDITED if k in changes}
    for key, value in changes.items():
        # 비울 수 없는 칸에 null 이 오면 그대로 둔다 (설명 · 썸네일만 비울 수 있다)
        if value is None and key in _REQUIRED:
            continue
        setattr(template, key, value)
    after = {k: getattr(template, k) for k in _AUDITED if k in changes}
    if "css_variables" in changes:
        before["css_changed"], after["css_changed"] = False, True
    await log_action(
        db,
        actor,
        action="TEMPLATE_UPDATED",
        target_type="template",
        target_id=template.id,
        before=before,
        after=after,
    )
    await db.commit()
    await db.refresh(template)

    users = (await _usage(db)).get(template.id, [])
    # 색이 바뀌면 쓰는 사업체 홈페이지에 바로 보이도록 (숨김은 목록만 바뀐다)
    if "css_variables" in changes:
        for tenant_id in users:
            await site_cache.purge_site(db, tenant_id)
    return template, len(users)
