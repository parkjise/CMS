"""게시판 유형에 리뷰형 추가 (T-218, 게시판 모듈 기획서 1113 #7)

Revision ID: 0056
Revises: 0055
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0056"
down_revision: str | None = "0055"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_boards_type", "boards", type_="check")
    op.create_check_constraint(
        "ck_boards_type",
        "boards",
        "board_type IN ('LIST', 'GALLERY', 'FAQ', 'CARD', 'WEBZINE', 'REVIEW')",
    )


def downgrade() -> None:
    # 되돌리면 리뷰형이 없어지므로 목록형으로 — 글 · 별점 칸은 그대로 남는다
    op.execute("UPDATE boards SET board_type = 'LIST' WHERE board_type = 'REVIEW'")
    op.drop_constraint("ck_boards_type", "boards", type_="check")
    op.create_check_constraint(
        "ck_boards_type",
        "boards",
        "board_type IN ('LIST', 'GALLERY', 'FAQ', 'CARD', 'WEBZINE')",
    )
