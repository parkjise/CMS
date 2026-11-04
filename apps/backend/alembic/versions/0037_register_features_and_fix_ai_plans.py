"""기능 플래그 등록 보장 · AI 요금제 조건을 기획서에 맞춤 (T-138, 기획서 13.4 · 14.3).

기본 기능이 시드에만 있어 시드 전 DB 에는 없었다 — 서버 검사(require_feature)가 생기면
없는 기능은 꺼짐으로 판정되므로 마이그레이션에서 등록한다.

- AI_COPY_SUGGEST: BASIC 도 월 20회 → 요금제 조건 없음
- AI_CHAT_EDIT: STANDARD 월 50회 → 기본 켜짐

Revision ID: 0037
Revises: 0036
Create Date: 2026-11-04
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0037"
down_revision: str | None = "0036"
branch_labels = None
depends_on = None

# key, name, category, path, icon, label, position, default, plan, beta, active
_FEATURES = [
    (
        "SECTION_EDITOR",
        "섹션 편집기",
        "CONTENT",
        "/admin/content",
        "layout",
        "콘텐츠 관리",
        10,
        True,
        None,
        False,
        True,
    ),
    (
        "DRAG_SECTION_ORDER",
        "섹션 순서 변경",
        "CONTENT",
        None,
        None,
        None,
        11,
        True,
        None,
        False,
        True,
    ),
    (
        "GALLERY_SECTION",
        "갤러리 섹션",
        "CONTENT",
        "/admin/gallery",
        "image",
        "갤러리",
        12,
        True,
        None,
        False,
        True,
    ),
    (
        "TEMPLATE_SELECT",
        "템플릿 선택",
        "CONTENT",
        "/admin/templates",
        "palette",
        "템플릿",
        13,
        True,
        None,
        False,
        True,
    ),
    (
        "KAKAO_NOTIFICATION",
        "카카오 알림톡",
        "NOTIFICATION",
        "/admin/notifications",
        "bell",
        "알림 설정",
        20,
        True,
        None,
        False,
        True,
    ),
    (
        "SEO_WIZARD",
        "SEO 마법사",
        "SEO",
        "/admin/seo",
        "search",
        "SEO 설정",
        30,
        True,
        None,
        False,
        True,
    ),
    (
        "AI_COPY_SUGGEST",
        "AI 문구 추천",
        "AI",
        None,
        None,
        None,
        40,
        True,
        None,
        False,
        True,
    ),
    (
        "AI_CHAT_EDIT",
        "AI 채팅 편집",
        "AI",
        None,
        None,
        None,
        41,
        True,
        "STANDARD",
        True,
        True,
    ),
    (
        "AI_MONTHLY_REPORT",
        "AI 월간 리포트",
        "AI",
        "/admin/reports",
        "chart-bar",
        "월간 리포트",
        42,
        True,
        "STANDARD",
        False,
        True,
    ),
    (
        "NAVER_ANALYTICS",
        "네이버 애널리틱스",
        "ANALYTICS",
        None,
        None,
        None,
        50,
        False,
        None,
        False,
        False,
    ),
]


def upgrade() -> None:
    conn = op.get_bind()
    for row in _FEATURES:
        conn.execute(
            sa.text(
                "INSERT INTO features (id, key, name, category, menu_path, menu_icon,"
                " menu_label, menu_position, default_enabled, required_plan, is_beta,"
                " is_active, created_at, updated_at)"
                " SELECT gen_random_uuid(), CAST(:key AS varchar), :name, :category,"
                " CAST(:path AS varchar), CAST(:icon AS varchar),"
                " CAST(:label AS varchar), :position, :on, CAST(:plan AS varchar),"
                " :beta, :active, now(), now()"
                " WHERE NOT EXISTS (SELECT 1 FROM features WHERE key = :key)"
            ),
            dict(
                zip(
                    (
                        "key",
                        "name",
                        "category",
                        "path",
                        "icon",
                        "label",
                        "position",
                        "on",
                        "plan",
                        "beta",
                        "active",
                    ),
                    row,
                    strict=True,
                )
            ),
        )
    op.execute("UPDATE features SET required_plan = NULL WHERE key = 'AI_COPY_SUGGEST'")
    op.execute("UPDATE features SET default_enabled = true WHERE key = 'AI_CHAT_EDIT'")


def downgrade() -> None:
    # 등록한 기능은 지우지 않는다 — 테넌트별 설정이 연결되어 있을 수 있다
    op.execute(
        "UPDATE features SET required_plan = 'STANDARD' WHERE key = 'AI_COPY_SUGGEST'"
    )
    op.execute("UPDATE features SET default_enabled = false WHERE key = 'AI_CHAT_EDIT'")
