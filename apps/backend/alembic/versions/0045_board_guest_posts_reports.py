"""비회원 글쓰기 · 신고 (T-151-B, 게시판 모듈 기획서 BM-11).

- board_posts.guest_name · guest_password_hash: 비회원 글의 이름과 글 비밀번호(bcrypt)
- board_post_reports: 글 신고. 신고한 사람은 회원 id · IP 를 서버 비밀값으로 해시한 값만
  남긴다(reporter_key) — 같은 사람이 같은 글을 두 번 신고하지 못하게

Revision ID: 0045
Revises: 0044
Create Date: 2026-11-06
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0045"
down_revision: str | None = "0044"
branch_labels = None
depends_on = None

_RLS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""


def upgrade() -> None:
    op.add_column("board_posts", sa.Column("guest_name", sa.String(20), nullable=True))
    op.add_column(
        "board_posts", sa.Column("guest_password_hash", sa.String(255), nullable=True)
    )
    op.create_table(
        "board_post_reports",
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
        sa.Column("reason", sa.String(20), nullable=False),
        sa.Column("detail", sa.String(200), nullable=False, server_default=""),
        sa.Column("reporter_key", sa.String(64), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="OPEN"),
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
        sa.UniqueConstraint(
            "post_id", "reporter_key", name="uq_board_post_reports_reporter"
        ),
    )
    op.create_index(
        "ix_board_post_reports_tenant_status",
        "board_post_reports",
        ["tenant_id", "status"],
    )
    op.execute("ALTER TABLE board_post_reports ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE board_post_reports FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY board_post_reports_tenant_isolation ON board_post_reports"
        f" USING ({_RLS_POLICY})"
    )


def downgrade() -> None:
    op.execute("DROP POLICY board_post_reports_tenant_isolation ON board_post_reports")
    op.drop_index("ix_board_post_reports_tenant_status", "board_post_reports")
    op.drop_table("board_post_reports")
    op.drop_column("board_posts", "guest_password_hash")
    op.drop_column("board_posts", "guest_name")
