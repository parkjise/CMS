"""사업체 공통 정보 (T-036-A) — 홈페이지 전체에 한 번만 정하는 값."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.template_samples import load_menu
from app.models.board import Board
from app.models.page import Page
from app.models.section import Section
from app.models.site import SiteSetting
from app.models.template import Template
from app.schemas.site import (
    MENU_LABEL_MAX,
    MENU_MAX_DEPTH,
    MENU_MAX_NODES,
    PUBLIC_GROUPS,
    MenuBoardOption,
    MenuItemResponse,
    MenuNode,
    MenuPageOption,
    MenuResponse,
    MenuTreeUpdate,
    PublicMenuNode,
    PublicSiteSettingsResponse,
    SiteSettingsUpdate,
)
from app.services import board as board_service
from app.services import feature as feature_service
from app.services import site_cache
from app.services import template as template_service
from app.services.section_manage import THEME_SECTION_TYPES

FIELDS = tuple(SiteSettingsUpdate.model_fields)
PUBLIC_FIELDS = tuple(
    f
    for f in PublicSiteSettingsResponse.model_fields
    if f not in ("hidden_fields", "menu_tree", "menu_hidden")
)


def hidden_columns(setting: SiteSetting) -> set[str]:
    """숨긴 공개 항목 묶음에 속한 칸"""
    return {
        column
        for group in setting.hidden_fields or []
        for column in PUBLIC_GROUPS.get(group, ())
    }


def public_view(setting: SiteSetting) -> PublicSiteSettingsResponse:
    """홈페이지 · 공개 API · 구조화 데이터용 — 숨긴 항목은 값을 아예 뺀다 (T-222)"""
    hidden = hidden_columns(setting)
    values = {
        field: None if field in hidden else getattr(setting, field)
        for field in PUBLIC_FIELDS
    }
    # 예전 방식 메뉴만 — 트리(T-223)는 public_menu 로 따로
    menu_items = values.get("menu_items")
    if isinstance(menu_items, list):
        values["menu_items"] = _legacy(menu_items) or None
    return PublicSiteSettingsResponse.model_validate(
        {**values, "hidden_fields": list(setting.hidden_fields or [])}
    )


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
        if value is None:  # None = 바꾸지 않음
            continue
        if field == "weekly_hours":
            value = {day: hours.model_dump() for day, hours in value.items()}
        setattr(setting, field, value or None)  # "" · {} · [] = 지우기
    setting.updated_at = datetime.now(UTC)
    await db.commit()
    # 푸터 · 로고 · 구조화 데이터가 공개 사이트 응답에 들어간다
    await site_cache.purge_site(db, tenant_id)
    db.expire_all()
    saved = await get_site_settings(db)
    assert saved is not None
    return saved


# ── 상단 메뉴 (T-036-B · T-223 트리) ─────────────────────────────────────
#
# menu_items 안에 두 모양이 함께 있다.
# - 예전 방식 {key, label, visible} — 템플릿 기본 메뉴에 이름 · 숨김 · 순서만 덮어쓴다
# - 트리 {scope, nodes, known} — 템플릿마다 하나 (scope = "code:{code}" · "theme").
#   트리를 저장한 템플릿은 트리만 쓰고, 다른 템플릿용 값은 남겨 되돌리면 다시 쓴다.


def board_menu_key(board_id: UUID) -> str:
    """id 를 쓴다 — 주소를 바꿔도 메뉴 이름 · 순서 · 숨김이 그대로다."""
    return f"board:{board_id}"


class _MenuContext:
    """지금 템플릿의 메뉴 재료 — 페이지 · 게시판 · 예전 기본 메뉴."""

    def __init__(
        self,
        mode: str,
        scope: str,
        pages: list[MenuPageOption],
        boards: list[Board],
        public_boards: list[dict],
    ) -> None:
        self.mode = mode
        self.scope = scope
        self.pages = pages
        self.page_keys = {p.key for p in pages}
        self.top_page_keys = {p.key for p in pages if not p.parent}
        self.custom_keys = {p.key for p in pages if p.custom}
        self.boards = boards
        self.public_boards = {str(b["id"]): b for b in public_boards}

    def board_in_menu(self, board: dict) -> bool:
        """상단 메뉴 후보 — 코드형 페이지 하위 탭에 넣은 게시판은 빠진다 (T-216)"""
        return board.get("menu_parent") not in self.top_page_keys

    def candidates(self) -> list[tuple[str, str]]:
        """예전 방식의 기본 메뉴 [(key, 이름)] — 맨 위 페이지 · 섹션 뒤에 게시판"""
        boards = [
            (board_menu_key(b["id"]), b["name"])
            for b in self.public_boards.values()
            if self.board_in_menu(b)
        ]
        tops = [(p.key, p.label) for p in self.pages if not p.parent and p.in_menu]
        return [*tops, *boards]


async def _custom_page_options(
    db: AsyncSession, tenant_id: UUID
) -> list[MenuPageOption]:
    """직접 만든 공개 페이지 (T-237) — 스위치가 꺼졌으면 없다.

    숨김 · 휴지통 페이지는 빠져 홈페이지 메뉴에서도 사라진다.
    """
    if not await feature_service.is_enabled(db, tenant_id, "CUSTOM_PAGES"):
        return []
    rows = (
        await db.execute(
            select(Page)
            .where(
                Page.tenant_id == tenant_id,
                Page.origin == "CUSTOM",
                Page.is_public.is_(True),
                Page.deleted_at.is_(None),
            )
            .order_by(Page.display_order, Page.created_at)
        )
    ).scalars()
    return [
        MenuPageOption(
            key=p.page_key,
            label=p.title,
            parent=p.parent_key,
            custom=True,
            in_menu=p.show_in_menu,
        )
        for p in rows
    ]


async def _hidden_template_pages(db: AsyncSession, tenant_id: UUID) -> set[str]:
    """숨긴 템플릿 기본 페이지 (T-239) — 메뉴 후보 · 홈페이지 메뉴에서 빠진다"""
    rows = await db.execute(
        select(Page.page_key).where(
            Page.tenant_id == tenant_id,
            Page.origin == "TEMPLATE",
            Page.is_public.is_(False),
            Page.deleted_at.is_(None),
        )
    )
    return set(rows.scalars())


async def _menu_context(db: AsyncSession, tenant_id: UUID) -> _MenuContext:
    override = await template_service.get_current_override(db, tenant_id)
    template = await db.get(Template, override.template_id) if override else None
    code = template.code if template and template.renderer == "code" else None
    menu = load_menu(code) if code else []
    # 테마형은 공지 페이지가 없어 공지 게시판도 메뉴 후보로 (T-176)
    public_boards = await board_service.list_public_boards(
        db, tenant_id, include_notice=not menu
    )
    boards = list(
        (
            await db.execute(
                select(Board)
                .where(Board.tenant_id == tenant_id, Board.deleted_at.is_(None))
                .order_by(Board.created_at, Board.id)
            )
        ).scalars()
    )
    if menu:
        hidden = await _hidden_template_pages(db, tenant_id)
        pages = [
            MenuPageOption(key=p["key"], label=p["title"], parent=p.get("parent"))
            for p in menu
            if p["key"] not in hidden
        ]
        pages += _with_parents(pages, await _custom_page_options(db, tenant_id))
        # 코드형 기본 게시판(공지 등)은 템플릿 페이지가 따로 있다
        boards = [b for b in boards if b.system_key is None]
        return _MenuContext("code", f"code:{code}", pages, boards, public_boards)
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
    pages = [
        MenuPageOption(key=str(sec.id), label=sec.label) for sec in result.scalars()
    ]
    pages += _with_parents(pages, await _custom_page_options(db, tenant_id))
    boards = [b for b in boards if b.system_key in (None, board_service.NOTICE_KEY)]
    return _MenuContext("theme", "theme", pages, boards, public_boards)


def _with_parents(
    pages: list[MenuPageOption], custom: list[MenuPageOption]
) -> list[MenuPageOption]:
    """상위 페이지가 메뉴 후보에 없으면(숨김 · 다른 템플릿) 맨 위로 올린다."""
    keys = {p.key for p in pages} | {p.key for p in custom}
    for page in custom:
        if page.parent and page.parent not in keys:
            page.parent = None
    return custom


def _legacy(saved: list[dict]) -> list[dict]:
    return [i for i in saved if "key" in i]


def _tree_entry(saved: list[dict], scope: str) -> dict | None:
    return next((i for i in saved if i.get("scope") == scope), None)


def _legacy_order(
    ctx: _MenuContext, saved: list[dict]
) -> list[tuple[str, str, str | None, bool]]:
    """예전 방식 저장값을 덮어쓴 메뉴 [(key, 기본 이름, 바꾼 이름, 보이기)]

    코드형은 저장한 순서대로(새 메뉴는 뒤에), 테마형은 섹션 순서를 따른다.
    """
    legacy = _legacy(saved)
    by_key = {str(i.get("key")): i for i in legacy}
    candidates = ctx.candidates()
    keys = [k for k, _ in candidates]
    if ctx.mode == "code":
        order = [str(i.get("key")) for i in legacy if str(i.get("key")) in keys]
        keys = order + [k for k in keys if k not in order]
    labels = dict(candidates)
    return [
        (
            key,
            labels[key],
            by_key.get(key, {}).get("label") or None,
            bool(by_key.get(key, {}).get("visible", True)),
        )
        for key in keys
    ]


def _node_for(
    ctx: _MenuContext, key: str, label: str, visible: bool = True
) -> MenuNode:
    if key.startswith("board:"):
        board_id = key.removeprefix("board:")
        return MenuNode(
            id=f"b-{board_id[:8]}",
            label=label[:MENU_LABEL_MAX],
            type="board",
            target=board_id,
            visible=visible,
        )
    return MenuNode(
        id=f"p-{key[:38]}"
        if ctx.mode == "code" or key in ctx.custom_keys
        else f"s-{key[:8]}",
        label=label[:MENU_LABEL_MAX],
        type="page",
        target=key,
        visible=visible,
    )


def _converted_tree(ctx: _MenuContext, saved: list[dict]) -> list[MenuNode]:
    """트리를 저장하기 전 — 지금 홈페이지 메뉴를 트리로 (T-223).

    코드형 하위 페이지와 페이지 하위 탭에 넣은 게시판은 그 페이지 하위 메뉴로 넣는다.
    저장하기 전까지 홈페이지는 예전 방식 그대로다.
    """
    nodes = []
    for key, default_label, label, visible in _legacy_order(ctx, saved):
        node = _node_for(ctx, key, label or default_label, visible)
        if node.type == "page":
            # 하위 페이지 — 코드형 템플릿 하위 페이지 · 직접 만든 페이지 (T-237)
            node.children = [
                _node_for(ctx, p.key, p.label) for p in ctx.pages if p.parent == key
            ]
        if ctx.mode == "code" and node.type == "page":
            node.children += [
                _node_for(ctx, board_menu_key(b["id"]), b["name"])
                for b in ctx.public_boards.values()
                if b.get("menu_parent") == key
            ]
        nodes.append(node)
    return nodes


def _known_keys(ctx: _MenuContext) -> list[str]:
    """트리를 저장할 때 있던 후보 — 그 뒤에 새로 생긴 것만 홈페이지 메뉴 끝에 붙인다"""
    return [k for k, _ in ctx.candidates()] + [board_menu_key(b.id) for b in ctx.boards]


def _walk(nodes: list[MenuNode]):
    for node in nodes:
        yield node
        yield from _walk(node.children)


def _check_tree(ctx: _MenuContext, nodes: list[MenuNode]) -> None:
    """3단계 · 개수 · id 중복 · 연결 대상 — 실패하면 ValueError(화면에 보일 문장)"""

    def depth(items: list[MenuNode]) -> int:
        return max((1 + depth(n.children) for n in items), default=0)

    if depth(nodes) > MENU_MAX_DEPTH:
        raise ValueError(f"메뉴는 {MENU_MAX_DEPTH}단계까지 만들 수 있어요.")
    all_nodes = list(_walk(nodes))
    if len(all_nodes) > MENU_MAX_NODES:
        raise ValueError(f"메뉴는 {MENU_MAX_NODES}개까지 만들 수 있어요.")
    ids = [n.id for n in all_nodes]
    if len(ids) != len(set(ids)):
        raise ValueError("같은 메뉴가 두 번 들어 있습니다. 화면을 새로 고쳐 주세요.")
    board_ids = {str(b.id) for b in ctx.boards}
    for node in all_nodes:
        if node.type == "page" and node.target not in ctx.page_keys:
            raise ValueError(
                f"'{node.label}' 메뉴가 연결한 페이지가 지금 템플릿에 없어요."
            )
        if node.type == "board" and node.target not in board_ids:
            raise ValueError(f"'{node.label}' 메뉴가 연결한 게시판이 없어요.")


def _flat_items(ctx: _MenuContext, nodes: list[MenuNode]) -> list[MenuItemResponse]:
    """상단 메뉴 후보가 트리에 어떻게 있는지 — 숨긴 묶음 아래면 숨김"""
    labels = dict(ctx.candidates())
    items: dict[str, MenuItemResponse] = {}

    def visit(level: list[MenuNode], shown: bool) -> None:
        for node in level:
            visible = shown and node.visible
            key = (
                board_menu_key(UUID(node.target))
                if node.type == "board" and node.target
                else node.target
            )
            if node.type in ("page", "board") and key in labels and key not in items:
                items[key] = MenuItemResponse(
                    key=key,
                    default_label=labels[key],
                    label=None if node.label == labels[key] else node.label,
                    visible=visible,
                )
            visit(node.children, visible)

    visit(nodes, True)
    return list(items.values())


async def get_menu(db: AsyncSession, tenant_id: UUID) -> MenuResponse:
    ctx = await _menu_context(db, tenant_id)
    setting = await get_site_settings(db)
    saved = list(setting.menu_items or []) if setting else []
    entry = _tree_entry(saved, ctx.scope)
    nodes = (
        [MenuNode.model_validate(n) for n in entry["nodes"]]
        if entry
        else _converted_tree(ctx, saved)
    )
    return MenuResponse(
        mode=ctx.mode,
        saved=entry is not None,
        nodes=nodes,
        pages=ctx.pages,
        boards=[
            MenuBoardOption(
                id=b.id,
                name=b.name,
                slug=b.slug,
                active=str(b.id) in ctx.public_boards,
                member_only=board_service.is_member_only(b),
                menu_parent=(b.settings or {}).get("menu_parent"),
            )
            for b in ctx.boards
        ],
        items=_flat_items(ctx, nodes),
    )


async def _save_tree(
    db: AsyncSession,
    tenant_id: UUID,
    ctx: _MenuContext,
    nodes: list[MenuNode],
    known: list[str],
) -> None:
    setting = await get_site_settings(db)
    if setting is None:
        setting = SiteSetting(tenant_id=tenant_id)
        db.add(setting)
    others = [i for i in (setting.menu_items or []) if i.get("scope") != ctx.scope]
    setting.menu_items = [
        *others,
        {
            "scope": ctx.scope,
            "nodes": [n.model_dump() for n in nodes],
            "known": known,
        },
    ]
    setting.updated_at = datetime.now(UTC)
    await db.commit()
    await site_cache.purge_site(db, tenant_id)
    db.expire_all()


async def update_menu(
    db: AsyncSession, tenant_id: UUID, data: MenuTreeUpdate
) -> MenuResponse:
    """지금 템플릿의 메뉴 트리를 통째로 저장한다 (T-223)."""
    ctx = await _menu_context(db, tenant_id)
    _check_tree(ctx, data.nodes)
    await _save_tree(db, tenant_id, ctx, data.nodes, _known_keys(ctx))
    return await get_menu(db, tenant_id)


async def reset_menu(db: AsyncSession, tenant_id: UUID) -> MenuResponse:
    """지금 템플릿의 메뉴를 기본값으로 — 트리와 예전 방식 저장값을 지운다."""
    ctx = await _menu_context(db, tenant_id)
    setting = await get_site_settings(db)
    if setting is not None and setting.menu_items:
        keys = {k for k, _ in ctx.candidates()}
        setting.menu_items = [
            i
            for i in setting.menu_items
            if i.get("scope") not in (None, ctx.scope)
            or (i.get("scope") is None and str(i.get("key")) not in keys)
        ] or None
        setting.updated_at = datetime.now(UTC)
        await db.commit()
        await site_cache.purge_site(db, tenant_id)
        db.expire_all()
    return await get_menu(db, tenant_id)


def _hide_target(nodes: list[MenuNode], target: str) -> bool:
    found = False
    for node in _walk(nodes):
        if node.type == "board" and node.target == target:
            node.visible = False
            found = True
    return found


async def hide_board_from_menu(db: AsyncSession, board: Board) -> None:
    """메뉴에서 숨긴다 (게시판 복사본 등).

    트리를 저장했으면 그 게시판 메뉴를 숨기고 '이미 아는 게시판'에 넣어 끝에 붙지 않게,
    아니면 예전 방식으로 숨김을 저장한다.
    """
    ctx = await _menu_context(db, board.tenant_id)
    setting = await get_site_settings(db)
    saved = list(setting.menu_items or []) if setting else []
    key = board_menu_key(board.id)
    entry = _tree_entry(saved, ctx.scope)
    if entry is not None:
        nodes = [MenuNode.model_validate(n) for n in entry["nodes"]]
        _hide_target(nodes, str(board.id))
        known = list(dict.fromkeys([*entry.get("known", []), key]))
        await _save_tree(db, board.tenant_id, ctx, nodes, known)
        await db.refresh(board)
        return
    order = _legacy_order(ctx, saved)
    if all(k != key for k, *_ in order):
        return
    assert setting is not None or not saved
    if setting is None:
        setting = SiteSetting(tenant_id=board.tenant_id)
        db.add(setting)
    keys = {k for k, *_ in order}
    others = [i for i in saved if str(i.get("key")) not in keys or "scope" in i]
    setting.menu_items = [
        {"key": k, "label": label, "visible": visible and k != key}
        for k, _default, label, visible in order
    ] + others
    setting.updated_at = datetime.now(UTC)
    await db.commit()
    await site_cache.purge_site(db, board.tenant_id)
    db.expire_all()
    await db.refresh(board)


def _public_nodes(
    ctx: _MenuContext, nodes: list[MenuNode], hidden: list[str]
) -> list[PublicMenuNode]:
    out: list[PublicMenuNode] = []
    for node in nodes:
        if not node.visible:
            for n in _walk([node]):
                if n.type == "page" and n.target:
                    hidden.append(n.target)
                elif n.type == "board" and n.target:
                    hidden.append(board_menu_key(UUID(n.target)))
            continue
        children = _public_nodes(ctx, node.children, hidden)
        if node.type == "page" and node.target not in ctx.page_keys:
            continue  # 템플릿 · 섹션이 바뀌어 없어진 페이지
        slug = None
        if node.type == "board":
            board = ctx.public_boards.get(str(node.target))
            if board is None:
                continue  # 사용 안 함 · 지운 게시판
            slug = board["slug"]
        if node.type == "group" and not children:
            continue  # 빈 묶음
        out.append(
            PublicMenuNode(
                label=node.label,
                type=node.type,
                target=node.target,
                slug=slug,
                new_window=node.new_window,
                children=children,
            )
        )
    return out


async def public_menu(
    db: AsyncSession, tenant_id: UUID, setting: SiteSetting
) -> tuple[list[PublicMenuNode] | None, list[str]]:
    """홈페이지 메뉴 트리와 숨긴 연결 대상 — 트리를 저장하지 않았으면 (None, [])."""
    saved = list(setting.menu_items or [])
    if not any("scope" in i for i in saved):
        return None, []
    ctx = await _menu_context(db, tenant_id)
    entry = _tree_entry(saved, ctx.scope)
    if entry is None:
        return None, []
    hidden: list[str] = []
    nodes = _public_nodes(
        ctx, [MenuNode.model_validate(n) for n in entry["nodes"]], hidden
    )
    # 트리를 저장한 뒤 새로 생긴 섹션 · 게시판은 끝에 붙인다
    known = set(entry.get("known", []))
    for key, label in ctx.candidates():
        if key in known:
            continue
        node = _node_for(ctx, key, label)
        nodes.extend(_public_nodes(ctx, [node], hidden))
    return nodes, hidden


def _renamed_nodes(nodes: list[dict], old_key: str, new_key: str) -> list[dict]:
    out = []
    for node in nodes:
        node = dict(node)
        if node.get("type") == "page" and node.get("target") == old_key:
            node["target"] = new_key
        node["children"] = _renamed_nodes(node.get("children") or [], old_key, new_key)
        out.append(node)
    return out


async def rename_page_target(
    db: AsyncSession, tenant_id: UUID, old_key: str, new_key: str
) -> None:
    """페이지 주소를 바꾸면 저장한 메뉴(모든 템플릿 트리 · 예전 방식)도 따라간다.

    커밋은 부르는 쪽이 한다.
    """
    setting = await get_site_settings(db)
    if setting is None or not setting.menu_items:
        return
    items = []
    for item in setting.menu_items:
        item = dict(item)
        if "scope" in item:
            item["nodes"] = _renamed_nodes(item.get("nodes") or [], old_key, new_key)
            item["known"] = [
                new_key if k == old_key else k for k in item.get("known") or []
            ]
        elif item.get("key") == old_key:
            item["key"] = new_key
        items.append(item)
    setting.menu_items = items
    setting.updated_at = datetime.now(UTC)
