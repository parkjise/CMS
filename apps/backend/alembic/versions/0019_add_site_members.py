"""테넌트 사이트 방문자 회원 (기획서 16.9, T-107).

- site_members: 방문자 회원 (이메일·소셜 가입, 로그인 잠금, 수신 동의)
- member_reservations: 회원 예약 내역 (업종별 항목 detail JSONB)
- phone_verifications: 휴대폰 인증 코드
- member_password_reset_tokens: 비밀번호 재설정 토큰 (SHA-256 해시)
- inquiries.member_id: 회원이 남긴 문의·예약 연결 (비회원은 NULL)

기획서 16.9 와 다른 점 (T-107 결정):
- phone_verifications.tenant_id NOT NULL, member_password_reset_tokens 에 tenant_id 추가
  → 네 테이블 모두 같은 RLS 정책
- 알림 설정 화면(16.7)의 예약 확정·취소 알림 컬럼 추가
- (tenant_id, email) 유니크는 탈퇴 회원 제외 부분 인덱스 (오픈 이슈 #22)

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-26
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels = None
depends_on = None

_TABLES = (
    "site_members",
    "member_reservations",
    "phone_verifications",
    "member_password_reset_tokens",
)

_RLS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""


def _id() -> sa.Column:
    return sa.Column(
        "id",
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )


def _tenant_id() -> sa.Column:
    return sa.Column(
        "tenant_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )


def _timestamps(soft_delete: bool = False) -> list[sa.Column]:
    columns = [
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
    ]
    if soft_delete:
        columns.append(sa.Column("deleted_at", sa.DateTime(timezone=True)))
    return columns


def _enable_rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY {table}_tenant_isolation ON {table} USING ({_RLS_POLICY})"
    )


def upgrade() -> None:
    # ── site_members ─────────────────────────────────────────────────────
    op.create_table(
        "site_members",
        _id(),
        _tenant_id(),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255)),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("phone", sa.String(20)),
        sa.Column("birth_date", sa.Date()),
        sa.Column("social_provider", sa.String(20)),
        sa.Column("social_id", sa.String(200)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "marketing_agree", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("sms_agree", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "email_agree", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "notify_reservation_confirmed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "notify_reservation_cancelled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.Column(
            "failed_login_count", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("locked_until", sa.DateTime(timezone=True)),
        *_timestamps(soft_delete=True),
    )
    op.create_index("ix_site_members_tenant_id", "site_members", ["tenant_id"])
    op.create_index("idx_site_members_phone", "site_members", ["tenant_id", "phone"])
    op.create_index(
        "uq_site_members_tenant_email",
        "site_members",
        ["tenant_id", "email"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "uq_site_members_tenant_social",
        "site_members",
        ["tenant_id", "social_provider", "social_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL AND social_id IS NOT NULL"),
    )

    # ── member_reservations ──────────────────────────────────────────────
    op.create_table(
        "member_reservations",
        _id(),
        _tenant_id(),
        sa.Column(
            "member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("site_members.id"),
            nullable=False,
        ),
        sa.Column(
            "inquiry_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inquiries.id", ondelete="SET NULL"),
        ),
        sa.Column("reservation_type", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("reserved_at", sa.DateTime(timezone=True)),
        sa.Column("memo", sa.Text()),
        sa.Column(
            "detail",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        *_timestamps(soft_delete=True),
    )
    op.create_index(
        "ix_member_reservations_tenant_id", "member_reservations", ["tenant_id"]
    )
    op.create_index(
        "idx_member_reservations_member",
        "member_reservations",
        ["member_id", sa.text("created_at DESC")],
    )

    # ── phone_verifications ──────────────────────────────────────────────
    op.create_table(
        "phone_verifications",
        _id(),
        _tenant_id(),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("code", sa.String(6), nullable=False),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True)),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        *_timestamps(),
    )
    op.create_index(
        "ix_phone_verifications_tenant_id", "phone_verifications", ["tenant_id"]
    )
    op.create_index(
        "idx_phone_verifications_lookup",
        "phone_verifications",
        ["tenant_id", "phone", "purpose"],
    )

    # ── member_password_reset_tokens ─────────────────────────────────────
    op.create_table(
        "member_password_reset_tokens",
        _id(),
        _tenant_id(),
        sa.Column(
            "member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("site_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    op.create_index(
        "ix_member_password_reset_tokens_tenant_id",
        "member_password_reset_tokens",
        ["tenant_id"],
    )
    op.create_index(
        "ix_member_password_reset_tokens_member_id",
        "member_password_reset_tokens",
        ["member_id"],
    )

    for table in _TABLES:
        _enable_rls(table)

    # ── inquiries.member_id ──────────────────────────────────────────────
    op.add_column(
        "inquiries",
        sa.Column(
            "member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "site_members.id",
                ondelete="SET NULL",
                name="fk_inquiries_member_id",
            ),
        ),
    )
    op.create_index("ix_inquiries_member_id", "inquiries", ["member_id"])


def downgrade() -> None:
    op.drop_index("ix_inquiries_member_id", table_name="inquiries")
    op.drop_constraint("fk_inquiries_member_id", "inquiries", type_="foreignkey")
    op.drop_column("inquiries", "member_id")
    for table in reversed(_TABLES):
        op.execute(f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table}")
        op.drop_table(table)
