import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.tenant import Tenant


class Section(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "sections"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    section_type: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 섹션이 속한 페이지 ('home' | 'about' …) — 코드형 템플릿 서브 페이지 (기획서 11.9)
    page_key: Mapped[str] = mapped_column(
        String(50), nullable=False, default="home", server_default="home"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    tenant: Mapped["Tenant"] = relationship(
        "Tenant", back_populates="sections", lazy="noload"
    )
    settings: Mapped[list["SectionSetting"]] = relationship(
        "SectionSetting",
        back_populates="section",
        cascade="all, delete-orphan",
        lazy="noload",
    )


class SectionSetting(Base, TimestampMixin):
    __tablename__ = "section_settings"
    __table_args__ = (
        UniqueConstraint("section_id", "field_key", name="uq_section_settings_field"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sections.id"), nullable=False, index=True
    )
    field_key: Mapped[str] = mapped_column(String(100), nullable=False)
    field_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="STRING"
    )
    # 템플릿 샘플 값 그대로면 true — 고객이 한 번이라도 저장하면 false (기획서 11.8)
    is_sample: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    section: Mapped["Section"] = relationship(
        "Section", back_populates="settings", lazy="noload"
    )
