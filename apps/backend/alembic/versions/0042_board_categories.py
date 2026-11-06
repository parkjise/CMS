"""게시판 카테고리 (T-149, 게시판 모듈 기획서 BM-09).

- board_categories: 게시판마다 1단계 분류. 이름은 게시판 안에서 겹치지 않는다(삭제한 것 제외)
- board_posts.category_id: 글의 분류. 비워 둘 수 있다. 분류 삭제는 소프트 삭제이고,
  지울 때 서비스가 글을 다른 분류(또는 분류 없음)로 옮긴다

Revision ID: 0042
Revises: 0041
Create Date: 2026-11-06
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0042"
down_revision: str | None = "0041"
branch_labels = None
depends_on = None

_RLS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""


def upgrade() -> None:
    op.create_table(
        "board_categories",
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
        sa.Column("name", sa.String(30), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
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
    )
    op.create_index("ix_board_categories_tenant_id", "board_categories", ["tenant_id"])
    op.create_index(
        "uq_board_categories_name",
        "board_categories",
        ["board_id", "name"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.execute("ALTER TABLE board_categories ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE board_categories FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY board_categories_tenant_isolation ON board_categories"
        f" USING ({_RLS_POLICY})"
    )

    op.add_column(
        "board_posts",
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "board_categories.id",
                name="fk_board_posts_category",
                ondelete="SET NULL",
            ),
            nullable=True,
        ),
    )
    op.create_index("ix_board_posts_category_id", "board_posts", ["category_id"])


def downgrade() -> None:
    op.drop_index("ix_board_posts_category_id", "board_posts")
    op.drop_constraint("fk_board_posts_category", "board_posts", type_="foreignkey")
    op.drop_column("board_posts", "category_id")
    op.execute("DROP POLICY board_categories_tenant_isolation ON board_categories")
    op.drop_index("uq_board_categories_name", "board_categories")
    op.drop_index("ix_board_categories_tenant_id", "board_categories")
    op.drop_table("board_categories")
