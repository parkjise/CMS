import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
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
    # 비밀글 (T-151-A) — 작성 회원과 관리자만 내용을 본다
    is_secret: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
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
    # 홈페이지에서 쓴 회원 (T-150-B) — 관리자 글은 비어 있다
    author_member_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "site_members.id", name="fk_board_posts_author_member", ondelete="SET NULL"
        ),
        nullable=True,
        index=True,
    )
    # 비회원 글 (T-151-B) — 이름과 글 비밀번호(bcrypt). 회원 · 관리자 글은 비어 있다
    guest_name: Mapped[str | None] = mapped_column(String(20), nullable=True)
    guest_password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 카테고리 (T-149) — 비워 둘 수 있다. 같은 게시판의 분류인지는 서비스가 본다
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "board_categories.id", name="fk_board_posts_category", ondelete="SET NULL"
        ),
        nullable=True,
        index=True,
    )


class BoardField(Base, TimestampMixin, SoftDeleteMixin):
    """게시판에 더하는 칸 (T-142-A) — 값은 BoardPost.custom_data[field_key]."""

    __tablename__ = "board_fields"
    __table_args__ = (
        UniqueConstraint("board_id", "field_key", name="uq_board_fields_key"),
        Index("ix_board_fields_tenant_id", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    board_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("boards.id", ondelete="CASCADE"), nullable=False
    )
    field_key: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    field_type: Mapped[str] = mapped_column(String(20), nullable=False)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    help_text: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    placeholder: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    default_value: Mapped[Any] = mapped_column(JSONB(none_as_null=True), nullable=True)
    # {choices: [{value, label}], min, max} — 타입에 따라 쓰는 값만
    field_options: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class BoardCategory(Base, TimestampMixin, SoftDeleteMixin):
    """게시판 카테고리 — 상위 · 하위 2단계 분류 (T-149, T-179, BM-09)."""

    __tablename__ = "board_categories"
    __table_args__ = (
        Index("ix_board_categories_tenant_id", "tenant_id"),
        Index("ix_board_categories_parent_id", "parent_id"),
        Index(
            "uq_board_categories_name",
            "board_id",
            "name",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    board_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("boards.id", ondelete="CASCADE"), nullable=False
    )
    # 상위 분류 — 비어 있으면 1단계. 하위의 하위는 없다 (T-179)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("board_categories.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(30), nullable=False)
    # 끄면 홈페이지 분류 탭에서만 빠진다 — 글은 '전체'에 그대로
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class BoardPostReport(Base, TimestampMixin, SoftDeleteMixin):
    """글 신고 (T-151-B) — 신고자는 해시(reporter_key)만 남긴다."""

    __tablename__ = "board_post_reports"
    __table_args__ = (
        UniqueConstraint(
            "post_id", "reporter_key", name="uq_board_post_reports_reporter"
        ),
        Index("ix_board_post_reports_tenant_status", "tenant_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    post_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("board_posts.id", ondelete="CASCADE"),
        nullable=False,
    )
    # SPAM | ABUSE | PRIVACY | OTHER
    reason: Mapped[str] = mapped_column(String(20), nullable=False)
    detail: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    reporter_key: Mapped[str] = mapped_column(String(64), nullable=False)
    # OPEN | CLOSED
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN")
