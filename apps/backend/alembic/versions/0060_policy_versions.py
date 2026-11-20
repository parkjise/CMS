"""약관 · 정책 버전 · 예약 · 동의 기록 (T-224, 사이트 관리 기획서 SM-03)

- policy_versions: 문서(이용약관 · 개인정보처리방침)마다 버전
  — 초안 → 예약 / 공개 → 보관. 공개본은 문서마다 하나, 작업 중(초안 · 예약)도 하나.
  이미 고친 글은 v1 공개본으로 옮긴다.
- consent_records: 누가 · 어느 문서 버전에 · 언제 · 어느 화면에서 동의했는지.
  새 버전이 나와도 덮어쓰지 않는다.
- 두 표 모두 테넌트 격리 RLS

Revision ID: 0060
Revises: 0059
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0060"
down_revision: str | None = "0059"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_RLS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""


def _uuid_pk() -> sa.Column:
    return sa.Column(
        "id",
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )


def _tenant() -> sa.Column:
    return sa.Column(
        "tenant_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )


def _timestamps() -> list[sa.Column]:
    return [
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


def _rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY {table}_tenant_isolation ON {table} USING ({_RLS_POLICY})"
    )


def upgrade() -> None:
    op.create_table(
        "policy_versions",
        _uuid_pk(),
        _tenant(),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        # draft | scheduled | published | archived
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("summary", sa.String(500), nullable=True),
        sa.Column("effective_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        *_timestamps(),
        sa.UniqueConstraint(
            "tenant_id", "kind", "version", name="uq_policy_versions_kind_version"
        ),
    )
    op.create_index("ix_policy_versions_tenant_id", "policy_versions", ["tenant_id"])
    # 문서마다 공개본 하나, 작업 중(초안 · 예약) 하나
    op.create_index(
        "uq_policy_versions_published",
        "policy_versions",
        ["tenant_id", "kind"],
        unique=True,
        postgresql_where=sa.text("status = 'published'"),
    )
    op.create_index(
        "uq_policy_versions_working",
        "policy_versions",
        ["tenant_id", "kind"],
        unique=True,
        postgresql_where=sa.text("status IN ('draft', 'scheduled')"),
    )
    # 예약 시행 작업이 찾는 행
    op.create_index(
        "ix_policy_versions_due",
        "policy_versions",
        ["effective_at"],
        postgresql_where=sa.text("status = 'scheduled'"),
    )
    _rls("policy_versions")

    op.create_table(
        "consent_records",
        _uuid_pk(),
        _tenant(),
        sa.Column("kind", sa.String(20), nullable=False),
        # 기본 문안(버전을 만들기 전)에 동의했으면 비어 있다
        sa.Column(
            "policy_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("policy_versions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("version", sa.Integer, nullable=True),
        # member | board_post | inquiry
        sa.Column("subject_type", sa.String(20), nullable=False),
        sa.Column("subject_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("agreed", sa.Boolean, nullable=False),
        # 동의를 받은 화면 — member_join · member_join_social · board_write · inquiry
        sa.Column("source", sa.String(50), nullable=False),
        *_timestamps(),
    )
    op.create_index("ix_consent_records_tenant_id", "consent_records", ["tenant_id"])
    op.create_index(
        "ix_consent_records_subject",
        "consent_records",
        ["tenant_id", "subject_type", "subject_id"],
    )
    _rls("consent_records")

    # 이미 고친 글은 v1 공개본으로 — 고친 적 없는 사업체는 기본 문안 그대로
    for kind, column in (("terms", "terms_body"), ("privacy", "privacy_body")):
        op.execute(
            f"""
            INSERT INTO policy_versions
              (tenant_id, kind, version, status, body, summary,
               effective_at, published_at)
            SELECT tenant_id, '{kind}', 1, 'published', {column}, '기존 문서',
                   COALESCE(policies_updated_at, now()),
                   COALESCE(policies_updated_at, now())
            FROM site_settings
            WHERE {column} IS NOT NULL AND btrim({column}) <> ''
            """
        )


def downgrade() -> None:
    op.execute("DROP POLICY consent_records_tenant_isolation ON consent_records")
    op.drop_index("ix_consent_records_subject", "consent_records")
    op.drop_index("ix_consent_records_tenant_id", "consent_records")
    op.drop_table("consent_records")
    op.execute("DROP POLICY policy_versions_tenant_isolation ON policy_versions")
    op.drop_index("ix_policy_versions_due", "policy_versions")
    op.drop_index("uq_policy_versions_working", "policy_versions")
    op.drop_index("uq_policy_versions_published", "policy_versions")
    op.drop_index("ix_policy_versions_tenant_id", "policy_versions")
    op.drop_table("policy_versions")
