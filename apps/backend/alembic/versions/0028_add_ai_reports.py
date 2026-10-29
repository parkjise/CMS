"""AI 월간 분석 리포트 (T-073-A, 기획서 13.2 기능 3 · 13.4).

- ai_reports: 사업체별 월간 리포트 (자동 · 직접 만들기), RLS 격리
- AI_MONTHLY_REPORT 기능: 기획서 13.4 대로 STANDARD 부터
  (시드는 PREMIUM 전용 · 기본 꺼짐으로 잘못 등록돼 있었음)
  — 기존 STANDARD · PREMIUM 테넌트에 켠다

Revision ID: 0028
Revises: 0027
Create Date: 2026-10-29
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0028"
down_revision: str | None = "0027"
branch_labels = None
depends_on = None

_RLS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""
KEY = "AI_MONTHLY_REPORT"


def upgrade() -> None:
    op.create_table(
        "ai_reports",
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
        # 분석한 달의 1일
        sa.Column("period", sa.Date(), nullable=False),
        # AUTO: 매달 1일 자동 / MANUAL: 관리자 직접 만들기
        sa.Column("kind", sa.String(10), nullable=False),
        # ai: 모델이 다듬음 / rule: 규칙 기반만
        sa.Column("source", sa.String(10), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("metrics", postgresql.JSONB(), nullable=False),
        sa.Column("strengths", postgresql.JSONB(), nullable=False),
        sa.Column("improvements", postgresql.JSONB(), nullable=False),
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
        sa.CheckConstraint("kind IN ('AUTO', 'MANUAL')", name="ck_ai_reports_kind"),
        sa.CheckConstraint("source IN ('ai', 'rule')", name="ck_ai_reports_source"),
    )
    op.create_index(
        "ix_ai_reports_tenant_created", "ai_reports", ["tenant_id", "created_at"]
    )
    # 같은 달 자동 리포트는 하나 (자동 작업이 두 번 돌아도)
    op.create_index(
        "uq_ai_reports_auto_period",
        "ai_reports",
        ["tenant_id", "period"],
        unique=True,
        postgresql_where=sa.text("kind = 'AUTO'"),
    )
    op.execute("ALTER TABLE ai_reports ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE ai_reports FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY ai_reports_tenant_isolation ON ai_reports USING ({_RLS_POLICY})"
    )

    op.execute(
        "INSERT INTO features (id, key, name, description, category, menu_path,"
        " menu_icon, menu_label, menu_position, default_enabled, required_plan,"
        " is_beta, is_active, created_at, updated_at)"
        f" SELECT gen_random_uuid(), '{KEY}', 'AI 월간 리포트',"
        " '매달 홈페이지 상태 · 방문 · 문의를 분석해 강점과 개선점 제안', 'AI',"
        " '/admin/reports', 'chart-bar', '월간 리포트', 42, true, 'STANDARD',"
        " false, true, now(), now()"
        f" WHERE NOT EXISTS (SELECT 1 FROM features WHERE key = '{KEY}')"
    )
    op.execute(
        "UPDATE features SET required_plan = 'STANDARD', default_enabled = true"
        f" WHERE key = '{KEY}'"
    )
    op.execute(
        "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled,"
        " enabled_at, created_at, updated_at)"
        " SELECT gen_random_uuid(), t.id, f.id, true, now(), now(), now()"
        f" FROM tenants t CROSS JOIN features f WHERE f.key = '{KEY}'"
        " AND t.plan_type IN ('STANDARD', 'PREMIUM')"
        " ON CONFLICT ON CONSTRAINT uq_tenant_features_pair DO NOTHING"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE features SET required_plan = 'PREMIUM', default_enabled = false"
        f" WHERE key = '{KEY}'"
    )
    op.drop_table("ai_reports")
