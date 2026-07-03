"""T-088 슈퍼 어드민 공지 API."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.deps import get_db_with_rls, get_super_admin
from app.models.user import User
from app.schemas.announcement import (
    AnnouncementCreateRequest,
    AnnouncementListItem,
    AnnouncementListResponse,
    AnnouncementResponse,
    AnnouncementUpdateRequest,
    SendResponse,
)
from app.schemas.common import ApiResponse
from app.services import announcement as svc

router = APIRouter(prefix="/announcements", tags=["super-announcements"])


@router.get("", response_model=ApiResponse[AnnouncementListResponse])
async def list_announcements(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_with_rls),
    _: User = Depends(get_super_admin),
):
    items, total = await svc.list_announcements(db, page=page, limit=limit)
    return ApiResponse.ok(
        AnnouncementListResponse(
            items=[
                AnnouncementListItem(
                    **AnnouncementResponse.model_validate(a).model_dump(),
                    read_count=count,
                )
                for a, count in items
            ],
            total=total,
        )
    )


@router.post("", response_model=ApiResponse[AnnouncementResponse])
async def create_announcement(
    body: AnnouncementCreateRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    ann = await svc.create_announcement(
        db,
        actor_id=current_user.id,
        title=body.title,
        content=body.content,
        type=body.type,
        target_type=body.target_type,
        target_plan=body.target_plan,
        target_tenants=body.target_tenants,
        show_in_admin=body.show_in_admin,
        send_email=body.send_email,
        send_kakao=body.send_kakao,
        publish_now=body.publish_now,
        published_at=body.published_at,
        expires_at=body.expires_at,
    )
    await log_action(
        db,
        current_user,
        action="ANNOUNCEMENT_CREATED",
        target_type="announcement",
        target_id=ann.id,
        after={"title": ann.title, "target_type": ann.target_type},
    )
    # 즉시 발행 + 발송 채널이 있으면 일괄 발송 태스크 큐잉
    if ann.is_published and (ann.send_kakao or ann.send_email):
        _enqueue_send(ann.id)
    return ApiResponse.ok(AnnouncementResponse.model_validate(ann))


@router.patch("/{announcement_id}", response_model=ApiResponse[AnnouncementResponse])
async def update_announcement(
    announcement_id: uuid.UUID,
    body: AnnouncementUpdateRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    ann = await svc.update_announcement(
        db, announcement_id, body.model_dump(exclude_unset=True)
    )
    await log_action(
        db,
        current_user,
        action="ANNOUNCEMENT_UPDATED",
        target_type="announcement",
        target_id=announcement_id,
    )
    return ApiResponse.ok(AnnouncementResponse.model_validate(ann))


@router.delete("/{announcement_id}", response_model=ApiResponse[dict])
async def delete_announcement(
    announcement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    await svc.delete_announcement(db, announcement_id)
    await log_action(
        db,
        current_user,
        action="ANNOUNCEMENT_DELETED",
        target_type="announcement",
        target_id=announcement_id,
    )
    return ApiResponse.ok({"deleted": True})


@router.post("/{announcement_id}/send", response_model=ApiResponse[SendResponse])
async def send_announcement(
    announcement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_super_admin),
):
    ann = await svc.publish(db, announcement_id)
    targets = await svc.resolve_target_tenant_ids(db, ann)
    await log_action(
        db,
        current_user,
        action="ANNOUNCEMENT_SENT",
        target_type="announcement",
        target_id=announcement_id,
        after={"target_count": len(targets)},
    )
    _enqueue_send(ann.id)
    return ApiResponse.ok(
        SendResponse(
            announcement_id=ann.id,
            target_count=len(targets),
            kakao_sent=0,  # 실제 발송 수는 비동기 태스크에서 처리
            email_pending=len(targets) if ann.send_email else 0,
        )
    )


def _enqueue_send(announcement_id: uuid.UUID) -> None:
    """카카오/이메일 일괄 발송 Celery 태스크 큐잉 (브로커 미가용 시 무시)."""
    try:
        from app.workers.announcement import send_announcement as task

        task.delay(str(announcement_id))
    except Exception:
        # 브로커 미가용 등은 배너 노출(주 채널)에 영향을 주지 않는다.
        pass
