"""게시판 필드 정의 (T-142-A, 게시판 모듈 기획서 BM-04 · 8.4).

- board_fields: 게시판마다 글에 더하는 칸. 값은 board_posts.custom_data 에 field_key 로
- 필드 삭제는 소프트 삭제 — 값을 보존하고 복원할 수 있다. 지운 field_key 는 재사용 안 함

Revision ID: 0040
Revises: 0039
Create Date: 2026-11-05
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0040"
down_revision: str | None = "0039"
branch_labels = None
depends_on = None

_RLS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""


def upgrade() -> None:
    op.create_table(
        "board_fields",
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
            "board_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("boards.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("field_key", sa.String(50), nullable=False),
        sa.Column("label", sa.String(50), nullable=False),
        sa.Column("field_type", sa.String(20), nullable=False),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("help_text", sa.String(200), nullable=False, server_default=""),
        sa.Column("placeholder", sa.String(100), nullable=False, server_default=""),
        sa.Column("default_value", postgresql.JSONB(), nullable=True),
        sa.Column(
            "field_options",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
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
        sa.UniqueConstraint("board_id", "field_key", name="uq_board_fields_key"),
    )
    op.create_index("ix_board_fields_tenant_id", "board_fields", ["tenant_id"])
    op.execute("ALTER TABLE board_fields ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE board_fields FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY board_fields_tenant_isolation ON board_fields"
        f" USING ({_RLS_POLICY})"
    )


def downgrade() -> None:
    op.execute("DROP POLICY board_fields_tenant_isolation ON board_fields")
    op.drop_index("ix_board_fields_tenant_id", "board_fields")
    op.drop_table("board_fields")
