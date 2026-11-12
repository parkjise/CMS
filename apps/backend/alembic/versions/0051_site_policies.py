"""이용약관 · 개인정보처리방침 (T-200, 상위 기획서 10.2 #7 · 16.3).

- site_settings.terms_body · privacy_body: 사업체가 고친 문서 (비어 있으면 기본 문안)
- site_settings.policies_updated_at: 마지막으로 고친 시각 — 시행일 표시

Revision ID: 0051
Revises: 0050
Create Date: 2026-11-11
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0051"
down_revision: str | None = "0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("site_settings", sa.Column("terms_body", sa.Text(), nullable=True))
    op.add_column("site_settings", sa.Column("privacy_body", sa.Text(), nullable=True))
    op.add_column(
        "site_settings",
        sa.Column("policies_updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("site_settings", "policies_updated_at")
    op.drop_column("site_settings", "privacy_body")
    op.drop_column("site_settings", "terms_body")
