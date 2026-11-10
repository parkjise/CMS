"""관리자 개인 화면 설정 (T-181) — 게시판 글 표 열 순서 · 크기를 계정마다 서버에.

- admin_user_preferences: 계정(user_id)마다 key 하나(`post_table:{board_id}`), value JSON
- 다른 표와 같은 테넌트 격리 RLS

Revision ID: 0047
Revises: 0046
Create Date: 2026-11-10
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0047"
down_revision: str | None = "0046"
branch_labels = None
depends_on = None

_RLS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""


def upgrade() -> None:
    op.create_table(
        "admin_user_preferences",
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
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column(
            "value",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
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
        sa.UniqueConstraint(
            "user_id", "key", name="uq_admin_user_preferences_user_key"
        ),
    )
    op.create_index(
        "ix_admin_user_preferences_tenant_id", "admin_user_preferences", ["tenant_id"]
    )
    op.execute("ALTER TABLE admin_user_preferences ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE admin_user_preferences FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY admin_user_preferences_tenant_isolation"
        f" ON admin_user_preferences USING ({_RLS_POLICY})"
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY admin_user_preferences_tenant_isolation ON admin_user_preferences"
    )
    op.drop_index("ix_admin_user_preferences_tenant_id", "admin_user_preferences")
    op.drop_table("admin_user_preferences")
