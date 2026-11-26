"""콘텐츠형 게시판 표시 (T-249, 페이지 관리 기획서 CM-01)

- boards.is_content: 페이지 섹션에 보여 줄 콘텐츠(서비스 · FAQ · 연혁 등)를 담는 게시판.
  글 통합 목록의 '콘텐츠형 게시판만' 필터가 쓴다. 콘텐츠형 프리셋으로 만들면 켜지고,
  게시판 설정에서 바꿀 수 있다. 기존 게시판은 모두 꺼짐 (표 구조만 더함, RLS 그대로)

Revision ID: 0063
Revises: 0062
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0063"
down_revision: str | None = "0062"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "boards",
        sa.Column(
            "is_content", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade() -> None:
    op.drop_column("boards", "is_content")
