"""add mobile_views and referrers to site_analytics

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-29
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "site_analytics",
        sa.Column(
            "mobile_views",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "site_analytics",
        sa.Column(
            "referrers",
            JSONB(),
            nullable=False,
            server_default="{}",
        ),
    )


def downgrade() -> None:
    op.drop_column("site_analytics", "referrers")
    op.drop_column("site_analytics", "mobile_views")
