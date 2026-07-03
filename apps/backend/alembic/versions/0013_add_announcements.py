"""add announcement tables (announcements, announcement_reads)

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-03

T-088 공지 시스템. announcement_reads만 tenant_id 보유 → RLS 격리 적용.
announcements는 글로벌 마스터 테이블 (슈퍼 어드민 전용, 타겟팅으로 대상 결정).
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels = None
depends_on = None

_READS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""


def upgrade() -> None:
    # ── announcements (글로벌 마스터) ────────────────────────────────────
    op.create_table(
        "announcements",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("target_type", sa.String(20), nullable=False, server_default="ALL"),
        sa.Column("target_plan", sa.String(20), nullable=True),
        sa.Column(
            "target_tenants",
            postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
            nullable=True,
        ),
        sa.Column(
            "is_published", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "show_in_admin", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.Column(
            "send_email", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "send_kakao", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_announcements_published", "announcements", ["is_published", "published_at"]
    )

    # ── announcement_reads (테넌트 격리 대상) ────────────────────────────
    op.create_table(
        "announcement_reads",
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "announcement_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("announcements.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "read_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_announcement_reads_announcement", "announcement_reads", ["announcement_id"]
    )
    op.execute("ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE announcement_reads FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY announcement_reads_tenant_isolation ON announcement_reads "
        f"USING ({_READS_POLICY})"
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS announcement_reads_tenant_isolation "
        "ON announcement_reads"
    )
    op.drop_index("ix_announcement_reads_announcement", "announcement_reads")
    op.drop_table("announcement_reads")
    op.drop_index("ix_announcements_published", "announcements")
    op.drop_table("announcements")
