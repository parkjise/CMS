"""페이지 · 주소 이동 기록 (T-237, 페이지 관리 기획서 PART C 1번).

템플릿 기본 페이지(TEMPLATE)와 고객이 직접 만든 페이지(CUSTOM)를 함께 둔다.
섹션은 sections.page_key 로 이 표의 page_key 에 이어진다.
"""

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, SoftDeleteMixin, TimestampMixin


class Page(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "pages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    # 주소 — /{slug}/{page_key}. 휴지통 · 다른 템플릿 페이지를 포함해 사업체 안에서 하나
    page_key: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(30), nullable=False)
    # TEMPLATE | CUSTOM
    origin: Mapped[str] = mapped_column(String(10), nullable=False)
    # 메뉴 묶음 (1단계) — 주소에는 들어가지 않는다
    parent_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    show_in_menu: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 비면 사이트 SEO 값
    seo_title: Mapped[str | None] = mapped_column(String(60), nullable=True)
    seo_description: Mapped[str | None] = mapped_column(String(160), nullable=True)
    og_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    noindex: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class PageRedirect(Base, TimestampMixin):
    """주소를 바꾸면 이전 주소 → 새 주소 (공개 라우트 301 은 T-242)."""

    __tablename__ = "page_redirects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    from_key: Mapped[str] = mapped_column(String(50), nullable=False)
    to_key: Mapped[str] = mapped_column(String(50), nullable=False)
