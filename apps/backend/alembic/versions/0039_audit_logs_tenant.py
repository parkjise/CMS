"""감사 로그에 사업체 구분 · RLS (T-140-C, 게시판 모듈 기획서 11.4).

- tenant_id: 사업체 안에서 일어난 일. 운영사 공통 기록은 비워 둔다
- 읽기는 자기 사업체 · 슈퍼 어드민만, 수정 · 삭제는 슈퍼 어드민만 (사업체는 기록만)
- 쓰기는 비운 값도 허용 — 2FA 등록처럼 로그인 전 요청도 기록한다
- 사업체를 지워도 기록은 남긴다 (SET NULL)

Revision ID: 0039
Revises: 0038
Create Date: 2026-11-05
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0039"
down_revision: str | None = "0038"
branch_labels = None
depends_on = None

# 컨텍스트 없는 연결은 값이 빈 글자일 수 있어 uuid 변환 전에 걸러 낸다
_OWN = "tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid"
_SUPER = "current_setting('app.is_super_admin', true) = 'true'"


def upgrade() -> None:
    op.add_column(
        "audit_logs",
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_audit_logs_tenant_id", "audit_logs", ["tenant_id"])
    op.execute("ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY audit_logs_read ON audit_logs FOR SELECT"
        f" USING ({_OWN} OR {_SUPER})"
    )
    op.execute(
        f"CREATE POLICY audit_logs_write ON audit_logs FOR INSERT"
        f" WITH CHECK (tenant_id IS NULL OR {_OWN} OR {_SUPER})"
    )
    op.execute(
        f"CREATE POLICY audit_logs_update ON audit_logs FOR UPDATE USING ({_SUPER})"
    )
    op.execute(
        f"CREATE POLICY audit_logs_delete ON audit_logs FOR DELETE USING ({_SUPER})"
    )


def downgrade() -> None:
    for name in ("read", "write", "update", "delete"):
        op.execute(f"DROP POLICY audit_logs_{name} ON audit_logs")
    op.execute("ALTER TABLE audit_logs NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY")
    op.drop_index("ix_audit_logs_tenant_id", "audit_logs")
    op.drop_column("audit_logs", "tenant_id")
