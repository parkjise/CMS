import uuid
from datetime import date

from sqlalchemy import Boolean, Date, Integer, String, UniqueConstraint, true
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class SnsChannelSetting(Base, TimestampMixin):
    __tablename__ = "sns_channel_settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="sns_channel_settings_tenant_id_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    kakao_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    instagram_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    facebook_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    youtube_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    blog_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    naver_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # 노출 위치 (T-038-A, 기획서 AD-03) — 기본값은 이전 동작과 같음
    show_in_footer: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    show_floating: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    floating_position: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="BOTTOM_RIGHT",
        server_default="BOTTOM_RIGHT",
    )


class NotificationSetting(Base, TimestampMixin):
    __tablename__ = "notification_settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="notification_settings_tenant_id_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    alimtalk_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    sms_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    email_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    recipient_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    monthly_kakao_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    monthly_reset_at: Mapped[date] = mapped_column(Date, nullable=False)
