"""게시판 문의형(Q&A) — 유형 · 관리자 답변 칸 (T-219, 게시판 모듈 기획서 1113 #7)

- boards.ck_boards_type 에 QNA
- board_posts.answer: 관리자 답변 (글자만, 빈 줄로 문단)
- board_posts.answered_at · answered_by: 답변 시각 · 답변한 관리자 (FK 없음)

Revision ID: 0057
Revises: 0056
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "0057"
down_revision: str | None = "0056"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TYPES = "'LIST', 'GALLERY', 'FAQ', 'CARD', 'WEBZINE', 'REVIEW'"


def upgrade() -> None:
    op.drop_constraint("ck_boards_type", "boards", type_="check")
    op.create_check_constraint(
        "ck_boards_type", "boards", f"board_type IN ({TYPES}, 'QNA')"
    )
    op.add_column("board_posts", sa.Column("answer", sa.Text(), nullable=True))
    op.add_column(
        "board_posts",
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "board_posts", sa.Column("answered_by", UUID(as_uuid=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("board_posts", "answered_by")
    op.drop_column("board_posts", "answered_at")
    op.drop_column("board_posts", "answer")
    # 되돌리면 문의형이 없어지므로 목록형으로 — 글은 그대로 남는다 (답변은 지워진다)
    op.execute("UPDATE boards SET board_type = 'LIST' WHERE board_type = 'QNA'")
    op.drop_constraint("ck_boards_type", "boards", type_="check")
    op.create_check_constraint("ck_boards_type", "boards", f"board_type IN ({TYPES})")
