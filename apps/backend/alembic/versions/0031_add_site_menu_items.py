"""상단 메뉴 설정 (T-036-B, 기획서 AD-02-A 공통 설정).

- site_settings.menu_items: 순서대로 [{key, label, visible}]
  key 는 테마형이면 섹션 id, 코드형이면 페이지 key. 비어 있으면 템플릿 기본 메뉴.

Revision ID: 0031
Revises: 0030
Create Date: 2026-10-30
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0031"
down_revision: str | None = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "site_settings",
        sa.Column("menu_items", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("site_settings", "menu_items")
