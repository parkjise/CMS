import uuid
from datetime import date

from sqlalchemy import Date, Float, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class SiteAnalytics(Base, TimestampMixin):
    __tablename__ = "site_analytics"
    __table_args__ = (
        UniqueConstraint("tenant_id", "date", name="uq_site_analytics_tenant_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    page_views: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unique_visitors: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bounce_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_session_duration: Mapped[int | None] = mapped_column(Integer, nullable=True)
