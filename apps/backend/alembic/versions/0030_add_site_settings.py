"""사업체 공통 정보 (T-036-A, 기획서 AD-02-A 공통 설정).

- site_settings: 사업체당 1행 — 대표 전화 · 이메일 · 주소 · 영업시간 · 주차 ·
  대표자 · 사업자등록번호 · 로고 · 파비콘. RLS 격리.
  홈페이지 푸터 · 상담 버튼 · 로고 · 파비콘 · 구조화 데이터(JSON-LD)에 쓰인다.
- 기존 사업체: '오시는 길'(MAP) 섹션에서 고객이 바꾼 값(샘플 아님)만 처음 값으로 옮긴다.

Revision ID: 0030
Revises: 0029
Create Date: 2026-10-29
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0030"
down_revision: str | None = "0029"
branch_labels = None
depends_on = None

_RLS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""

# MAP 섹션 칸 → site_settings 칸
_FROM_MAP = {"address": "address", "phone": "phone", "parking": "parking"}


def upgrade() -> None:
    op.create_table(
        "site_settings",
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
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("address", sa.String(200), nullable=True),
        sa.Column("address_detail", sa.String(100), nullable=True),
        sa.Column("hours_weekday", sa.String(100), nullable=True),
        sa.Column("hours_saturday", sa.String(100), nullable=True),
        sa.Column("hours_note", sa.String(200), nullable=True),
        sa.Column("parking", sa.String(200), nullable=True),
        sa.Column("ceo", sa.String(50), nullable=True),
        sa.Column("business_number", sa.String(12), nullable=True),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("favicon_url", sa.String(500), nullable=True),
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
        sa.UniqueConstraint("tenant_id", name="site_settings_tenant_id_key"),
    )
    op.execute("ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE site_settings FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY site_settings_tenant_isolation ON site_settings"
        f" USING ({_RLS_POLICY})"
    )

    # 기존 사업체 — 오시는 길 섹션에서 고객이 직접 바꾼 값만 (샘플 값은 옮기지 않는다)
    op.execute(
        "INSERT INTO site_settings (tenant_id) SELECT id FROM tenants"
        " ON CONFLICT ON CONSTRAINT site_settings_tenant_id_key DO NOTHING"
    )
    for src, dst in _FROM_MAP.items():
        op.execute(
            f"UPDATE site_settings st SET {dst} = left(v.field_value, 200) FROM ("
            " SELECT DISTINCT ON (s.tenant_id) s.tenant_id, ss.field_value"
            " FROM sections s JOIN section_settings ss ON ss.section_id = s.id"
            f" WHERE s.section_type = 'MAP' AND s.deleted_at IS NULL"
            f" AND ss.field_key = '{src}' AND ss.is_sample = false"
            " AND coalesce(ss.field_value, '') <> ''"
            " ORDER BY s.tenant_id, s.is_active DESC, s.display_order"
            f") v WHERE st.tenant_id = v.tenant_id AND st.{dst} IS NULL"
        )
    # 전화번호 칸은 20자 — 넘는 값은 비운다
    op.execute("UPDATE site_settings SET phone = NULL WHERE length(phone) > 20")


def downgrade() -> None:
    op.drop_table("site_settings")
