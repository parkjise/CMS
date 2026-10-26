"""방문자 회원 기능 플래그 (T-115, 기획서 16.0 · 16.2 · 14.3).

- SITE_MEMBER: 회원 기능 전체 (기본 ON — 모든 업종)
- MEMBER_RESERVATION: 마이페이지 내 예약 (업종 HOSPITAL · PENSION 만 ON)
- MEMBER_SOCIAL_LOGIN: 0022 에서 등록됨
기존 테넌트에도 업종 기준으로 켠다 (이미 행이 있으면 건너뜀).
새 테넌트는 생성 시 feature_service.apply_defaults 가 같은 규칙으로 켠다.

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-26
"""

from alembic import op

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels = None
depends_on = None

# (key, 이름, 설명, 메뉴 순서, default_enabled)
FEATURES = (
    (
        "SITE_MEMBER",
        "방문자 회원",
        "홈페이지 회원가입 · 로그인 · 마이페이지 (기획서 16)",
        59,
        True,
    ),
    (
        "MEMBER_RESERVATION",
        "회원 예약 내역",
        "마이페이지 내 예약 탭 · 예약 취소 (병원 · 펜션 기본)",
        61,
        False,
    ),
)
RESERVATION_INDUSTRIES = "('HOSPITAL', 'PENSION')"


def upgrade() -> None:
    for key, name, description, position, default in FEATURES:
        op.execute(
            "INSERT INTO features (id, key, name, description, category, menu_position,"
            " default_enabled, is_beta, is_active, created_at, updated_at)"
            f" SELECT gen_random_uuid(), '{key}', '{name}', '{description}', 'MEMBER',"
            f" {position}, {str(default).lower()}, false, true, now(), now()"
            f" WHERE NOT EXISTS (SELECT 1 FROM features WHERE key = '{key}')"
        )
    enable = (
        ("SITE_MEMBER", "true"),
        ("MEMBER_RESERVATION", f"t.template_type IN {RESERVATION_INDUSTRIES}"),
    )
    for key, condition in enable:
        op.execute(
            "INSERT INTO tenant_features (id, tenant_id, feature_id, is_enabled,"
            " enabled_at, created_at, updated_at)"
            " SELECT gen_random_uuid(), t.id, f.id, true, now(), now(), now()"
            f" FROM tenants t CROSS JOIN features f WHERE f.key = '{key}'"
            f" AND {condition}"
            " ON CONFLICT ON CONSTRAINT uq_tenant_features_pair DO NOTHING"
        )


def downgrade() -> None:
    for key, *_ in FEATURES:
        for table in ("feature_deployments", "tenant_features"):
            op.execute(
                f"DELETE FROM {table} WHERE feature_id IN"  # noqa: S608
                f" (SELECT id FROM features WHERE key = '{key}')"
            )
        op.execute(f"DELETE FROM features WHERE key = '{key}'")
