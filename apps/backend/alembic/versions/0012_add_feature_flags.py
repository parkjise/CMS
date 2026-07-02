"""add feature flag tables (features, tenant_features, feature_deployments)

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-02

T-086 기능 플래그 시스템. tenant_features만 tenant_id 보유 → RLS 격리 적용.
features / feature_deployments는 글로벌 마스터 테이블 (슈퍼 어드민 전용).
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels = None
depends_on = None

_TENANT_FEATURES_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""


def upgrade() -> None:
    # ── features (글로벌 마스터) ─────────────────────────────────────────
    op.create_table(
        "features",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("menu_path", sa.String(200), nullable=True),
        sa.Column("menu_icon", sa.String(50), nullable=True),
        sa.Column("menu_label", sa.String(100), nullable=True),
        sa.Column(
            "menu_position", sa.SmallInteger(), nullable=False, server_default="99"
        ),
        sa.Column(
            "default_enabled", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("required_plan", sa.String(20), nullable=True),
        sa.Column("is_beta", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("release_note", sa.Text(), nullable=True),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.UniqueConstraint("key", name="uq_features_key"),
    )
    op.create_index("ix_features_key", "features", ["key"])

    # ── tenant_features (테넌트 격리 대상) ───────────────────────────────
    op.create_table(
        "tenant_features",
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
        sa.Column(
            "feature_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("features.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "is_enabled", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("enabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "enabled_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("override_reason", sa.Text(), nullable=True),
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
        sa.UniqueConstraint("tenant_id", "feature_id", name="uq_tenant_features_pair"),
    )
    op.create_index("ix_tenant_features_tenant_id", "tenant_features", ["tenant_id"])
    op.create_index("ix_tenant_features_feature_id", "tenant_features", ["feature_id"])
    op.execute("ALTER TABLE tenant_features ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tenant_features FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_features_tenant_isolation ON tenant_features "
        f"USING ({_TENANT_FEATURES_POLICY})"
    )

    # ── feature_deployments (글로벌 이력) ────────────────────────────────
    op.create_table(
        "feature_deployments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "feature_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("features.id"),
            nullable=False,
        ),
        sa.Column("deployment_type", sa.String(30), nullable=False),
        sa.Column("target_plan", sa.String(20), nullable=True),
        sa.Column(
            "target_tenants",
            postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
            nullable=True,
        ),
        sa.Column("rollout_percent", sa.SmallInteger(), nullable=True),
        sa.Column("affected_count", sa.Integer(), nullable=True),
        sa.Column(
            "deployed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "deployed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("rollback_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_feature_deployments_feature_id", "feature_deployments", ["feature_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_feature_deployments_feature_id", "feature_deployments")
    op.drop_table("feature_deployments")
    op.execute(
        "DROP POLICY IF EXISTS tenant_features_tenant_isolation ON tenant_features"
    )
    op.drop_index("ix_tenant_features_feature_id", "tenant_features")
    op.drop_index("ix_tenant_features_tenant_id", "tenant_features")
    op.drop_table("tenant_features")
    op.drop_index("ix_features_key", "features")
    op.drop_table("features")
