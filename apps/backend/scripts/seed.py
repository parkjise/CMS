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

TEMPLATES = [
    {
        "template_type": "HOSPITAL",
        "name": "병원 기본",
        "description": "병원·의원에 최적화된 신뢰감 있는 레이아웃",
        "css_variables": {
            "primary": "#1a73e8",
            "secondary": "#e8f0fe",
            "font_heading": "Noto Sans KR",
            "font_body": "Noto Sans KR",
            "border_radius": "8px",
        },
        "section_layouts": ["HERO_BANNER", "INTRO", "SERVICES", "TEAM", "FAQ", "CONTACT"],
        "min_plan": "BASIC",
    },
    {
        "template_type": "HOSPITAL",
        "name": "병원 모던",
        "description": "밝고 현대적인 느낌의 병원 홈페이지",
        "css_variables": {
            "primary": "#00897b",
            "secondary": "#e0f2f1",
            "font_heading": "Pretendard",
            "font_body": "Pretendard",
            "border_radius": "12px",
        },
        "section_layouts": ["HERO_BANNER", "INTRO", "SERVICES", "GALLERY", "CONTACT", "MAP"],
        "min_plan": "STANDARD",
    },
    {
        "template_type": "PENSION",
        "name": "펜션 감성",
        "description": "자연 친화적인 분위기의 펜션 홈페이지",
        "css_variables": {
            "primary": "#6d4c41",
            "secondary": "#efebe9",
            "font_heading": "Noto Serif KR",
            "font_body": "Noto Sans KR",
            "border_radius": "4px",
        },
        "section_layouts": ["HERO_BANNER", "INTRO", "GALLERY", "RESERVATION", "FAQ", "MAP"],
        "min_plan": "BASIC",
    },
    {
        "template_type": "STARTUP",
        "name": "스타트업 심플",
        "description": "군더더기 없는 미니멀 스타트업 랜딩페이지",
        "css_variables": {
            "primary": "#5c6bc0",
            "secondary": "#e8eaf6",
            "font_heading": "Pretendard",
            "font_body": "Pretendard",
            "border_radius": "16px",
        },
        "section_layouts": ["HERO_BANNER", "INTRO", "SERVICES", "PORTFOLIO", "TEAM", "CONTACT"],
        "min_plan": "BASIC",
    },
    {
        "template_type": "GENERAL",
        "name": "일반 기본",
        "description": "어떤 업종에도 어울리는 범용 템플릿",
        "css_variables": {
            "primary": "#1565c0",
            "secondary": "#e3f2fd",
            "font_heading": "Noto Sans KR",
            "font_body": "Noto Sans KR",
            "border_radius": "8px",
        },
        "section_layouts": ["HERO_BANNER", "INTRO", "SERVICES", "CONTACT", "MAP"],
        "min_plan": "BASIC",
    },
    {
        "template_type": "GENERAL",
        "name": "일반 다크",
        "description": "세련된 다크 계열 범용 템플릿",
        "css_variables": {
            "primary": "#bb86fc",
            "secondary": "#1e1e2e",
            "font_heading": "Pretendard",
            "font_body": "Pretendard",
            "border_radius": "10px",
        },
        "section_layouts": ["HERO_BANNER", "INTRO", "SERVICES", "PORTFOLIO", "CONTACT"],
        "min_plan": "PREMIUM",
    },
]


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
