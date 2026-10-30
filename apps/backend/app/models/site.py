import uuid

from sqlalchemy import String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class SiteSetting(Base, TimestampMixin):
    """사업체 공통 정보 (T-036-A) — 푸터 · 로고 · 파비콘 · 구조화 데이터"""

    __tablename__ = "site_settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="site_settings_tenant_id_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(String(200), nullable=True)
    address_detail: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hours_weekday: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hours_saturday: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hours_note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    parking: Mapped[str | None] = mapped_column(String(200), nullable=True)
    ceo: Mapped[str | None] = mapped_column(String(50), nullable=True)
    business_number: Mapped[str | None] = mapped_column(String(12), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    favicon_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # 상단 메뉴 (T-036-B) — 순서대로 [{key, label, visible}], 없으면 템플릿 기본
    menu_items: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)
