"""휴대폰 인증 사용 시각 (T-108).

phone_verifications.used_at: 인증 완료 건을 가입·계정 찾기 등에 한 번 쓰면 기록한다.
같은 인증으로 여러 계정을 만들지 못하게 막는다.

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-26
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "phone_verifications",
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("phone_verifications", "used_at")
