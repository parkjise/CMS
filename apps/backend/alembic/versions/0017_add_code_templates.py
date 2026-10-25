"""코드형 템플릿 · 샘플 콘텐츠 · 서브 페이지 (기획서 11.7 ~ 11.10, T-117).

- templates: code(템플릿 코드 'TPL_HOSPITAL_A', 클라이언트 레지스트리 키),
  renderer(theme|code), styling(tailwind|scss), version, sample_content
- sections.page_key: 섹션이 속한 페이지 (기본 'home')
- section_settings.is_sample: 템플릿 샘플 값 그대로인지 (고객이 저장하면 false)
- template_change_history.content_snapshot: 샘플로 교체 전 콘텐츠 (롤백 복원용)

기존 데이터는 theme / tailwind / home / false 기본값으로 채워져 동작 변화 없음.

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-25
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("templates", sa.Column("code", sa.String(length=50), nullable=True))
    op.create_unique_constraint("uq_templates_code", "templates", ["code"])
    op.add_column(
        "templates",
        sa.Column(
            "renderer", sa.String(length=10), nullable=False, server_default="theme"
        ),
    )
    op.add_column(
        "templates",
        sa.Column(
            "styling", sa.String(length=10), nullable=False, server_default="tailwind"
        ),
    )
    op.add_column(
        "templates",
        sa.Column(
            "version", sa.String(length=20), nullable=False, server_default="1.0.0"
        ),
    )
    op.add_column(
        "templates",
        sa.Column(
            "sample_content",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.create_check_constraint(
        "ck_templates_renderer", "templates", "renderer IN ('theme', 'code')"
    )
    op.create_check_constraint(
        "ck_templates_styling", "templates", "styling IN ('tailwind', 'scss')"
    )

    op.add_column(
        "sections",
        sa.Column(
            "page_key", sa.String(length=50), nullable=False, server_default="home"
        ),
    )
    op.create_index(
        "idx_sections_tenant_page",
        "sections",
        ["tenant_id", "page_key", "display_order"],
    )

    op.add_column(
        "section_settings",
        sa.Column("is_sample", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.add_column(
        "template_change_history",
        sa.Column(
            "content_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("template_change_history", "content_snapshot")
    op.drop_column("section_settings", "is_sample")
    op.drop_index("idx_sections_tenant_page", table_name="sections")
    op.drop_column("sections", "page_key")
    op.drop_constraint("ck_templates_styling", "templates", type_="check")
    op.drop_constraint("ck_templates_renderer", "templates", type_="check")
    op.drop_column("templates", "sample_content")
    op.drop_column("templates", "version")
    op.drop_column("templates", "styling")
    op.drop_column("templates", "renderer")
    op.drop_constraint("uq_templates_code", "templates", type_="unique")
    op.drop_column("templates", "code")
