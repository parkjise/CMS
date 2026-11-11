"""게시글 파일 첨부 (T-194) — 글과 업로드 파일(uploaded_files)의 연결 · 순서.

- board_post_attachments: 글마다 최대 5개 (서버가 검사), 빼면 소프트 삭제
- 글 · 파일이 실제로 지워지면 함께 지운다
- 다른 표와 같은 테넌트 격리 RLS

Revision ID: 0049
Revises: 0048
Create Date: 2026-11-11
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0049"
down_revision: str | None = "0048"
branch_labels = None
depends_on = None

_RLS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""


def upgrade() -> None:
    op.create_table(
        "board_post_attachments",
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
        sa.Column(
            "file_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("uploaded_files.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "display_order", sa.Integer, nullable=False, server_default=sa.text("0")
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_board_post_attachments_post",
        "board_post_attachments",
        ["post_id", "display_order"],
    )
    op.create_index(
        "ix_board_post_attachments_tenant_id", "board_post_attachments", ["tenant_id"]
    )
    op.execute("ALTER TABLE board_post_attachments ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE board_post_attachments FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY board_post_attachments_tenant_isolation"
        f" ON board_post_attachments USING ({_RLS_POLICY})"
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY board_post_attachments_tenant_isolation ON board_post_attachments"
    )
    op.drop_index("ix_board_post_attachments_tenant_id", "board_post_attachments")
    op.drop_index("ix_board_post_attachments_post", "board_post_attachments")
    op.drop_table("board_post_attachments")
