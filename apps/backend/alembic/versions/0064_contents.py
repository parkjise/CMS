"""독립 콘텐츠 관리 표 + CONTENT_MANAGE 기능 스위치 (T-253, 콘텐츠 관리 기획서 4장)

- content_types · content_type_fields: 사업체가 정하는 콘텐츠 유형과 칸 (CM-03)
- content_items: 항목 — 초안 · 공개 2단계 (CM-01 · 02)
- content_categories: 유형별 2단계 카테고리 · content_tags · content_item_tags (CM-05)
- 모두 테넌트 격리 RLS, 소프트 삭제(태그 연결 표 제외), 사업체 지우면 함께
- CONTENT_MANAGE: features 에 줄만, 처음엔 꺼짐 (슈퍼 어드민이 사업체마다 켬)

Revision ID: 0064
Revises: 0063
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0064"
down_revision: str | None = "0063"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_RLS_POLICY = """
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
"""
_FEATURE = "CONTENT_MANAGE"
# 지울 때 거꾸로 — 뒤의 표가 앞의 표를 가리킨다
_TABLES = (
    "content_types",
    "content_type_fields",
    "content_categories",
    "content_items",
    "content_tags",
    "content_item_tags",
)


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


def _ref(name: str, table: str, *, nullable: bool = False, on_delete: str) -> sa.Column:
    return sa.Column(
        name,
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey(f"{table}.id", ondelete=on_delete),
        nullable=nullable,
    )


def _timestamps(*, soft_delete: bool = True) -> list[sa.Column]:
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


def _rls(table: str) -> None:
    op.create_index(f"ix_{table}_tenant_id", table, ["tenant_id"])
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY {table}_tenant_isolation ON {table} USING ({_RLS_POLICY})"
    )


def upgrade() -> None:
    op.create_table(
        "content_types",
        _uuid_pk(),
        _tenant(),
        # 휴지통을 포함해 사업체 안에서 하나
        sa.Column("type_key", sa.String(40), nullable=False),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("description", sa.String(200), nullable=False, server_default=""),
        sa.Column("preset_key", sa.String(30), nullable=True),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        *_timestamps(),
        sa.UniqueConstraint("tenant_id", "type_key", name="uq_content_types_key"),
    )
    op.create_table(
        "content_type_fields",
        _uuid_pk(),
        _tenant(),
        _ref("type_id", "content_types", on_delete="CASCADE"),
        sa.Column("field_key", sa.String(50), nullable=False),
        sa.Column("label", sa.String(50), nullable=False),
        sa.Column("field_type", sa.String(20), nullable=False),
        sa.Column("is_required", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("help_text", sa.String(200), nullable=False, server_default=""),
        sa.Column("placeholder", sa.String(100), nullable=False, server_default=""),
        sa.Column("default_value", postgresql.JSONB, nullable=True),
        sa.Column(
            "field_options",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        *_timestamps(),
        sa.UniqueConstraint("type_id", "field_key", name="uq_content_type_fields_key"),
    )
    op.create_table(
        "content_categories",
        _uuid_pk(),
        _tenant(),
        _ref("type_id", "content_types", on_delete="CASCADE"),
        # 2단계 — 하위는 맨 위 카테고리 아래만 (서비스가 지킨다)
        _ref("parent_id", "content_categories", nullable=True, on_delete="CASCADE"),
        sa.Column("name", sa.String(30), nullable=False),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        *_timestamps(),
    )
    op.create_table(
        "content_items",
        _uuid_pk(),
        _tenant(),
        _ref("type_id", "content_types", on_delete="CASCADE"),
        _ref("category_id", "content_categories", nullable=True, on_delete="SET NULL"),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("summary", sa.String(300), nullable=False, server_default=""),
        # Tiptap 노드 JSON (rich_text)
        sa.Column("body", postgresql.JSONB, nullable=True),
        # 유형 칸 값 {field_key: value}
        sa.Column(
            "data",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("thumbnail_url", sa.String(500), nullable=True),
        sa.Column("status", sa.String(10), nullable=False, server_default="DRAFT"),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        _ref("created_by", "users", nullable=True, on_delete="SET NULL"),
        _ref("updated_by", "users", nullable=True, on_delete="SET NULL"),
        *_timestamps(),
        sa.CheckConstraint(
            "status IN ('DRAFT', 'PUBLISHED')", name="ck_content_items_status"
        ),
    )
    op.create_index("ix_content_items_type", "content_items", ["type_id", "status"])
    op.create_table(
        "content_tags",
        _uuid_pk(),
        _tenant(),
        sa.Column("name", sa.String(30), nullable=False),
        *_timestamps(),
    )
    # 같은 이름(대소문자 무시)은 사업체 안에서 하나 — 지운 태그는 빼고
    op.execute(
        "CREATE UNIQUE INDEX uq_content_tags_name ON content_tags"
        " (tenant_id, lower(name)) WHERE deleted_at IS NULL"
    )
    op.create_table(
        "content_item_tags",
        _uuid_pk(),
        _tenant(),
        _ref("item_id", "content_items", on_delete="CASCADE"),
        _ref("tag_id", "content_tags", on_delete="CASCADE"),
        *_timestamps(soft_delete=False),
        sa.UniqueConstraint("item_id", "tag_id", name="uq_content_item_tags"),
    )
    op.create_index("ix_content_item_tags_tag", "content_item_tags", ["tag_id"])
    for table in _TABLES:
        _rls(table)

    op.get_bind().execute(
        sa.text(
            "INSERT INTO features (id, key, name, category, menu_position,"
            " default_enabled, is_beta, is_active, created_at, updated_at)"
            " SELECT gen_random_uuid(), CAST(:key AS varchar), '콘텐츠 관리',"
            " 'CONTENT', 16, false, false, true, now(), now()"
            " WHERE NOT EXISTS (SELECT 1 FROM features WHERE key = :key)"
        ),
        {"key": _FEATURE},
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM tenant_features WHERE feature_id IN"
            " (SELECT id FROM features WHERE key = :key)"
        ).bindparams(key=_FEATURE)
    )
    op.execute(
        sa.text("DELETE FROM features WHERE key = :key").bindparams(key=_FEATURE)
    )
    for table in reversed(_TABLES):
        op.execute(f"DROP POLICY {table}_tenant_isolation ON {table}")
        op.drop_table(table)
