"""add google_site_verification to seo_settings

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-29
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "seo_settings",
        sa.Column("google_site_verification", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("seo_settings", "google_site_verification")
