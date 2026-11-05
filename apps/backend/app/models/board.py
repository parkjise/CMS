import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, SoftDeleteMixin, TimestampMixin


class Board(Base, TimestampMixin, SoftDeleteMixin):
    """사업체별 게시판 (게시판 모듈 기획서 8장, T-139)."""

    __tablename__ = "boards"
    __table_args__ = (UniqueConstraint("id", "tenant_id", name="uq_boards_id_tenant"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(60), nullable=False)
    board_type: Mapped[str] = mapped_column(String(20), nullable=False, default="LIST")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    # 템플릿 기본 게시판('notice') — 삭제 보호
    system_key: Mapped[str | None] = mapped_column(String(30), nullable=True)
    settings: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )


class BoardPost(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "board_posts"
    __table_args__ = (
        ForeignKeyConstraint(
            ["board_id", "tenant_id"],
            ["boards.id", "boards.tenant_id"],
            name="fk_board_posts_board_tenant",
            ondelete="CASCADE",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    board_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # 블록 JSON [{type: 'p' | 'ul' | 'image', ...}] — HTML 을 저장하지 않는다
    body: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # 필드 빌더(4단계)의 값 자리
    custom_data: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
