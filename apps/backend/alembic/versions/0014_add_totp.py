"""add totp fields to users (super admin 2FA)

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-04

T-094 슈퍼 어드민 TOTP 2FA.
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("totp_secret", sa.String(length=64), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column(
            "totp_enabled", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "totp_enabled")
    op.drop_column("users", "totp_secret")
