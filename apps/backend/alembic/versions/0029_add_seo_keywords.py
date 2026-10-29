"""SEO 대표 키워드 (T-040-A, 기획서 5.7 · 6 seo_settings.keywords).

- seo_settings.keywords: 텍스트 배열, 기본 빈 배열
  (최대 5개 · 1개 30자는 서비스에서 검증)
  홈페이지 JSON-LD keywords · AI 문구 추천 컨텍스트에 쓰인다.

Revision ID: 0029
Revises: 0028
Create Date: 2026-10-29
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0029"
down_revision: str | None = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "seo_settings",
        sa.Column(
            "keywords",
            postgresql.ARRAY(sa.String(30)),
            nullable=False,
            server_default=sa.text("'{}'::varchar[]"),
        ),
    )


def downgrade() -> None:
    op.drop_column("seo_settings", "keywords")
