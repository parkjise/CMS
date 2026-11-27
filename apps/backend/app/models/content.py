"""독립 콘텐츠 관리 (T-253, 콘텐츠 관리 기획서 4장).

게시판과 다른 '홈페이지에 들어갈 정보' — 관리자만 쓰고 섹션으로 보여 준다.
칸 종류 · 값 검사는 게시판 칸(board_field)과 함께 쓴다.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, SoftDeleteMixin, TimestampMixin

STATUS_DRAFT = "DRAFT"
STATUS_PUBLISHED = "PUBLISHED"


def _id() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _tenant() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )


class ContentType(Base, TimestampMixin, SoftDeleteMixin):
    """콘텐츠 유형 (CM-03) — 서비스 · FAQ · 연혁 · 팀 …"""

    __tablename__ = "content_types"

    id: Mapped[uuid.UUID] = _id()
    tenant_id: Mapped[uuid.UUID] = _tenant()
    # 휴지통을 포함해 사업체 안에서 하나 — 공개 API 주소에 쓴다
    type_key: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    # 시작용 유형에서 만들었으면 그 키 (content_presets)
    preset_key: Mapped[str | None] = mapped_column(String(30), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ContentTypeField(Base, TimestampMixin, SoftDeleteMixin):
    """유형의 칸 — 모양은 BoardField 와 같고 값은 ContentItem.data[field_key]."""

    __tablename__ = "content_type_fields"

    id: Mapped[uuid.UUID] = _id()
    tenant_id: Mapped[uuid.UUID] = _tenant()
    type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_types.id"), nullable=False
    )
    field_key: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    field_type: Mapped[str] = mapped_column(String(20), nullable=False)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    help_text: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    placeholder: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    default_value: Mapped[Any] = mapped_column(JSONB(none_as_null=True), nullable=True)
    # {choices: [{value, label}], min, max} — 타입에 따라 쓰는 값만
    field_options: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ContentCategory(Base, TimestampMixin, SoftDeleteMixin):
    """유형별 카테고리 (CM-05) — 2단계."""

    __tablename__ = "content_categories"

    id: Mapped[uuid.UUID] = _id()
    tenant_id: Mapped[uuid.UUID] = _tenant()
    type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_types.id"), nullable=False
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_categories.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(30), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ContentItem(Base, TimestampMixin, SoftDeleteMixin):
    """콘텐츠 항목 (CM-01 · 02) — 공개(PUBLISHED)만 홈페이지에 나온다."""

    __tablename__ = "content_items"

    id: Mapped[uuid.UUID] = _id()
    tenant_id: Mapped[uuid.UUID] = _tenant()
    type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_types.id"), nullable=False
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_categories.id"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    summary: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    body: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB(none_as_null=True), nullable=True
    )
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default=STATUS_DRAFT
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )


class ContentTag(Base, TimestampMixin, SoftDeleteMixin):
    """사업체 공통 태그 (CM-05) — 같은 이름(대소문자 무시)은 하나."""

    __tablename__ = "content_tags"

    id: Mapped[uuid.UUID] = _id()
    tenant_id: Mapped[uuid.UUID] = _tenant()
    name: Mapped[str] = mapped_column(String(30), nullable=False)


class ContentItemTag(Base, TimestampMixin):
    """항목 ↔ 태그."""

    __tablename__ = "content_item_tags"

    id: Mapped[uuid.UUID] = _id()
    tenant_id: Mapped[uuid.UUID] = _tenant()
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_items.id"), nullable=False
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_tags.id"), nullable=False
    )
