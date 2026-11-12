"""문의 알림톡 답장 기록 (T-203, 상위 기획서 AD-04-M · 10.2 #13).

- inquiries.reply_message: 문의자에게 보낸 답장 내용
- inquiries.reply_channel: KAKAO (알림톡) | SMS (알림톡 실패 · 꺼짐 시 문자)
- inquiries.replied_at: 보낸 시각

Revision ID: 0052
Revises: 0051
Create Date: 2026-11-12
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0052"
down_revision: str | None = "0051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("inquiries", sa.Column("reply_message", sa.Text(), nullable=True))
    op.add_column("inquiries", sa.Column("reply_channel", sa.String(10), nullable=True))
    op.add_column(
        "inquiries",
        sa.Column("replied_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("inquiries", "replied_at")
    op.drop_column("inquiries", "reply_channel")
    op.drop_column("inquiries", "reply_message")
