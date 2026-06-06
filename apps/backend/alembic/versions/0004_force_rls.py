"""force row level security on key tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-06

superuser도 RLS 정책을 따르도록 FORCE ROW LEVEL SECURITY 적용.
"""

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels = None
depends_on = None

_TABLES = [
    "sections",
    "section_settings",
    "inquiries",
    "inquiry_attachments",
    "sns_channel_settings",
    "seo_settings",
    "site_analytics",
    "uploaded_files",
]


def upgrade() -> None:
    for table in _TABLES:
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in _TABLES:
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
