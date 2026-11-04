"""도메인 연결 실패 사유 (T-137-C, 기획서 15.3).

Revision ID: 0036
Revises: 0035
Create Date: 2026-11-04
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0036"
down_revision: str | None = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenant_domains", sa.Column("failure_code", sa.String(20), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("tenant_domains", "failure_code")
