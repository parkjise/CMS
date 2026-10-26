"""문의 → 상담 게시판 · 예약 필드 (기획서 11.9, T-123).

- subject: 제목 (상담·예약)
- is_board: 온라인 상담 게시판에 올라간 글
- is_secret / password_hash: 비밀글과 작성자 확인용 비밀번호 (bcrypt)
- answer / answered_at: 관리자 답변 (AD-04 에서 작성, 게시판 상세에 표시)
- reserved_date / reserved_time: 온라인 예약 희망 일시

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-25
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "inquiries", sa.Column("subject", sa.String(length=200), nullable=True)
    )
    op.add_column(
        "inquiries",
        sa.Column("is_board", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "inquiries",
        sa.Column("is_secret", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "inquiries", sa.Column("password_hash", sa.String(length=255), nullable=True)
    )
    op.add_column("inquiries", sa.Column("answer", sa.Text(), nullable=True))
    op.add_column(
        "inquiries",
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("inquiries", sa.Column("reserved_date", sa.Date(), nullable=True))
    op.add_column(
        "inquiries", sa.Column("reserved_time", sa.String(length=5), nullable=True)
    )
    op.create_index(
        "idx_inquiries_tenant_board",
        "inquiries",
        ["tenant_id", "is_board", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_inquiries_tenant_board", table_name="inquiries")
    for column in (
        "reserved_time",
        "reserved_date",
        "answered_at",
        "answer",
        "password_hash",
        "is_secret",
        "is_board",
        "subject",
    ):
        op.drop_column("inquiries", column)
