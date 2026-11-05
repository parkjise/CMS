"""게시판 · 게시글 (T-139, 게시판 모듈 기획서 8장).

- boards: 사업체별 게시판. system_key 가 있으면 템플릿 기본 게시판 — 삭제 보호
- board_posts: 게시글. 본문은 블록 JSON, 칸 추가용 custom_data 는 4단계부터 쓴다
- BOARD_MANAGER 기능: 전 요금제 기본 켜짐

Revision ID: 0038
Revises: 0037
Create Date: 2026-11-05
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0038"
down_revision: str | None = "0037"
branch_labels = None
depends_on = None

_RLS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""
KEY = "BOARD_MANAGER"


def _common_columns() -> list[sa.Column]:
    return [
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ]


def _enable_rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY {table}_tenant_isolation ON {table} USING ({_RLS_POLICY})"
    )


def upgrade() -> None:
    op.create_table(
        "boards",
        *_common_columns(),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(60), nullable=False),
        sa.Column("board_type", sa.String(20), nullable=False, server_default="LIST"),
        sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVE"),
        sa.Column("system_key", sa.String(30), nullable=True),
        sa.Column(
            "settings",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.CheckConstraint(
            "board_type IN ('LIST', 'GALLERY', 'FAQ')", name="ck_boards_type"
        ),
        sa.CheckConstraint("status IN ('ACTIVE', 'INACTIVE')", name="ck_boards_status"),
        # 게시글의 복합 FK 대상 — 다른 사업체 게시판에 글이 붙지 못하게
        sa.UniqueConstraint("id", "tenant_id", name="uq_boards_id_tenant"),
    )
    op.create_index(
        "uq_boards_tenant_slug",
        "boards",
        ["tenant_id", "slug"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "board_posts",
        *_common_columns(),
        sa.Column("board_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column(
            "body",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT"),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "custom_data",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["board_id", "tenant_id"],
            ["boards.id", "boards.tenant_id"],
            name="fk_board_posts_board_tenant",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "status IN ('DRAFT', 'PUBLISHED', 'PRIVATE')",
            name="ck_board_posts_status",
        ),
    )
    op.create_index(
        "ix_board_posts_list",
        "board_posts",
        ["tenant_id", "board_id", "status", sa.text("published_at DESC")],
    )

    _enable_rls("boards")
    _enable_rls("board_posts")

    op.execute(
        "INSERT INTO features (id, key, name, description, category, menu_path,"
        " menu_icon, menu_label, menu_position, default_enabled, required_plan,"
        " is_beta, is_active, created_at, updated_at)"
        f" SELECT gen_random_uuid(), '{KEY}', '게시판 관리',"
        " '공지 등 게시판의 글을 관리자에서 작성 · 수정', 'CONTENT',"
        " '/admin/boards', 'clipboard-list', '게시판 관리', 14, true, NULL,"
        " false, true, now(), now()"
        f" WHERE NOT EXISTS (SELECT 1 FROM features WHERE key = '{KEY}')"
    )


def downgrade() -> None:
    # 등록한 기능은 지우지 않는다 — 테넌트별 설정이 연결되어 있을 수 있다 (0037 과 같음)
    op.drop_table("board_posts")
    op.drop_table("boards")
