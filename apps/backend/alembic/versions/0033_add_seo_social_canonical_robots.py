"""SEO 소셜 제목 · 설명 · 대표 주소 · 검색 노출 (T-129, 기획서 5.7 · 10.1).

Revision ID: 0033
Revises: 0032
Create Date: 2026-11-04
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0033"
down_revision: str | None = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("seo_settings", sa.Column("og_title", sa.String(60), nullable=True))
    op.add_column(
        "seo_settings", sa.Column("og_description", sa.String(200), nullable=True)
    )
    op.add_column(
        "seo_settings", sa.Column("canonical_url", sa.String(500), nullable=True)
    )
    op.add_column(
        "seo_settings",
        sa.Column(
            "robots", sa.String(20), nullable=False, server_default="index,follow"
        ),
    )
    op.create_check_constraint(
        "ck_seo_settings_robots",
        "seo_settings",
        "robots IN ('index,follow','noindex,follow','index,nofollow','noindex,nofollow')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_seo_settings_robots", "seo_settings", type_="check")
    op.drop_column("seo_settings", "robots")
    op.drop_column("seo_settings", "canonical_url")
    op.drop_column("seo_settings", "og_description")
    op.drop_column("seo_settings", "og_title")
