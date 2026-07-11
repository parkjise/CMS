"""sections.tenant_id → tenants.id 외래키 추가.

초기 마이그레이션(0001)에서 sections.tenant_id 컬럼에 FK 제약이 누락되어
모델(Section.tenant_id = ForeignKey("tenants.id"))과 DB가 불일치했다.
참조 무결성 확보 및 alembic autogenerate 무변경 상태를 위해 FK를 명시적으로 추가한다.

Revision ID: 0016
Revises: 0015
Create Date: 2026-07-11
"""

from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_foreign_key(
        "fk_sections_tenant_id",
        "sections",
        "tenants",
        ["tenant_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_sections_tenant_id", "sections", type_="foreignkey")
