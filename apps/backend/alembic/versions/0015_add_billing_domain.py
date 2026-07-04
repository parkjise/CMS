"""add billing and domain tables (subscriptions, payment_history,
plan_change_history, tenant_domains)

Revision ID: 0015
Revises: 0014
Create Date: 2026-07-04

T-095 결제/구독/도메인 스키마. 4개 테이블 모두 tenant_id 보유 → RLS 격리.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels = None
depends_on = None

_RLS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""


def _enable_rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY {table}_tenant_isolation ON {table} USING ({_RLS_POLICY})"
    )


def upgrade() -> None:
    # ── subscriptions ────────────────────────────────────────────────────
    op.create_table(
        "subscriptions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id"),
            nullable=False,
        ),
        sa.Column("plan_type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVE"),
        sa.Column("billing_key", sa.String(200), nullable=True),
        sa.Column("billing_email", sa.String(255), nullable=True),
        sa.Column("billing_name", sa.String(100), nullable=True),
        sa.Column("monthly_amount", sa.Integer(), nullable=False),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.UniqueConstraint("tenant_id", name="uq_subscriptions_tenant"),
    )
    op.create_index("ix_subscriptions_tenant_id", "subscriptions", ["tenant_id"])
    op.create_index("idx_subscriptions_status", "subscriptions", ["status"])
    op.create_index(
        "idx_subscriptions_period_end", "subscriptions", ["current_period_end"]
    )
    _enable_rls("subscriptions")

    # ── payment_history ──────────────────────────────────────────────────
    op.create_table(
        "payment_history",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id"),
            nullable=False,
        ),
        sa.Column(
            "subscription_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("subscriptions.id"),
            nullable=False,
        ),
        sa.Column("payment_key", sa.String(200), nullable=True),
        sa.Column("order_id", sa.String(200), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("receipt_url", sa.String(500), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("order_id", name="uq_payment_history_order"),
    )
    op.create_index(
        "idx_payment_history_tenant",
        "payment_history",
        ["tenant_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_payment_history_subscription_id", "payment_history", ["subscription_id"]
    )
    _enable_rls("payment_history")

    # ── plan_change_history ──────────────────────────────────────────────
    op.create_table(
        "plan_change_history",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id"),
            nullable=False,
        ),
        sa.Column("from_plan", sa.String(20), nullable=False),
        sa.Column("to_plan", sa.String(20), nullable=False),
        sa.Column(
            "changed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("effective_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_plan_change_history_tenant_id", "plan_change_history", ["tenant_id"]
    )
    _enable_rls("plan_change_history")

    # ── tenant_domains ───────────────────────────────────────────────────
    op.create_table(
        "tenant_domains",
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
        sa.Column("domain", sa.String(255), nullable=False),
        sa.Column("domain_type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("ssl_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("tenant_id", name="uq_tenant_domains_tenant"),
        sa.UniqueConstraint("domain", name="uq_tenant_domains_domain"),
    )
    op.create_index("ix_tenant_domains_tenant_id", "tenant_domains", ["tenant_id"])
    _enable_rls("tenant_domains")


def downgrade() -> None:
    for table in (
        "tenant_domains",
        "plan_change_history",
        "payment_history",
        "subscriptions",
    ):
        op.execute(f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table}")
        op.drop_table(table)
