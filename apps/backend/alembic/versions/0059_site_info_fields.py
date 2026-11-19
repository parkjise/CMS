"""사이트 기본정보 확장 · 공개 항목 선택 (T-222, 사이트 관리 기획서 SM-01)

- 브랜드 · 사업자 · 연락처 칸: 사이트명 · 회사명 · 통신판매업 · 업태 · 종목
  · 고객센터 · 팩스 · 우편번호
- 요일별 운영시간 weekly_hours (JSONB) · 임시 운영 안내
- 개인정보 보호책임자 · 문의 이메일 · 저작권 문구
- 숨긴 공개 항목 hidden_fields (JSONB) — 없으면 모두 공개 (지금 화면 그대로)

Revision ID: 0059
Revises: 0058
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "0059"
down_revision: str | None = "0058"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TEXT = (
    ("site_name", 100),
    ("company_name", 100),
    ("mail_order_number", 50),
    ("business_type", 50),
    ("business_item", 100),
    ("cs_phone", 20),
    ("fax", 20),
    ("postal_code", 10),
    ("hours_temp_note", 200),
    ("privacy_officer", 50),
    ("privacy_email", 255),
    ("copyright", 200),
)


def upgrade() -> None:
    for name, length in _TEXT:
        column = sa.Column(name, sa.String(length), nullable=True)
        op.add_column("site_settings", column)
    op.add_column("site_settings", sa.Column("weekly_hours", JSONB(), nullable=True))
    op.add_column("site_settings", sa.Column("hidden_fields", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("site_settings", "hidden_fields")
    op.drop_column("site_settings", "weekly_hours")
    for name, _ in reversed(_TEXT):
        op.drop_column("site_settings", name)
