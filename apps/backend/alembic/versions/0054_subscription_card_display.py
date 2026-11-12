"""결제 수단 표시 · 삭제 (T-207, 상위 기획서 AD-08 · 10.2 #13).

- subscriptions.card_company: 카드사 이름 (토스 빌링키 발급 응답)
- subscriptions.card_last4: 카드 번호 끝 4자리 — 전체 번호는 저장하지 않는다
  (기존 등록 카드는 비어 있고, 다시 등록하면 채워진다)

Revision ID: 0054
Revises: 0053
Create Date: 2026-11-12
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0054"
down_revision: str | None = "0053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "subscriptions", sa.Column("card_company", sa.String(30), nullable=True)
    )
    op.add_column("subscriptions", sa.Column("card_last4", sa.String(4), nullable=True))


def downgrade() -> None:
    op.drop_column("subscriptions", "card_last4")
    op.drop_column("subscriptions", "card_company")
