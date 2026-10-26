"""방문자 회원 탈퇴 사유 (T-111, 기획서 16.8).

site_members.withdrawal_reason: 탈퇴 사유 코드(+ 기타 입력). 탈퇴 시 개인정보는 익명화하고
사유 · 탈퇴 시각만 남긴다 (테넌트 통계용).

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-26
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "site_members",
        sa.Column("withdrawal_reason", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("site_members", "withdrawal_reason")
