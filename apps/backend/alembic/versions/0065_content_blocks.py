"""공통 블록 (T-260, 콘텐츠 관리 기획서 CM-04)

- content_blocks: 여러 페이지가 함께 쓰는 섹션 값 한 벌 (섹션 종류 · 칸 값 목록)
- sections.block_id: 참조형으로 쓰는 섹션 — 블록을 고치면 이어진 섹션 값이 함께 바뀐다.
  복사형은 값만 복사하고 이 칸은 비운다. 블록을 지우면 연결만 풀린다(SET NULL)
- 테넌트 격리 RLS, 소프트 삭제

Revision ID: 0065
Revises: 0064
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0065"
down_revision: str | None = "0064"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_RLS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""


def upgrade() -> None:
    op.create_table(
        "content_blocks",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("section_type", sa.String(50), nullable=False),
        # [{field_key, field_value, value_type}] — 섹션 칸 값 그대로
        sa.Column(
            "settings",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_content_blocks_tenant_id", "content_blocks", ["tenant_id"])
    op.execute("ALTER TABLE content_blocks ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE content_blocks FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY content_blocks_tenant_isolation ON content_blocks"
        f" USING ({_RLS_POLICY})"
    )
    op.add_column(
        "sections",
        sa.Column(
            "block_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("content_blocks.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_sections_block_id", "sections", ["block_id"])


def downgrade() -> None:
    op.drop_index("ix_sections_block_id", "sections")
    op.drop_column("sections", "block_id")
    op.execute("DROP POLICY content_blocks_tenant_isolation ON content_blocks")
    op.drop_index("ix_content_blocks_tenant_id", "content_blocks")
    op.drop_table("content_blocks")
