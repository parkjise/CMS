"""문의 업종별 추가 항목 (T-051-A, 기획서 16.2).

inquiries.detail: 업종별 문의 폼 칸 값 (병원: 진료과 · 초진/재진 · 증상,
펜션: 체크인 · 체크아웃 · 인원 · 객실, 일반: 회사명 · 문의 분야).
칸 정의 · 검증은 app/services/inquiry_fields.py. 기존 문의는 빈 객체.

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-27
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "inquiries",
        sa.Column(
            "detail",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("inquiries", "detail")
