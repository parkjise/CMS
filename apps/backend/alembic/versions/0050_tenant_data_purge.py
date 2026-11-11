"""해지 · 정지 사업체 데이터 파기 (T-198, 기획서 10.2 #5 · #6).

- tenants.purge_notified_at: 파기 7일 전 예고 메일을 보낸 시각 — 두 번 보내지 않게
- tenants.data_purged_at: 파기를 마친 시각 — 다시 돌지 않게, 슈퍼 어드민 표시

Revision ID: 0050
Revises: 0049
Create Date: 2026-11-11
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0050"
down_revision: str | None = "0049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("purge_notified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "tenants",
        sa.Column("data_purged_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenants", "data_purged_at")
    op.drop_column("tenants", "purge_notified_at")
