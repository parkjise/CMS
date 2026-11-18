"""사이트 관리 AEO · GEO 설정 칸 (T-221, 사이트 관리 기획서 SM-05 · SM-06)

- seo_settings.aeo: FAQ 구조화 데이터를 만들 게시판 {faq_board_ids: [...]}
- seo_settings.geo: 기업 소개 · 주제 · 공식 프로필 · 출처 · AI 크롤러 정책

Revision ID: 0058
Revises: 0057
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "0058"
down_revision: str | None = "0057"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("seo_settings", sa.Column("aeo", JSONB(), nullable=True))
    op.add_column("seo_settings", sa.Column("geo", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("seo_settings", "geo")
    op.drop_column("seo_settings", "aeo")
