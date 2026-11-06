"""비밀글 (T-151-A, 게시판 모듈 기획서 BM-11).

- board_posts.is_secret: 작성 회원과 관리자만 내용을 본다. 홈페이지 목록에는 제목만

Revision ID: 0044
Revises: 0043
Create Date: 2026-11-06
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0044"
down_revision: str | None = "0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "board_posts",
        sa.Column("is_secret", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("board_posts", "is_secret")
