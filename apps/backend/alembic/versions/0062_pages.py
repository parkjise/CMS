"""페이지 · 주소 이동 기록 + CUSTOM_PAGES 기능 스위치 (T-237, 페이지 관리 기획서)

- pages: 템플릿 기본 페이지(TEMPLATE) + 직접 만든 페이지(CUSTOM).
  주소(page_key)는 휴지통을 포함해 사업체 안에서 하나.
  기존 사업체는 홈 행만 채운다 — 코드형 템플릿 페이지는 서비스가 처음 읽을 때 맞춘다.
- page_redirects: 주소를 바꾸면 이전 → 새 주소
- 두 표 모두 테넌트 격리 RLS
- CUSTOM_PAGES: features 에 줄만, 처음엔 꺼짐 (슈퍼 어드민이 사업체마다 켬)

Revision ID: 0062
Revises: 0061
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0062"
down_revision: str | None = "0061"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_RLS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""
_FEATURE = "CUSTOM_PAGES"


def _uuid_pk() -> sa.Column:
    return sa.Column(
        "id",
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )


def _tenant() -> sa.Column:
    return sa.Column(
        "tenant_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    ]


def _rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY {table}_tenant_isolation ON {table} USING ({_RLS_POLICY})"
    )


def upgrade() -> None:
    op.create_table(
        "pages",
        _uuid_pk(),
        _tenant(),
        sa.Column("page_key", sa.String(50), nullable=False),
        sa.Column("title", sa.String(30), nullable=False),
        # TEMPLATE | CUSTOM
        sa.Column("origin", sa.String(10), nullable=False),
        sa.Column("parent_key", sa.String(50), nullable=True),
        sa.Column("show_in_menu", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("is_public", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("seo_title", sa.String(60), nullable=True),
        sa.Column("seo_description", sa.String(160), nullable=True),
        sa.Column("og_image_url", sa.String(500), nullable=True),
        sa.Column("noindex", sa.Boolean, nullable=False, server_default=sa.false()),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "page_key", name="uq_pages_tenant_key"),
    )
    op.create_index("ix_pages_tenant_id", "pages", ["tenant_id"])
    _rls("pages")

    op.create_table(
        "page_redirects",
        _uuid_pk(),
        _tenant(),
        sa.Column("from_key", sa.String(50), nullable=False),
        sa.Column("to_key", sa.String(50), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint(
            "tenant_id", "from_key", name="uq_page_redirects_tenant_from"
        ),
    )
    op.create_index("ix_page_redirects_tenant_id", "page_redirects", ["tenant_id"])
    _rls("page_redirects")

    # 기존 사업체 — 홈 행 (템플릿 페이지는 서비스가 맞춘다)
    op.execute(
        """
        INSERT INTO pages (tenant_id, page_key, title, origin)
        SELECT id, 'home', '홈', 'TEMPLATE' FROM tenants
        """
    )

    op.get_bind().execute(
        sa.text(
            "INSERT INTO features (id, key, name, category, menu_position,"
            " default_enabled, is_beta, is_active, created_at, updated_at)"
            " SELECT gen_random_uuid(), CAST(:key AS varchar), '페이지 직접 추가',"
            " 'CONTENT', 15, false, false, true, now(), now()"
            " WHERE NOT EXISTS (SELECT 1 FROM features WHERE key = :key)"
        ),
        {"key": _FEATURE},
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM tenant_features WHERE feature_id IN"
            " (SELECT id FROM features WHERE key = :key)"
        ).bindparams(key=_FEATURE)
    )
    op.execute(
        sa.text("DELETE FROM features WHERE key = :key").bindparams(key=_FEATURE)
    )
    op.execute("DROP POLICY page_redirects_tenant_isolation ON page_redirects")
    op.drop_index("ix_page_redirects_tenant_id", "page_redirects")
    op.drop_table("page_redirects")
    op.execute("DROP POLICY pages_tenant_isolation ON pages")
    op.drop_index("ix_pages_tenant_id", "pages")
    op.drop_table("pages")
