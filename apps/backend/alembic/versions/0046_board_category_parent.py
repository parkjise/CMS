"""게시판 카테고리 2단계 (T-179, 게시판 모듈 기획서 BM-09).

- board_categories.parent_id: 상위 분류. 비어 있으면 1단계 — 지금 분류는 모두 1단계로 남는다

Revision ID: 0046
Revises: 0045
Create Date: 2026-11-10
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0046"
down_revision: str | None = "0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "board_categories",
        sa.Column(
            "parent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("board_categories.id"),
            nullable=True,
        ),
    )
    op.create_index("ix_board_categories_parent_id", "board_categories", ["parent_id"])


def downgrade() -> None:
    op.drop_index("ix_board_categories_parent_id", table_name="board_categories")
    op.drop_column("board_categories", "parent_id")
