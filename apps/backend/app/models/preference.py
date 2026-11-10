import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, SoftDeleteMixin, TimestampMixin


class AdminUserPreference(Base, TimestampMixin, SoftDeleteMixin):
    """관리자 계정의 개인 화면 설정 (T-181) — 예: 게시판 글 표의 열 순서 · 크기.

    key 는 `post_table:{board_id}` 처럼 화면과 대상을 함께 담는다. 계정마다 key 하나.
    초기화는 소프트 삭제, 다시 저장하면 같은 행을 되살린다.
    """

    __tablename__ = "admin_user_preferences"
    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uq_admin_user_preferences_user_key"),
        Index("ix_admin_user_preferences_tenant_id", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
