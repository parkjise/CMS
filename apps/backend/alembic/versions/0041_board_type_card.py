"""게시판 유형에 카드형 추가 (T-148)

Revision ID: 0041
Revises: 0040
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0041"
down_revision: str | None = "0040"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_boards_type", "boards", type_="check")
    op.create_check_constraint(
        "ck_boards_type",
        "boards",
        "board_type IN ('LIST', 'GALLERY', 'FAQ', 'CARD')",
    )


def downgrade() -> None:
    # 되돌리면 카드형이 없어지므로 목록형으로 — 글은 그대로 남는다
    op.execute("UPDATE boards SET board_type = 'LIST' WHERE board_type = 'CARD'")
    op.drop_constraint("ck_boards_type", "boards", type_="check")
    op.create_check_constraint(
        "ck_boards_type",
        "boards",
        "board_type IN ('LIST', 'GALLERY', 'FAQ')",
    )
