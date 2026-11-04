"""문의 접수 IP · 브라우저 정보 (T-128, 기획서 6.2 · 10.1).

스팸 판단용. 개인정보라 90일 뒤 지운다 (workers/scheduled.py) — 응답 · 내보내기에는 넣지 않는다.

Revision ID: 0032
Revises: 0031
Create Date: 2026-11-04
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0032"
down_revision: str | None = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("inquiries", sa.Column("ip_address", sa.String(45), nullable=True))
    op.add_column("inquiries", sa.Column("user_agent", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("inquiries", "user_agent")
    op.drop_column("inquiries", "ip_address")
