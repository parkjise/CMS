"""방문자 소셜 계정 연결 + 소셜 로그인 기능 플래그 (T-110, 기획서 16.4 · 16.7).

- member_social_accounts: 회원 1명에 카카오 · 네이버를 함께 연결 (연결 중인 소셜 계정 중복 불가,
  해제는 소프트 삭제)
  site_members.social_provider / social_id 는 "가입 방식" 으로 남기고, 기존 값은 이 테이블로 복사
- features: MEMBER_SOCIAL_LOGIN (기본 ON) 등록 + 기존 테넌트에 켜기
  (seed 는 빈 DB 에서만 돌기 때문에 기존 DB 는 마이그레이션으로 추가)

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0022"
down_revision: str | None = "0021"
branch_labels = None
depends_on = None

_RLS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""
FEATURE_KEY = "MEMBER_SOCIAL_LOGIN"


def upgrade() -> None:
    op.create_table(
        "member_social_accounts",
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
            "member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("site_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("provider_user_id", sa.String(200), nullable=False),
        sa.Column("email", sa.String(255)),
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
        # 연결 해제 · 탈퇴 시 소프트 삭제
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    # 연결 중인 계정만 중복 불가 (해제 후 다시 연결 · 다른 회원에 연결 가능)
    op.create_index(
        "uq_member_social_accounts_provider_user",
        "member_social_accounts",
        ["tenant_id", "provider", "provider_user_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "uq_member_social_accounts_member_provider",
        "member_social_accounts",
        ["member_id", "provider"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_member_social_accounts_tenant_id", "member_social_accounts", ["tenant_id"]
    )
    op.create_index(
        "ix_member_social_accounts_member_id", "member_social_accounts", ["member_id"]
    )
    op.execute("ALTER TABLE member_social_accounts ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE member_social_accounts FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY member_social_accounts_tenant_isolation"
        f" ON member_social_accounts USING ({_RLS_POLICY})"
    )

    # 기존 소셜 가입 회원 → 연결 테이블 (탈퇴 회원 제외)
    op.execute(
        "INSERT INTO member_social_accounts"
        " (tenant_id, member_id, provider, provider_user_id, email)"
        " SELECT tenant_id, id, social_provider, social_id, email FROM site_members"
        " WHERE social_provider IS NOT NULL AND social_id IS NOT NULL"
        " AND deleted_at IS NULL"
    )

    # 기능 플래그 등록 (이미 있으면 건너뜀) + 기존 테넌트 켜기
    op.execute(
        "INSERT INTO features (id, key, name, description, category, menu_position,"
        " default_enabled, is_beta, is_active, created_at, updated_at)"
        f" SELECT gen_random_uuid(), '{FEATURE_KEY}', '소셜 로그인',"
        " '방문자 카카오 · 네이버 로그인 (기획서 16.4)', 'MEMBER', 60, true, false,"
        " true, now(), now()"
        f" WHERE NOT EXISTS (SELECT 1 FROM features WHERE key = '{FEATURE_KEY}')"
    )
    op.execute(
        "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled,"
        " enabled_at, created_at, updated_at)"
        " SELECT gen_random_uuid(), t.id, f.id, true, now(), now(), now()"
        f" FROM tenants t CROSS JOIN features f WHERE f.key = '{FEATURE_KEY}'"
        " ON CONFLICT ON CONSTRAINT uq_tenant_features_pair DO NOTHING"
    )


def downgrade() -> None:
    for table in ("feature_deployments", "tenant_features"):
        op.execute(
            f"DELETE FROM {table} WHERE feature_id IN"  # noqa: S608
            f" (SELECT id FROM features WHERE key = '{FEATURE_KEY}')"
        )
    op.execute(f"DELETE FROM features WHERE key = '{FEATURE_KEY}'")
    op.execute(
        "DROP POLICY IF EXISTS member_social_accounts_tenant_isolation"
        " ON member_social_accounts"
    )
    op.drop_table("member_social_accounts")
