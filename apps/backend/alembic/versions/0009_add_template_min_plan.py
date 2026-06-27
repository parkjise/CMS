"""add min_plan to templates

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-28
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "templates",
        sa.Column(
            "min_plan",
            sa.String(length=50),
            nullable=False,
            server_default="BASIC",
        ),
    )


def downgrade() -> None:
    op.drop_column("templates", "min_plan")
