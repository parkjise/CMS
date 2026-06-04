"""add admin_memo to inquiries

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-03

"""

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("inquiries", sa.Column("admin_memo", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("inquiries", "admin_memo")
