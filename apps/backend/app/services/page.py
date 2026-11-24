"""페이지 관리 (T-237, 페이지 관리 기획서 PM-01 · PM-02 · PART C).

- 템플릿 기본 페이지(TEMPLATE)는 지금 템플릿에서 읽어 맞춘다 — 목록을 읽을 때마다
  없는 것은 만들고, 다른 템플릿의 것은 숨긴다(지우지 않아 되돌리면 SEO 값이 그대로).
- 직접 만든 페이지(CUSTOM)는 CUSTOM_PAGES 스위치 · 요금제 한도 안에서만 만든다.
- 주소(page_key)는 휴지통 · 숨긴 템플릿 페이지를 포함해 사업체 안에서 하나.
- 섹션은 sections.page_key 로 잇는다 — 이 표는 섹션을 바꾸지 않고 주소 변경 · 삭제 때만
  함께 옮긴다.
"""

import re
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.template_samples import template_pages
from app.models.page import Page, PageRedirect
from app.models.section import Section, SectionSetting
from app.models.template import Template
from app.models.tenant import Tenant
from app.schemas.page import PageCreate, PageDuplicate, PageUpdate
from app.services import feature as feature_service
from app.services import site_cache
from app.services import site_settings as site_settings_service
from app.services import template as template_service

FEATURE_KEY = "CUSTOM_PAGES"
HOME_PAGE = "home"
HOME_TITLE = "홈"
ORIGIN_TEMPLATE = "TEMPLATE"
ORIGIN_CUSTOM = "CUSTOM"

# 직접 만든 페이지 수 — None 은 제한 없음. FREE · BASIC 은 섹션 '고정' 요금제라 0
# (빈 페이지를 채울 수 없다, 기획서 PART C 4번)
PAGE_LIMITS: dict[str, int | None] = {
    "FREE": 0,
    "BASIC": 0,
    "STANDARD": 10,
    "PREMIUM": None,
}

KEY_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
KEY_MIN_LENGTH = 2
KEY_MAX_LENGTH = 40

_ROUTE_CLASH = "홈페이지가 다른 화면에 쓰는 주소예요."
# 홈페이지 라우트가 먼저 쓰는 주소 (apps/client/middleware.ts)
RESERVED_KEY_REASONS: dict[str, str] = {
    HOME_PAGE: "홈 페이지 주소예요.",
    "preview": _ROUTE_CLASH,
    "login": _ROUTE_CLASH,
    "member": _ROUTE_CLASH,
    "paused": _ROUTE_CLASH,
    "b": _ROUTE_CLASH,
    "notice": "공지사항 게시판이 쓰는 주소예요.",
    # 이용약관 · 개인정보처리방침 (T-200)
    "terms": "이용약관 화면이 쓰는 주소예요.",
    "privacy": "개인정보처리방침 화면이 쓰는 주소예요.",
}

MSG_KEY_FORMAT = (
    f"영문 소문자 · 숫자 · 하이픈으로 {KEY_MIN_LENGTH}~{KEY_MAX_LENGTH}자"
    " 입력해 주세요."
)
MSG_KEY_TAKEN = "이미 다른 페이지가 쓰는 주소예요. 다른 주소를 입력해 주세요."
MSG_KEY_TRASH = "휴지통에 있는 페이지가 쓰는 주소예요."
MSG_KEY_TEMPLATE = "지금 템플릿의 기본 페이지 주소예요."
MSG_PLAN_BLOCKED = "페이지 추가는 STANDARD 요금제부터 쓸 수 있습니다."
MSG_NOT_FOUND = "페이지를 찾을 수 없습니다."
MSG_TEMPLATE_LOCKED = "템플릿 기본 페이지는 지울 수 없어요. 숨김으로 바꿔 주세요."
MSG_TEMPLATE_FIELD = "템플릿 기본 페이지의 주소 · 상위 페이지는 바꿀 수 없어요."
MSG_HOME_HIDDEN = "홈 페이지는 숨길 수 없어요."
MSG_PARENT_MISSING = "상위 페이지를 찾을 수 없어요."
MSG_PARENT_DEPTH = "상위 페이지는 한 단계까지만 묶을 수 있어요."
MSG_PARENT_SELF = "자기 자신을 상위 페이지로 고를 수 없어요."
MSG_HAS_CHILDREN = "하위 페이지가 있는 페이지는 다른 페이지 아래로 옮길 수 없어요."
MSG_ORDER_MISMATCH = "페이지 목록이 바뀌었습니다. 화면을 새로 고쳐 주세요."


def _now() -> datetime:
    return datetime.now(UTC)


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=MSG_NOT_FOUND)


def _invalid(message: str, field: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": "VALIDATION_ERROR", "message": message, "field": field},
    )


def _conflict(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "CONFLICT", "message": message, "field": "page_key"},
    )


# ── 템플릿 기본 페이지 ─────────────────────────────────────────────────────


async def current_template_pages(db: AsyncSession, tenant_id: UUID) -> list[dict]:
    """지금 템플릿의 페이지 [{key, title, parent?}] — 테마형은 홈만."""
    override = await template_service.get_current_override(db, tenant_id)
    template = await db.get(Template, override.template_id) if override else None
    if template and template.renderer == "code" and template.code:
        return template_pages(template.code)
    return [{"key": HOME_PAGE, "title": HOME_TITLE}]


async def _all_rows(db: AsyncSession, tenant_id: UUID) -> list[Page]:
    result = await db.execute(
        select(Page)
        .where(Page.tenant_id == tenant_id)
        .order_by(Page.display_order, Page.created_at, Page.page_key)
    )
    return list(result.scalars())


async def sync_template_pages(db: AsyncSession, tenant_id: UUID) -> None:
    """지금 템플릿 기본 페이지 행을 맞춘다. 직접 만든 페이지는 건드리지 않는다.

    같은 주소를 직접 만든 페이지가 이미 쓰면 그대로 둔다
    (템플릿 전환 충돌 안내는 T-242).
    """
    wanted = await current_template_pages(db, tenant_id)
    rows = {row.page_key: row for row in await _all_rows(db, tenant_id)}
    wanted_keys = {p["key"] for p in wanted}
    changed = False
    for order, page in enumerate(wanted):
        row = rows.get(page["key"])
        if row is None:
            db.add(
                Page(
                    tenant_id=tenant_id,
                    page_key=page["key"],
                    title=page["title"][:30],
                    origin=ORIGIN_TEMPLATE,
                    parent_key=page.get("parent"),
                    display_order=order,
                )
            )
            changed = True
        elif row.origin == ORIGIN_TEMPLATE and row.deleted_at is not None:
            row.deleted_at = None
            changed = True
    for row in rows.values():
        if (
            row.origin == ORIGIN_TEMPLATE
            and row.deleted_at is None
            and row.page_key not in wanted_keys
        ):
            row.deleted_at = _now()  # 다른 템플릿의 페이지 — 되돌리면 다시 살린다
            changed = True
    if not changed:
        return
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()  # 같은 순간 다른 요청이 먼저 맞췄다


# ── 한도 · 주소 검사 ──────────────────────────────────────────────────────


async def get_limits(db: AsyncSession, tenant_id: UUID) -> dict:
    """휴지통 · 템플릿 페이지는 세지 않는다. 모르는 요금제는 추가 불가."""
    plan = (
        await db.execute(select(Tenant.plan_type).where(Tenant.id == tenant_id))
    ).scalar_one_or_none() or ""
    limit = PAGE_LIMITS.get(plan.upper(), 0)
    used = (
        await db.execute(
            select(func.count())
            .select_from(Page)
            .where(
                Page.tenant_id == tenant_id,
                Page.origin == ORIGIN_CUSTOM,
                Page.deleted_at.is_(None),
            )
        )
    ).scalar_one()
    can_create = limit is None or used < limit
    reason = None
    if not can_create:
        reason = (
            MSG_PLAN_BLOCKED
            if limit == 0
            else f"현재 요금제는 페이지를 {limit}개까지 추가할 수 있습니다."
        )
    return {
        "plan": plan,
        "limit": limit,
        "used": used,
        "can_create": can_create,
        "reason": reason,
    }


async def _ensure_can_create(db: AsyncSession, tenant_id: UUID) -> None:
    """만들 · 복구할 때만 — 요금제를 내려도 있던 페이지는 그대로 쓴다."""
    limits = await get_limits(db, tenant_id)
    if not limits["can_create"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "PLAN_LIMIT_EXCEEDED", "message": limits["reason"]},
        )


def key_format_ok(key: str) -> bool:
    return (
        KEY_MIN_LENGTH <= len(key) <= KEY_MAX_LENGTH
        and KEY_PATTERN.match(key) is not None
    )


async def key_problem(
    db: AsyncSession, tenant_id: UUID, key: str, *, exclude: UUID | None = None
) -> tuple[str, bool] | None:
    """쓸 수 없는 주소면 (이유, 형식 오류인지), 쓸 수 있으면 None."""
    if not key_format_ok(key):
        return MSG_KEY_FORMAT, True
    reserved = RESERVED_KEY_REASONS.get(key)
    if reserved:
        return reserved, False
    if key in {p["key"] for p in await current_template_pages(db, tenant_id)}:
        return MSG_KEY_TEMPLATE, False
    conditions = [Page.tenant_id == tenant_id, Page.page_key == key]
    if exclude is not None:
        conditions.append(Page.id != exclude)
    row = (await db.execute(select(Page).where(*conditions).limit(1))).scalar()
    if row is not None:
        trashed = row.origin == ORIGIN_CUSTOM and row.deleted_at is not None
        return (MSG_KEY_TRASH if trashed else MSG_KEY_TAKEN), False
    return None


async def check_key(
    db: AsyncSession, tenant_id: UUID, key: str
) -> tuple[bool, str | None]:
    """주소 미리 확인 — [만들기] 와 같은 검사, 결과와 이유."""
    problem = await key_problem(db, tenant_id, key.strip())
    return (problem is None, problem[0] if problem else None)


async def _ensure_key(
    db: AsyncSession, tenant_id: UUID, key: str, *, exclude: UUID | None = None
) -> None:
    problem = await key_problem(db, tenant_id, key, exclude=exclude)
    if problem is None:
        return
    message, is_format = problem
    raise _invalid(message, "page_key") if is_format else _conflict(message)


async def _commit(db: AsyncSession) -> None:
    """같은 주소가 동시에 들어오면 유니크 인덱스가 막는다."""
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise _conflict(MSG_KEY_TAKEN) from e


# ── 조회 ─────────────────────────────────────────────────────────────────


async def _section_counts(db: AsyncSession, tenant_id: UUID) -> dict[str, int]:
    result = await db.execute(
        select(Section.page_key, func.count())
        .where(Section.tenant_id == tenant_id, Section.deleted_at.is_(None))
        .group_by(Section.page_key)
    )
    return {key: count for key, count in result.all()}


def _view(page: Page, counts: dict[str, int]) -> dict:
    data = {
        column: getattr(page, column)
        for column in (
            "id",
            "page_key",
            "title",
            "origin",
            "parent_key",
            "show_in_menu",
            "is_public",
            "display_order",
            "seo_title",
            "seo_description",
            "og_image_url",
            "noindex",
            "updated_at",
            "deleted_at",
        )
    }
    data["section_count"] = counts.get(page.page_key, 0)
    return data


async def list_pages(db: AsyncSession, tenant_id: UUID) -> dict:
    """기본 + 직접 만든 페이지(홈이 먼저), 휴지통, 한도, 스위치."""
    await sync_template_pages(db, tenant_id)
    rows = await _all_rows(db, tenant_id)
    counts = await _section_counts(db, tenant_id)
    live = [r for r in rows if r.deleted_at is None]
    live.sort(key=lambda r: r.page_key != HOME_PAGE)  # 홈 먼저, 나머지는 순서대로
    trash = [r for r in rows if r.deleted_at is not None and r.origin == ORIGIN_CUSTOM]
    return {
        "enabled": await feature_service.is_enabled(db, tenant_id, FEATURE_KEY),
        "pages": [_view(r, counts) for r in live],
        "trash": [_view(r, counts) for r in trash],
        "limits": await get_limits(db, tenant_id),
    }


async def get_page_view(db: AsyncSession, tenant_id: UUID, page_id: UUID) -> dict:
    page = await _get(db, tenant_id, page_id, include_deleted=True)
    return _view(page, await _section_counts(db, tenant_id))


async def _get(
    db: AsyncSession, tenant_id: UUID, page_id: UUID, *, include_deleted: bool = False
) -> Page:
    conditions = [Page.tenant_id == tenant_id, Page.id == page_id]
    if not include_deleted:
        conditions.append(Page.deleted_at.is_(None))
    page = (await db.execute(select(Page).where(*conditions))).scalar_one_or_none()
    if page is None:
        raise _not_found()
    return page


# ── 상위 페이지 ──────────────────────────────────────────────────────────


async def _check_parent(
    db: AsyncSession, tenant_id: UUID, parent_key: str, page: Page | None
) -> None:
    """한 단계 묶음 — 상위는 홈이 아닌 맨 위 페이지, 하위가 있는 페이지는 못 옮긴다."""
    if page is not None and parent_key == page.page_key:
        raise _invalid(MSG_PARENT_SELF, "parent_key")
    parent = (
        await db.execute(
            select(Page).where(
                Page.tenant_id == tenant_id,
                Page.page_key == parent_key,
                Page.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if parent is None or parent.page_key == HOME_PAGE:
        raise _invalid(MSG_PARENT_MISSING, "parent_key")
    if parent.parent_key:
        raise _invalid(MSG_PARENT_DEPTH, "parent_key")
    if page is not None:
        child = (
            await db.execute(
                select(Page.id)
                .where(
                    Page.tenant_id == tenant_id,
                    Page.parent_key == page.page_key,
                    Page.deleted_at.is_(None),
                )
                .limit(1)
            )
        ).scalar()
        if child is not None:
            raise _invalid(MSG_HAS_CHILDREN, "parent_key")


def _apply_common(page: Page, data: PageCreate | PageUpdate) -> None:
    for field in ("show_in_menu", "is_public", "noindex"):
        value = getattr(data, field)
        if value is not None:
            setattr(page, field, value)
    for field in ("seo_title", "seo_description", "og_image_url"):
        value = getattr(data, field)
        if value is not None:
            setattr(page, field, value or None)  # "" = 지우기


async def _next_order(db: AsyncSession, tenant_id: UUID) -> int:
    current = (
        await db.execute(
            select(func.max(Page.display_order)).where(Page.tenant_id == tenant_id)
        )
    ).scalar()
    return (current or 0) + 1


# ── 만들기 · 고치기 ───────────────────────────────────────────────────────


async def create_page(db: AsyncSession, tenant_id: UUID, data: PageCreate) -> dict:
    """빈 페이지 — 섹션은 T-241 섹션 라이브러리에서 넣는다."""
    await sync_template_pages(db, tenant_id)
    await _ensure_can_create(db, tenant_id)
    await _ensure_key(db, tenant_id, data.page_key)
    if data.parent_key:
        await _check_parent(db, tenant_id, data.parent_key, None)
    page = Page(
        tenant_id=tenant_id,
        page_key=data.page_key,
        title=data.title,
        origin=ORIGIN_CUSTOM,
        parent_key=data.parent_key or None,
        display_order=await _next_order(db, tenant_id),
    )
    _apply_common(page, data)
    db.add(page)
    await _commit(db)
    await site_cache.purge_site(db, tenant_id)
    return await get_page_view(db, tenant_id, page.id)


async def _move_key(db: AsyncSession, page: Page, new_key: str) -> None:
    """주소 변경 — 섹션 · 메뉴 · 하위 페이지를 옮기고 이전 주소 이동 기록을 남긴다."""
    old_key = page.page_key
    tenant_id = page.tenant_id
    await db.execute(
        update(Section)
        .where(Section.tenant_id == tenant_id, Section.page_key == old_key)
        .values(page_key=new_key)
    )
    await db.execute(
        update(Page)
        .where(Page.tenant_id == tenant_id, Page.parent_key == old_key)
        .values(parent_key=new_key)
    )
    # 예전 이동 기록은 새 주소로 곧장, 새 주소를 쓰던 이동 기록은 지운다
    await db.execute(
        update(PageRedirect)
        .where(PageRedirect.tenant_id == tenant_id, PageRedirect.to_key == old_key)
        .values(to_key=new_key)
    )
    existing = (
        await db.execute(
            select(PageRedirect).where(
                PageRedirect.tenant_id == tenant_id,
                PageRedirect.from_key.in_((old_key, new_key)),
            )
        )
    ).scalars()
    for redirect in existing:
        await db.delete(redirect)
    await db.flush()
    db.add(PageRedirect(tenant_id=tenant_id, from_key=old_key, to_key=new_key))
    await site_settings_service.rename_page_target(db, tenant_id, old_key, new_key)
    page.page_key = new_key


async def update_page(
    db: AsyncSession, tenant_id: UUID, page_id: UUID, data: PageUpdate
) -> dict:
    page = await _get(db, tenant_id, page_id)
    is_template = page.origin == ORIGIN_TEMPLATE
    new_key = data.page_key if data.page_key not in (None, page.page_key) else None
    parent_changed = data.parent_key is not None and (data.parent_key or None) != (
        page.parent_key
    )
    if is_template and (new_key or parent_changed):
        raise _invalid(MSG_TEMPLATE_FIELD, "page_key" if new_key else "parent_key")
    if page.page_key == HOME_PAGE and data.is_public is False:
        raise _invalid(MSG_HOME_HIDDEN, "is_public")
    if new_key:
        await _ensure_key(db, tenant_id, new_key, exclude=page.id)
    if parent_changed and data.parent_key:
        await _check_parent(db, tenant_id, data.parent_key, page)
    if data.title is not None:
        page.title = data.title
    if parent_changed:
        page.parent_key = data.parent_key or None
    _apply_common(page, data)
    if new_key:
        await _move_key(db, page, new_key)
    page.updated_at = _now()
    await _commit(db)
    await site_cache.purge_site(db, tenant_id)
    return await get_page_view(db, tenant_id, page.id)


async def duplicate_page(
    db: AsyncSession, tenant_id: UUID, page_id: UUID, data: PageDuplicate
) -> dict:
    """설정 · 섹션 · 섹션 값을 복사한 숨김 페이지 — 기본 페이지도 복제할 수 있다.

    갤러리 사진은 복사하지 않는다 (같은 파일을 두 섹션이 가리키지 않게).
    """
    source = await _get(db, tenant_id, page_id)
    await _ensure_can_create(db, tenant_id)
    await _ensure_key(db, tenant_id, data.page_key)
    page = Page(
        tenant_id=tenant_id,
        page_key=data.page_key,
        title=data.title,
        origin=ORIGIN_CUSTOM,
        show_in_menu=False,
        is_public=False,
        display_order=await _next_order(db, tenant_id),
        seo_title=source.seo_title,
        seo_description=source.seo_description,
        og_image_url=source.og_image_url,
        noindex=source.noindex,
    )
    db.add(page)
    sections = (
        await db.execute(
            select(Section)
            .where(
                Section.tenant_id == tenant_id,
                Section.page_key == source.page_key,
                Section.deleted_at.is_(None),
            )
            .order_by(Section.display_order)
        )
    ).scalars()
    for section in list(sections):
        copy = Section(
            tenant_id=tenant_id,
            section_type=section.section_type,
            label=section.label,
            display_order=section.display_order,
            page_key=data.page_key,
            is_active=section.is_active,
        )
        db.add(copy)
        await db.flush()
        settings = (
            await db.execute(
                select(SectionSetting).where(SectionSetting.section_id == section.id)
            )
        ).scalars()
        for setting in settings:
            db.add(
                SectionSetting(
                    tenant_id=tenant_id,
                    section_id=copy.id,
                    field_key=setting.field_key,
                    field_value=setting.field_value,
                    value_type=setting.value_type,
                    is_sample=setting.is_sample,
                )
            )
    await _commit(db)
    return await get_page_view(db, tenant_id, page.id)


async def reorder_pages(db: AsyncSession, tenant_id: UUID, ids: list[UUID]) -> None:
    """보이는 페이지 전체 순서 — 빠지거나 다른 페이지가 섞이면 400."""
    live = [r for r in await _all_rows(db, tenant_id) if r.deleted_at is None]
    if len(ids) != len(set(ids)) or {r.id for r in live} != set(ids):
        raise _invalid(MSG_ORDER_MISMATCH, "ids")
    by_id = {r.id: r for r in live}
    for order, page_id in enumerate(ids):
        by_id[page_id].display_order = order
    await db.commit()
    await site_cache.purge_site(db, tenant_id)


# ── 휴지통 ───────────────────────────────────────────────────────────────


async def delete_page(db: AsyncSession, tenant_id: UUID, page_id: UUID) -> None:
    """직접 만든 페이지만 — 섹션도 같은 시각으로 숨겨 복구 때 함께 살린다."""
    page = await _get(db, tenant_id, page_id)
    if page.origin == ORIGIN_TEMPLATE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": MSG_TEMPLATE_LOCKED},
        )
    now = _now()
    page.deleted_at = now
    await db.execute(
        update(Section)
        .where(
            Section.tenant_id == tenant_id,
            Section.page_key == page.page_key,
            Section.deleted_at.is_(None),
        )
        .values(deleted_at=now)
    )
    # 하위 페이지는 맨 위로
    await db.execute(
        update(Page)
        .where(Page.tenant_id == tenant_id, Page.parent_key == page.page_key)
        .values(parent_key=None)
    )
    await db.commit()
    await site_cache.purge_site(db, tenant_id)


async def restore_page(db: AsyncSession, tenant_id: UUID, page_id: UUID) -> dict:
    page = await _get(db, tenant_id, page_id, include_deleted=True)
    if page.deleted_at is None or page.origin != ORIGIN_CUSTOM:
        raise _not_found()
    await _ensure_can_create(db, tenant_id)
    if page.page_key in {p["key"] for p in await current_template_pages(db, tenant_id)}:
        raise _conflict(MSG_KEY_TEMPLATE)
    await db.execute(
        update(Section)
        .where(
            Section.tenant_id == tenant_id,
            Section.page_key == page.page_key,
            Section.deleted_at == page.deleted_at,
        )
        .values(deleted_at=None)
    )
    page.deleted_at = None
    if page.parent_key:
        parent_alive = (
            await db.execute(
                select(Page.id).where(
                    Page.tenant_id == tenant_id,
                    Page.page_key == page.parent_key,
                    Page.deleted_at.is_(None),
                )
            )
        ).scalar()
        if parent_alive is None:
            page.parent_key = None
    await db.commit()
    await site_cache.purge_site(db, tenant_id)
    return await get_page_view(db, tenant_id, page.id)


# ── 홈페이지 (T-239) ─────────────────────────────────────────────────────


async def public_pages(db: AsyncSession, tenant_id: UUID) -> list[Page]:
    """홈페이지가 쓰는 페이지 — 템플릿 기본 페이지(숨김 · SEO) + 직접 만든 공개 페이지.

    직접 만든 페이지는 스위치가 켜진 사업체만.
    숨긴 직접 페이지는 이름도 내보내지 않는다.
    """
    custom_on = await feature_service.is_enabled(db, tenant_id, FEATURE_KEY)
    rows = await _all_rows(db, tenant_id)
    return [
        row
        for row in rows
        if row.deleted_at is None
        and (
            row.origin == ORIGIN_TEMPLATE
            or (custom_on and row.origin == ORIGIN_CUSTOM and row.is_public)
        )
    ]
