import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, UniqueConstraint
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
    # 사이트 기본정보 확장 (T-222)
    site_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    company_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    mail_order_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    business_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    business_item: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cs_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fax: Mapped[str | None] = mapped_column(String(20), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    hours_temp_note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    privacy_officer: Mapped[str | None] = mapped_column(String(50), nullable=True)
    privacy_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    copyright: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # 요일별 운영시간 {mon: {status, open, close, break_start, break_end}, ...}
    # 비어 있으면 예전 자유 글자(hours_weekday · hours_saturday)를 쓴다
    weekly_hours: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # 숨긴 공개 항목 묶음 키 — 없으면 모두 공개
    hidden_fields: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    # 상단 메뉴 (T-036-B) — 순서대로 [{key, label, visible}], 없으면 템플릿 기본
    menu_items: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)
    # 이용약관 · 개인정보처리방침 (T-200) — 비어 있으면 기본 문안을 그때그때 만든다
    terms_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    privacy_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    policies_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
