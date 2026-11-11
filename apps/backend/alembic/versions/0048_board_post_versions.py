"""게시글 버전 이력 (T-191) — 관리자가 글을 고칠 때마다 고치기 직전 내용을 남긴다.

- board_post_versions: 글(post_id)마다 최근 20개, 글이 지워지면(실제 삭제) 함께 지운다
- 다른 표와 같은 테넌트 격리 RLS

Revision ID: 0048
Revises: 0047
Create Date: 2026-11-11
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0048"
down_revision: str | None = "0047"
branch_labels = None
depends_on = None

_RLS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""


def upgrade() -> None:
    op.create_table(
        "board_post_versions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "post_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("board_posts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column(
            "body",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "custom_data",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "is_pinned", sa.Boolean, nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "is_secret", sa.Boolean, nullable=False, server_default=sa.text("false")
        ),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "edited_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
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
    )
    op.create_index(
        "ix_board_post_versions_post_created",
        "board_post_versions",
        ["post_id", "created_at"],
    )
    op.create_index(
        "ix_board_post_versions_tenant_id", "board_post_versions", ["tenant_id"]
    )
    op.execute("ALTER TABLE board_post_versions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE board_post_versions FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY board_post_versions_tenant_isolation"
        f" ON board_post_versions USING ({_RLS_POLICY})"
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY board_post_versions_tenant_isolation ON board_post_versions"
    )
    op.drop_index("ix_board_post_versions_tenant_id", "board_post_versions")
    op.drop_index("ix_board_post_versions_post_created", "board_post_versions")
    op.drop_table("board_post_versions")
