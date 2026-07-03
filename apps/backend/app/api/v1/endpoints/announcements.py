"""T-088 테넌트용 공지 API."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls
from app.models.user import User
from app.schemas.announcement import (
    MarkReadResponse,
    TenantAnnouncementItem,
    TenantAnnouncementListResponse,
)
from app.schemas.common import ApiResponse
from app.services import announcement as svc

router = APIRouter(prefix="/announcements", tags=["announcements"])


@router.get("", response_model=ApiResponse[TenantAnnouncementListResponse])
async def list_my_announcements(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    rows = await svc.list_for_tenant(db, current_user.tenant_id)
    items = [
        TenantAnnouncementItem(
            id=ann.id,
            title=ann.title,
            content=ann.content,
            type=ann.type,
            is_read=is_read,
            published_at=ann.published_at,
        )
        for ann, is_read in rows
    ]
    unread = sum(1 for i in items if not i.is_read)
    return ApiResponse.ok(
        TenantAnnouncementListResponse(items=items, unread_count=unread)
    )


@router.post("/{announcement_id}/read", response_model=ApiResponse[MarkReadResponse])
async def mark_announcement_read(
    announcement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    await svc.mark_read(db, current_user.tenant_id, announcement_id)
    return ApiResponse.ok(MarkReadResponse(announcement_id=announcement_id))
