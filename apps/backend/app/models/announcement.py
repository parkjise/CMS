"""T-088 테넌트 공지 시스템 모델 (기획서 섹션 14.3).

- Announcement: 공지 마스터 (글로벌, 슈퍼 어드민 전용 관리). 타겟팅으로 대상 테넌트 결정
- AnnouncementRead: 테넌트별 읽음 여부 (tenant_id 보유 → RLS 격리 대상)
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # INFO, WARNING, FEATURE_UPDATE, MAINTENANCE, URGENT
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    # ALL, PLAN_BASED, SELECTIVE
    target_type: Mapped[str] = mapped_column(String(20), nullable=False, default="ALL")
    target_plan: Mapped[str | None] = mapped_column(String(20), nullable=True)
    target_tenants: Mapped[list[uuid.UUID] | None] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=True
    )
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    show_in_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    send_email: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    send_kakao: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AnnouncementRead(Base):
    __tablename__ = "announcement_reads"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        primary_key=True,
    )
    announcement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("announcements.id", ondelete="CASCADE"),
        primary_key=True,
    )
    read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
