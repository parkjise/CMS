"""T-088 공지 스키마."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

ANNOUNCEMENT_TYPES = ("INFO", "WARNING", "FEATURE_UPDATE", "MAINTENANCE", "URGENT")
TARGET_TYPES = ("ALL", "PLAN_BASED", "SELECTIVE")


# ── 슈퍼 어드민 ───────────────────────────────────────────────────────────
class AnnouncementCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=1)
    type: str = Field(..., max_length=30)
    target_type: str = "ALL"
    target_plan: str | None = Field(None, max_length=20)
    target_tenants: list[uuid.UUID] | None = None
    show_in_admin: bool = True
    send_email: bool = False
    send_kakao: bool = False
    # 즉시 발행 여부. False면 published_at(예약)에 맞춰 발행된다.
    publish_now: bool = True
    published_at: datetime | None = None
    expires_at: datetime | None = None


class AnnouncementUpdateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    content: str | None = Field(None, min_length=1)
    type: str | None = Field(None, max_length=30)
    target_type: str | None = Field(None, max_length=20)
    target_plan: str | None = Field(None, max_length=20)
    target_tenants: list[uuid.UUID] | None = None
    show_in_admin: bool | None = None
    send_email: bool | None = None
    send_kakao: bool | None = None
    expires_at: datetime | None = None


class AnnouncementResponse(BaseModel):
    id: uuid.UUID
    title: str
    content: str
    type: str
    target_type: str
    target_plan: str | None
    target_tenants: list[uuid.UUID] | None
    is_published: bool
    show_in_admin: bool
    send_email: bool
    send_kakao: bool
    published_at: datetime | None
    expires_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AnnouncementListItem(AnnouncementResponse):
    read_count: int = 0


class AnnouncementListResponse(BaseModel):
    items: list[AnnouncementListItem]
    total: int


class SendResponse(BaseModel):
    announcement_id: uuid.UUID
    target_count: int
    kakao_sent: int
    email_pending: int


# ── 테넌트용 ──────────────────────────────────────────────────────────────
class TenantAnnouncementItem(BaseModel):
    id: uuid.UUID
    title: str
    content: str
    type: str
    is_read: bool
    published_at: datetime | None

    model_config = {"from_attributes": True}


class TenantAnnouncementListResponse(BaseModel):
    items: list[TenantAnnouncementItem]
    unread_count: int


class MarkReadResponse(BaseModel):
    announcement_id: uuid.UUID
    is_read: bool = True
