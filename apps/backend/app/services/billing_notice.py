"""구독 안내 메일 (기획서 15.4, T-134) — 대상 사업체의 활성 관리자에게.

메일 실패가 결제 · 차단 처리를 되돌리면 안 되므로 주소별로 기록만 하고 넘어간다.
"""

import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant
from app.services import email as email_service
from app.services.announcement import resolve_admin_emails

logger = logging.getLogger(__name__)


async def _send_to_admins(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    send: Callable[[str, str], Awaitable[Any]],
) -> None:
    try:
        name = (
            await db.execute(select(Tenant.name).where(Tenant.id == tenant_id))
        ).scalar_one_or_none() or ""
        addresses = await resolve_admin_emails(db, [tenant_id])
    except Exception:
        logger.exception("구독 안내 메일 대상 조회 실패 tenant=%s", tenant_id)
        return
    for address in addresses:
        try:
            await send(address, name)
        except Exception:
            logger.exception("구독 안내 메일 실패 tenant=%s", tenant_id)


async def payment_failed(
    db: AsyncSession, tenant_id: uuid.UUID, attempt_count: int
) -> None:
    await _send_to_admins(
        db,
        tenant_id,
        lambda to, name: email_service.send_payment_failed(
            to, tenant_name=name, attempt_count=attempt_count
        ),
    )


async def expiring(db: AsyncSession, tenant_id: uuid.UUID, days_left: int) -> None:
    await _send_to_admins(
        db,
        tenant_id,
        lambda to, name: email_service.send_expiring_notice(
            to, tenant_name=name, days_left=days_left
        ),
    )


async def suspended(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    await _send_to_admins(
        db,
        tenant_id,
        lambda to, name: email_service.send_service_suspended(to, tenant_name=name),
    )


async def cancelled(
    db: AsyncSession, tenant_id: uuid.UUID, period_end: datetime
) -> None:
    await _send_to_admins(
        db,
        tenant_id,
        lambda to, name: email_service.send_cancellation_confirmed(
            to, tenant_name=name, period_end=period_end
        ),
    )


async def domain_activated(db: AsyncSession, tenant_id: uuid.UUID, domain: str) -> None:
    await _send_to_admins(
        db,
        tenant_id,
        lambda to, name: email_service.send_domain_activated(
            to, tenant_name=name, domain=domain
        ),
    )
