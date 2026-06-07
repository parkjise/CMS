"""add gallery_items table

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-07
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gallery_items",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "section_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "file_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("uploaded_files.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("image_url", sa.String(500), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("caption", sa.String(200), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
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
    )
    op.create_index("ix_gallery_items_tenant_id", "gallery_items", ["tenant_id"])
    op.create_index("ix_gallery_items_section_id", "gallery_items", ["section_id"])

    # RLS
    op.execute("ALTER TABLE gallery_items ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE gallery_items FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY gallery_items_tenant_isolation ON gallery_items "
        "USING ("
        "  tenant_id = current_setting('app.current_tenant_id', true)::uuid "
        "  OR current_setting('app.is_super_admin', true) = 'true'"
        ")"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS gallery_items_tenant_isolation ON gallery_items")
    op.drop_index("ix_gallery_items_section_id", table_name="gallery_items")
    op.drop_index("ix_gallery_items_tenant_id", table_name="gallery_items")
    op.drop_table("gallery_items")
