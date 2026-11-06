"""게시글 작성 회원 (T-150-B, 게시판 모듈 기획서 BM-10).

- board_posts.author_member_id: 홈페이지에서 회원이 쓴 글의 작성자. 관리자 글은 비어 있다
- 회원이 지워지면(실제 삭제) 글은 남고 작성자만 비운다. 탈퇴는 소프트 삭제라 그대로 남는다

Revision ID: 0043
Revises: 0042
Create Date: 2026-11-06
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0043"
down_revision: str | None = "0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "board_posts",
        sa.Column(
            "author_member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "site_members.id",
                name="fk_board_posts_author_member",
                ondelete="SET NULL",
            ),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_board_posts_author_member_id", "board_posts", ["author_member_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_board_posts_author_member_id", "board_posts")
    op.drop_constraint(
        "fk_board_posts_author_member", "board_posts", type_="foreignkey"
    )
    op.drop_column("board_posts", "author_member_id")
