"""구독 해지 사유 저장 (T-134, 기획서 15.7).

Revision ID: 0035
Revises: 0034
Create Date: 2026-11-04
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0035"
down_revision: str | None = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "subscriptions", sa.Column("cancel_reason", sa.String(200), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("subscriptions", "cancel_reason")
