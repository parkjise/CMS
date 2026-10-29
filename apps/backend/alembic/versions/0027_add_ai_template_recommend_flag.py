"""AI 템플릿 추천 기능 플래그 (T-070-A, 기획서 13.4).

- AI_TEMPLATE_RECOMMEND: 관리자 템플릿 화면의 AI 추천 (STANDARD 이상, 기본 ON)
기존 STANDARD · PREMIUM 테넌트에도 켠다 (이미 행이 있으면 건너뜀).
새 테넌트는 feature_service.apply_defaults 가 required_plan 기준으로 켠다.

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-29
"""

from alembic import op

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels = None
depends_on = None

KEY = "AI_TEMPLATE_RECOMMEND"


def upgrade() -> None:
    op.execute(
        "INSERT INTO features (id, key, name, description, category, menu_position,"
        " default_enabled, required_plan, is_beta, is_active, created_at, updated_at)"
        f" SELECT gen_random_uuid(), '{KEY}', 'AI 템플릿 추천',"
        " '업종 · 홈페이지 내용에 어울리는 템플릿 3개를 이유와 함께 추천', 'AI',"
        " 43, true, 'STANDARD', false, true, now(), now()"
        f" WHERE NOT EXISTS (SELECT 1 FROM features WHERE key = '{KEY}')"
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
    for table in ("feature_deployments", "tenant_features"):
        op.execute(
            f"DELETE FROM {table} WHERE feature_id IN"  # noqa: S608
            f" (SELECT id FROM features WHERE key = '{KEY}')"
        )
    op.execute(f"DELETE FROM features WHERE key = '{KEY}'")
