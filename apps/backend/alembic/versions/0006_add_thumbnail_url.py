"""add thumbnail_url to uploaded_files

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-07
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "uploaded_files",
        sa.Column("thumbnail_url", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("uploaded_files", "thumbnail_url")
