"""게시글 버전 이력 (T-191, 게시판 모듈 기획서 BM-06).

관리자가 글을 고칠 때마다 고치기 직전 내용을 하나 남기고, 글마다 최근 20개만 둔다.
되돌리기는 서버가 하지 않는다 — 화면이 이전 내용을 편집 칸에 채우고, 관리자가 저장한다.
"""

import copy
from typing import Any
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.board import BoardPost, BoardPostVersion
from app.models.user import User

VERSION_KEEP = 20
EDITOR_UNKNOWN = "삭제된 계정"
TRACKED_FIELDS = (
    "title",
    "body",
    "custom_data",
    "category_id",
    "status",
    "is_pinned",
    "is_secret",
)


def snapshot(post: BoardPost) -> dict[str, Any]:
    """고치기 전 내용 — 본문 · 칸 값은 고치는 동안 바뀌지 않게 복사한다."""
    fields = {key: copy.deepcopy(getattr(post, key)) for key in TRACKED_FIELDS}
    return {**fields, "saved_at": post.updated_at}


async def record(
    db: AsyncSession, post: BoardPost, before: dict[str, Any], edited_by: UUID | None
) -> None:
    """바뀐 게 있으면 고치기 전 내용을 남기고 오래된 것을 지운다 (커밋은 부르는 쪽)."""
    if all(before[key] == getattr(post, key) for key in TRACKED_FIELDS):
        return
    db.add(
        BoardPostVersion(
            tenant_id=post.tenant_id,
            post_id=post.id,
            edited_by=edited_by,
            **before,
        )
    )
    await db.flush()
    keep = (
        select(BoardPostVersion.id)
        .where(BoardPostVersion.post_id == post.id)
        .order_by(BoardPostVersion.created_at.desc(), BoardPostVersion.id.desc())
        .limit(VERSION_KEEP)
    )
    await db.execute(
        delete(BoardPostVersion).where(
            BoardPostVersion.post_id == post.id,
            BoardPostVersion.id.not_in(keep.scalar_subquery()),
        )
    )


async def list_versions(db: AsyncSession, post: BoardPost) -> list[dict[str, Any]]:
    rows = await db.execute(
        select(BoardPostVersion, User.email)
        .outerjoin(User, User.id == BoardPostVersion.edited_by)
        .where(
            BoardPostVersion.post_id == post.id,
            BoardPostVersion.tenant_id == post.tenant_id,
        )
        .order_by(BoardPostVersion.created_at.desc(), BoardPostVersion.id.desc())
    )
    return [_item(version, email) for version, email in rows.all()]


async def get_version(
    db: AsyncSession, post: BoardPost, version_id: UUID
) -> dict[str, Any] | None:
    row = (
        await db.execute(
            select(BoardPostVersion, User.email)
            .outerjoin(User, User.id == BoardPostVersion.edited_by)
            .where(
                BoardPostVersion.id == version_id,
                BoardPostVersion.post_id == post.id,
                BoardPostVersion.tenant_id == post.tenant_id,
            )
        )
    ).one_or_none()
    if row is None:
        return None
    version, email = row
    return {
        **_item(version, email),
        "body": version.body,
        "custom_data": version.custom_data,
        "category_id": version.category_id,
        "is_pinned": version.is_pinned,
        "is_secret": version.is_secret,
    }


def _item(version: BoardPostVersion, email: str | None) -> dict[str, Any]:
    return {
        "id": version.id,
        "title": version.title,
        "status": version.status,
        "saved_at": version.saved_at,
        "replaced_at": version.created_at,
        "editor": email or EDITOR_UNKNOWN,
    }
