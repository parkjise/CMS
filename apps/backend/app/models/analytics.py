import uuid
from datetime import date

from sqlalchemy import Date, Float, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class SiteAnalytics(Base, TimestampMixin):
    __tablename__ = "site_analytics"
    __table_args__ = (
        UniqueConstraint("tenant_id", "date", name="uq_site_analytics_tenant_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    page_views: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unique_visitors: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 모바일 UA 페이지뷰 수 (모바일 비율 계산용)
    mobile_views: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 유입 경로별 카운트 {source: count} (예: {"naver": 12, "direct": 30})
    referrers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    bounce_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_session_duration: Mapped[int | None] = mapped_column(Integer, nullable=True)
