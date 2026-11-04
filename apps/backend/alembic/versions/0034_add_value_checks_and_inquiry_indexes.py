"""값 제약 · 문의 인덱스 (T-131, 기획서 6.2 · 10.1).

허용값 밖의 데이터가 있으면 제약을 걸 수 없으므로 먼저 찾아 멈춘다 — 고친 뒤 다시 실행.

Revision ID: 0034
Revises: 0033
Create Date: 2026-11-04
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0034"
down_revision: str | None = "0033"
branch_labels = None
depends_on = None

_CHECKS: list[tuple[str, str, str, tuple[str, ...]]] = [
    (
        "ck_tenants_template_type",
        "tenants",
        "template_type",
        ("HOSPITAL", "PENSION", "STARTUP", "GENERAL"),
    ),
    (
        "ck_tenants_plan_type",
        "tenants",
        "plan_type",
        ("FREE", "BASIC", "STANDARD", "PREMIUM"),
    ),
    (
        "ck_users_role",
        "users",
        "role",
        ("SUPER_ADMIN", "TENANT_ADMIN", "TENANT_VIEWER"),
    ),
    (
        "ck_inquiries_inquiry_type",
        "inquiries",
        "inquiry_type",
        ("GENERAL", "CONSULT", "RESERVATION", "PARTNERSHIP", "SYMPTOM"),
    ),
    (
        "ck_inquiries_status",
        "inquiries",
        "status",
        ("PENDING", "IN_PROGRESS", "DONE", "SPAM"),
    ),
]


def _in_list(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    conn = op.get_bind()
    problems = []
    for _, table, column, values in _CHECKS:
        rows = conn.execute(
            sa.text(
                f"SELECT DISTINCT {column} FROM {table}"
                f" WHERE {column} NOT IN ({_in_list(values)})"
            )
        ).fetchall()
        if rows:
            problems.append(f"{table}.{column}: {[r[0] for r in rows]}")
    if problems:
        raise RuntimeError("허용값 밖의 데이터가 있습니다 — " + "; ".join(problems))

    for name, table, column, values in _CHECKS:
        op.create_check_constraint(name, table, f"{column} IN ({_in_list(values)})")

    op.create_index("idx_inquiries_tenant_status", "inquiries", ["tenant_id", "status"])
    op.create_index(
        "idx_inquiries_tenant_created",
        "inquiries",
        ["tenant_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("idx_inquiries_tenant_created", table_name="inquiries")
    op.drop_index("idx_inquiries_tenant_status", table_name="inquiries")
    for name, table, _, _ in reversed(_CHECKS):
        op.drop_constraint(name, table, type_="check")
