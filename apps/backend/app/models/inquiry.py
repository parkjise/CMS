import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin


class Inquiry(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "inquiries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    inquiry_type: Mapped[str] = mapped_column(String(50), nullable=False, default="GENERAL")
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="PENDING")
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_notified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    admin_memo: Mapped[str | None] = mapped_column(Text, nullable=True)

    attachments: Mapped[list["InquiryAttachment"]] = relationship(
        "InquiryAttachment", back_populates="inquiry", cascade="all, delete-orphan", lazy="noload"
    )


class InquiryAttachment(Base, TimestampMixin):
    __tablename__ = "inquiry_attachments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    inquiry_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("inquiries.id"), nullable=False, index=True)
    file_url: Mapped[str] = mapped_column(String(500), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)

    inquiry: Mapped["Inquiry"] = relationship("Inquiry", back_populates="attachments", lazy="noload")
