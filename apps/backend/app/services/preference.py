"""관리자 개인 화면 설정 (T-181) — 계정마다 서버에 저장해 어느 브라우저에서나 같게.

로그인한 본인 것만 읽고 쓴다(tenant_id · user_id 를 토큰에서). 초기화는 소프트 삭제이고,
다시 저장하면 같은 행을 되살린다.
"""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.preference import AdminUserPreference


def post_table_key(board_id: UUID) -> str:
    return f"post_table:{board_id}"


async def get_preference(
    db: AsyncSession, tenant_id: UUID, user_id: UUID, key: str
) -> AdminUserPreference | None:
    result = await db.execute(
        select(AdminUserPreference).where(
            AdminUserPreference.tenant_id == tenant_id,
            AdminUserPreference.user_id == user_id,
            AdminUserPreference.key == key,
            AdminUserPreference.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def save_preference(
    db: AsyncSession, tenant_id: UUID, user_id: UUID, key: str, value: dict[str, Any]
) -> AdminUserPreference:
    now = datetime.now(UTC)
    await db.execute(
        insert(AdminUserPreference)
        .values(tenant_id=tenant_id, user_id=user_id, key=key, value=value)
        .on_conflict_do_update(
            constraint="uq_admin_user_preferences_user_key",
            set_={"value": value, "updated_at": now, "deleted_at": None},
            # 같은 계정은 같은 사업체 — 다른 사업체 행은 덮어쓰지 않는다
            where=AdminUserPreference.tenant_id == tenant_id,
        )
    )
    await db.commit()
    saved = await get_preference(db, tenant_id, user_id, key)
    assert saved is not None
    return saved


async def reset_preference(
    db: AsyncSession, tenant_id: UUID, user_id: UUID, key: str
) -> bool:
    """초기화 — 저장된 설정이 있었으면 True."""
    saved = await get_preference(db, tenant_id, user_id, key)
    if saved is None:
        return False
    saved.deleted_at = datetime.now(UTC)
    await db.commit()
    return True
