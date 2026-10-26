"""방문자 회원 비밀번호 변경 시각 (T-109).

site_members.password_changed_at: 비밀번호 재설정·변경 시각.
이 시각 이전에 발급된 refresh 토큰은 거부해 다른 기기의 로그인을 끊는다.

Revision ID: 0021
Revises: 0020
Create Date: 2026-10-26
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "site_members",
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("site_members", "password_changed_at")
