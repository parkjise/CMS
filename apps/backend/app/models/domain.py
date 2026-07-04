"""T-095 테넌트 도메인 모델 (기획서 섹션 15.2).

TenantDomain: 테넌트당 1개의 커스텀/서브도메인. tenant_id 보유 → RLS 격리 대상.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TenantDomain(Base):
    __tablename__ = "tenant_domains"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="uq_tenant_domains_tenant"),
        UniqueConstraint("domain", name="uq_tenant_domains_domain"),
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
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    # SUBDOMAIN (서비스 제공), CUSTOM (고객 소유)
    domain_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # PENDING, DNS_CHECKING, SSL_ISSUING, ACTIVE, FAILED
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING")
    ssl_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
