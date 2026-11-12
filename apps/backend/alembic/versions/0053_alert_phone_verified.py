"""알림 받을 번호 인증 (T-204, 상위 기획서 AD-03 · 10.2 #13).

- notification_settings.recipient_phone_verified_at: 문자 인증한 시각
  (번호를 바꾸면 새로 인증해야 저장된다. 비어 있으면 '인증 필요' 표시)

Revision ID: 0053
Revises: 0052
Create Date: 2026-11-12
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0053"
down_revision: str | None = "0052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notification_settings",
        sa.Column(
            "recipient_phone_verified_at", sa.DateTime(timezone=True), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("notification_settings", "recipient_phone_verified_at")
