import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Template(Base, TimestampMixin):
    """전체 테넌트가 공유하는 글로벌 템플릿 카탈로그. RLS 미적용."""

    __tablename__ = "templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    template_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # 템플릿 코드 ('TPL_HOSPITAL_A') — 클라이언트 레지스트리 키 (기획서 11.7)
    code: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True)
    # theme: 공용 섹션 컴포넌트 + CSS 변수 / code: 템플릿 전용 마크업·스타일
    renderer: Mapped[str] = mapped_column(
        String(10), nullable=False, default="theme", server_default="theme"
    )
    # 코드형 템플릿 스타일 작성 방식: tailwind | scss
    styling: Mapped[str] = mapped_column(
        String(10), nullable=False, default="tailwind", server_default="tailwind"
    )
    version: Mapped[str] = mapped_column(
        String(20), nullable=False, default="1.0.0", server_default="1.0.0"
    )
    # 처음 적용 시 복사할 샘플 {site, pages: {page_key: [섹션]}} (기획서 11.8)
    sample_content: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    css_variables: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    section_layouts: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # 이 템플릿을 사용하려면 필요한 최소 플랜 (FREE<BASIC<STANDARD<PREMIUM)
    min_plan: Mapped[str] = mapped_column(
        String(50), nullable=False, default="BASIC", server_default="BASIC"
    )


class TenantTemplateOverride(Base, TimestampMixin):
    __tablename__ = "tenant_template_overrides"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="tenant_template_overrides_tenant_id_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates.id"), nullable=False
    )
    css_overrides: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    applied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class TemplateChangeHistory(Base):
    __tablename__ = "template_change_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates.id"), nullable=False
    )
    changed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    before_css: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after_css: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # content_mode=replace_with_sample 로 교체되기 전 콘텐츠 (롤백 시 복원)
    content_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
