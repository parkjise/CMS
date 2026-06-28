"""
초기 데이터 삽입 스크립트.
alembic upgrade head 후 한 번 실행: poetry run python scripts/seed.py
"""

import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.template import Template
from app.models.tenant import Tenant
from app.models.user import User

# 기본 템플릿 6종 (T-056). css_variables / min_plan / template_type(추천 업종) 값은
# 클라이언트 정의(apps/client/lib/templates/*.ts)와 반드시 일치시킨다.
# fmt: off
TEMPLATES = [
    {
        "template_type": "STARTUP",
        "name": "모던 미니멀",
        "description": "다크 계열과 풀스크린 히어로로 강렬한 첫인상을 주는 미니멀 템플릿",
        "thumbnail_url": "/templates/modern-minimal.svg",
        "css_variables": {
            "primary": "#6366f1",
            "primary_hover": "#4f46e5",
            "on_primary": "#ffffff",
            "secondary": "#1e293b",
            "accent": "#818cf8",
            "background": "#0f172a",
            "surface": "#1e293b",
            "text_primary": "#f1f5f9",
            "text_secondary": "#94a3b8",
            "border": "#334155",
            "font_heading": "Pretendard",
            "font_body": "Pretendard",
            "border_radius": "4px",
        },
        "section_layouts": ["HERO_BANNER", "INTRO", "SERVICES", "PORTFOLIO", "CONTACT"],
        "min_plan": "BASIC",
    },
    {
        "template_type": "HOSPITAL",
        "name": "웜 트러스트",
        "description": "따뜻한 색감과 분할 레이아웃으로 신뢰감을 전하는 템플릿",
        "thumbnail_url": "/templates/warm-trust.svg",
        "css_variables": {
            "primary": "#d97706",
            "primary_hover": "#b45309",
            "on_primary": "#ffffff",
            "secondary": "#fde68a",
            "accent": "#ea580c",
            "background": "#fffaf3",
            "surface": "#ffffff",
            "text_primary": "#1c1917",
            "text_secondary": "#78716c",
            "border": "#e7e5e4",
            "font_heading": "Noto Sans KR",
            "font_body": "Noto Sans KR",
            "border_radius": "10px",
        },
        "section_layouts": ["HERO_BANNER", "INTRO", "SERVICES", "TEAM", "FAQ", "CONTACT"],
        "min_plan": "BASIC",
    },
    {
        "template_type": "PENSION",
        "name": "네이처 프레시",
        "description": "싱그러운 그린 컬러와 매거진형 구성으로 자연스러움을 강조하는 템플릿",
        "thumbnail_url": "/templates/nature-fresh.svg",
        "css_variables": {
            "primary": "#16a34a",
            "primary_hover": "#15803d",
            "on_primary": "#ffffff",
            "secondary": "#dcfce7",
            "accent": "#65a30d",
            "background": "#f7fdf9",
            "surface": "#ffffff",
            "text_primary": "#14342b",
            "text_secondary": "#4b5d54",
            "border": "#d7e8de",
            "font_heading": "Noto Serif KR",
            "font_body": "Noto Sans KR",
            "border_radius": "6px",
        },
        "section_layouts": ["HERO_BANNER", "INTRO", "GALLERY", "RESERVATION", "FAQ", "MAP"],
        "min_plan": "BASIC",
    },
    {
        "template_type": "GENERAL",
        "name": "프로페셔널",
        "description": "네이비와 골드의 격조 있는 배색과 사이드바 구성의 전문가형 템플릿",
        "thumbnail_url": "/templates/professional.svg",
        "css_variables": {
            "primary": "#1e3a5f",
            "primary_hover": "#152b47",
            "on_primary": "#ffffff",
            "secondary": "#eef2f7",
            "accent": "#c9a227",
            "background": "#f8fafc",
            "surface": "#ffffff",
            "text_primary": "#0f172a",
            "text_secondary": "#475569",
            "border": "#e2e8f0",
            "font_heading": "Pretendard",
            "font_body": "Pretendard",
            "border_radius": "2px",
        },
        "section_layouts": ["HERO_BANNER", "INTRO", "SERVICES", "TEAM", "CONTACT", "MAP"],
        "min_plan": "STANDARD",
    },
    {
        "template_type": "STARTUP",
        "name": "바이브런트 유스",
        "description": "선명한 원색과 비대칭 그리드로 젊고 활기찬 분위기를 내는 템플릿",
        "thumbnail_url": "/templates/vibrant-youth.svg",
        "css_variables": {
            "primary": "#ec4899",
            "primary_hover": "#db2777",
            "on_primary": "#ffffff",
            "secondary": "#8b5cf6",
            "accent": "#f59e0b",
            "background": "#fffdf7",
            "surface": "#ffffff",
            "text_primary": "#18181b",
            "text_secondary": "#52525b",
            "border": "#ececf1",
            "font_heading": "Pretendard",
            "font_body": "Pretendard",
            "border_radius": "16px",
        },
        "section_layouts": ["HERO_BANNER", "INTRO", "SERVICES", "PORTFOLIO", "TEAM", "CONTACT"],
        "min_plan": "STANDARD",
    },
    {
        "template_type": "GENERAL",
        "name": "클린 샵",
        "description": "화이트 배경과 상품 중심 구성으로 제품을 돋보이게 하는 템플릿",
        "thumbnail_url": "/templates/clean-shop.svg",
        "css_variables": {
            "primary": "#111827",
            "primary_hover": "#000000",
            "on_primary": "#ffffff",
            "secondary": "#f3f4f6",
            "accent": "#2563eb",
            "background": "#ffffff",
            "surface": "#f9fafb",
            "text_primary": "#111827",
            "text_secondary": "#6b7280",
            "border": "#e5e7eb",
            "font_heading": "Pretendard",
            "font_body": "Pretendard",
            "border_radius": "8px",
        },
        "section_layouts": ["HERO_BANNER", "INTRO", "SERVICES", "GALLERY", "CONTACT"],
        "min_plan": "BASIC",
    },
]
# fmt: on


async def seed_templates(db: AsyncSession) -> None:
    existing = await db.execute(select(Template))
    if existing.scalars().first():
        print("ℹ️  템플릿 데이터 이미 존재 — 건너뜀")
        return

    for t in TEMPLATES:
        db.add(Template(**t))
    await db.commit()
    print(f"✅ 템플릿 {len(TEMPLATES)}개 삽입 완료")


async def seed_super_admin(db: AsyncSession) -> None:
    existing = await db.execute(
        select(User).where(User.role == "SUPER_ADMIN")
    )
    if existing.scalars().first():
        print("ℹ️  슈퍼 어드민 계정 이미 존재 — 건너뜀")
        return

    if not settings.super_admin_password:
        print("⚠️  SUPER_ADMIN_PASSWORD 환경변수 미설정 — 슈퍼 어드민 생성 건너뜀")
        return

    db.add(
        User(
            email=settings.super_admin_email,
            password_hash=hash_password(settings.super_admin_password),
            role="SUPER_ADMIN",
            tenant_id=None,
        )
    )
    await db.commit()
    print(f"✅ 슈퍼 어드민 계정 생성: {settings.super_admin_email}")


async def seed_test_tenant(db: AsyncSession) -> None:
    existing = await db.execute(
        select(Tenant).where(Tenant.slug == "test-tenant")
    )
    if existing.scalars().first():
        print("ℹ️  테스트 테넌트 이미 존재 — 건너뜀")
        return

    tenant = Tenant(
        slug="test-tenant",
        name="테스트 사업체",
        template_type="GENERAL",
        plan_type="STANDARD",
        is_active=True,
    )
    db.add(tenant)
    await db.flush()  # tenant.id 획득

    db.add(
        User(
            tenant_id=tenant.id,
            email="admin@test-tenant.com",
            password_hash=hash_password("password123"),
            role="TENANT_ADMIN",
        )
    )
    await db.commit()
    print(f"✅ 테스트 테넌트 생성: {tenant.slug} (admin@test-tenant.com / password123)")


async def main() -> None:
    # templates는 RLS 없이 super admin 컨텍스트로 삽입
    async with AsyncSessionLocal() as db:
        await db.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await seed_templates(db)
        await seed_super_admin(db)
        await seed_test_tenant(db)

    print("\n🎉 시드 데이터 삽입 완료")


if __name__ == "__main__":
    asyncio.run(main())
