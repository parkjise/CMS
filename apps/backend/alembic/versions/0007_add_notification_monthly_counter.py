"""add monthly counter to notification_settings

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-10
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notification_settings",
        sa.Column(
            "monthly_kakao_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "notification_settings",
        sa.Column(
            "monthly_reset_at",
            sa.Date(),
            nullable=False,
            server_default=sa.func.current_date(),
        ),
    )


def downgrade() -> None:
    op.drop_column("notification_settings", "monthly_reset_at")
    op.drop_column("notification_settings", "monthly_kakao_count")
