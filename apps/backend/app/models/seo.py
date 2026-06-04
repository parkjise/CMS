import uuid

from sqlalchemy import String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class SeoSetting(Base, TimestampMixin):
    __tablename__ = "seo_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    meta_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    meta_description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    og_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    robots_txt: Mapped[str | None] = mapped_column(Text, nullable=True)
    google_analytics_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    naver_site_verification: Mapped[str | None] = mapped_column(String(100), nullable=True)
