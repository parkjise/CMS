"""AI 보조 기능 스위치 등록 (T-231-B, 관리자 화면 개선 · AI 보조 기획서 2.0).

- AI_SITE_ASSIST: SEO · GEO 채우기, 약관 변경 요약
- AI_BOARD_ASSIST: 게시판 구성 추천, 글 초안

표 구조는 그대로 — features 에 줄만 더한다. 처음엔 꺼 두고(default_enabled false)
슈퍼 어드민이 사업체마다 켠다. 메뉴는 없다 (버튼만 숨김).

Revision ID: 0061
Revises: 0060
Create Date: 2026-11-24
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0061"
down_revision: str | None = "0060"
branch_labels = None
depends_on = None

# key, name, position
_FEATURES = [
    ("AI_SITE_ASSIST", "AI 사이트 문구 보조", 44),
    ("AI_BOARD_ASSIST", "AI 게시판 보조", 45),
]


def upgrade() -> None:
    conn = op.get_bind()
    for key, name, position in _FEATURES:
        conn.execute(
            sa.text(
                "INSERT INTO features (id, key, name, category, menu_position,"
                " default_enabled, is_beta, is_active, created_at, updated_at)"
                " SELECT gen_random_uuid(), CAST(:key AS varchar), :name, 'AI',"
                " :position, false, false, true, now(), now()"
                " WHERE NOT EXISTS (SELECT 1 FROM features WHERE key = :key)"
            ),
            {"key": key, "name": name, "position": position},
        )


def downgrade() -> None:
    # 사업체별로 켠 기록(tenant_features)이 있으면 함께 지운다
    keys = tuple(key for key, _, _ in _FEATURES)
    op.execute(
        sa.text(
            "DELETE FROM tenant_features WHERE feature_id IN"
            " (SELECT id FROM features WHERE key IN :keys)"
        ).bindparams(sa.bindparam("keys", expanding=True, value=list(keys)))
    )
    op.execute(
        sa.text("DELETE FROM features WHERE key IN :keys").bindparams(
            sa.bindparam("keys", expanding=True, value=list(keys))
        )
    )
