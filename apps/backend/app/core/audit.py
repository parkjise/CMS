from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.user import User


async def log_action(
    db: AsyncSession,
    actor: User,
    action: str,
    target_type: str,
    target_id: str | UUID | None = None,
    before: dict | None = None,
    after: dict | None = None,
    ip_address: str | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor.id,
            actor_role=actor.role,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            before_value=before,
            after_value=after,
            ip_address=ip_address,
        )
    )
    await db.commit()
