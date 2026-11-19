"""게시판을 2단계 메뉴(페이지 묶음 아래)에 넣기 (T-216, 1113 #3).

고를 수 있는 묶음은 지금 코드형 템플릿의 상단 메뉴 페이지(`{code}.menu.json`).
테마형은 2단계 메뉴가 없어 묶음이 없다 — 저장된 값은 두되 홈페이지는 상단 메뉴로.
"""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.data.template_samples import load_menu
from app.models.template import Template
from app.services import template as template_service


async def parent_options(db: AsyncSession, tenant_id: UUID) -> list[dict]:
    """[{key, title}] — 게시판을 넣을 수 있는 페이지 묶음."""
    override = await template_service.get_current_override(db, tenant_id)
    template = await db.get(Template, override.template_id) if override else None
    if template is None or template.renderer != "code" or not template.code:
        return []
    return [
        {"key": p["key"], "title": p["title"]}
        for p in load_menu(template.code)
        if not p.get("parent")
    ]
