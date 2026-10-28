"""SNS 노출 위치 설정 (T-038-A, 기획서 AD-03).

sns_channel_settings:
- show_in_footer: 푸터에 SNS 아이콘 노출 (기본 켜짐)
- show_floating: 카카오톡 플로팅 버튼 노출 (기본 켜짐)
- floating_position: 플로팅 버튼 위치 BOTTOM_RIGHT · BOTTOM_LEFT (기본 우측 하단)
기본값이 지금까지의 동작과 같아 기존 사업체 화면은 바뀌지 않는다.

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-28
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0026"
down_revision: str | None = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sns_channel_settings",
        sa.Column(
            "show_in_footer", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
    )
    op.add_column(
        "sns_channel_settings",
        sa.Column(
            "show_floating", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
    )
    op.add_column(
        "sns_channel_settings",
        sa.Column(
            "floating_position",
            sa.String(20),
            nullable=False,
            server_default="BOTTOM_RIGHT",
        ),
    )
    op.create_check_constraint(
        "sns_channel_settings_floating_position_check",
        "sns_channel_settings",
        "floating_position IN ('BOTTOM_RIGHT', 'BOTTOM_LEFT')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "sns_channel_settings_floating_position_check", "sns_channel_settings"
    )
    op.drop_column("sns_channel_settings", "floating_position")
    op.drop_column("sns_channel_settings", "show_floating")
    op.drop_column("sns_channel_settings", "show_in_footer")
