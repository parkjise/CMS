"""T-086 기능 플래그 시스템 모델 (기획서 섹션 14.3).

- Feature: 기능 마스터 (글로벌, 슈퍼 어드민 전용 관리)
- TenantFeature: 테넌트별 활성화 상태 (tenant_id 보유 → RLS 격리 대상)
- FeatureDeployment: 기능 배포 이력 (글로벌, append-only)
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Feature(Base, TimestampMixin):
    __tablename__ = "features"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    key: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # CONTENT, NOTIFICATION, AI, SEO, ANALYTICS, INTEGRATION
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    menu_path: Mapped[str | None] = mapped_column(String(200), nullable=True)
    menu_icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    menu_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    menu_position: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=99)
    default_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    # NULL=전체, "STANDARD", "PREMIUM"
    required_plan: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_beta: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    release_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class TenantFeature(Base, TimestampMixin):
    __tablename__ = "tenant_features"
    __table_args__ = (
        UniqueConstraint("tenant_id", "feature_id", name="uq_tenant_features_pair"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    feature_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("features.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    enabled_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class FeatureDeployment(Base):
    __tablename__ = "feature_deployments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    feature_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("features.id"), nullable=False, index=True
    )
    # GLOBAL, PLAN_BASED, SELECTIVE, GRADUAL
    deployment_type: Mapped[str] = mapped_column(String(30), nullable=False)
    target_plan: Mapped[str | None] = mapped_column(String(20), nullable=True)
    target_tenants: Mapped[list[uuid.UUID] | None] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=True
    )
    rollout_percent: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    affected_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    deployed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    deployed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    rollback_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
