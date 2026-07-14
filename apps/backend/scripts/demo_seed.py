"""데모 데이터 생성 (개발/데모/스크린샷용 헬퍼).

test-tenant에 섹션·문의·방문통계를 채워 관리자 화면이 풍성하게 보이도록 한다.
재실행 시 기존 데모 데이터를 지우고 다시 생성한다(멱등).
실행: cd apps/backend && PYTHONPATH=. poetry run python scripts/demo_seed.py
"""

import asyncio
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select, text

from app.db.session import AsyncSessionLocal
from app.models.analytics import SiteAnalytics
from app.models.inquiry import Inquiry
from app.models.section import Section, SectionSetting
from app.models.tenant import Tenant

SECTIONS = [
    ("HERO_BANNER", "메인 배너", [
        ("main_title", "건강한 삶의 시작, OO의원"),
        ("sub_copy", "비수술 관절·척추 치료 전문"),
    ]),
    ("INTRO", "병원 소개", [
        ("title", "정성을 다하는 진료"),
        ("description", "20년 경력의 의료진이 함께합니다."),
    ]),
    ("SERVICES", "진료 안내", [
        ("title", "진료 과목"),
        ("description", "도수치료 · 체외충격파 · 물리치료"),
    ]),
    ("GALLERY", "병원 둘러보기", [("title", "쾌적한 진료 환경")]),
    ("MAP", "오시는 길", [
        ("address", "서울시 강남구 테헤란로 123"),
        ("address_detail", "OO빌딩 5층"),
    ]),
    ("CONTACT", "문의하기", [("title", "무엇이든 문의하세요")]),
]

INQUIRIES = [
    ("GENERAL", "김민수", "010-1234-5678", "도수치료 비용이 궁금합니다.", "PENDING", False),
    ("RESERVATION", "이서연", "010-2345-6789", "토요일 진료 예약 가능한가요?", "PENDING", False),
    ("GENERAL", "박준호", "010-3456-7890", "주차 가능한지 문의드립니다.", "CONFIRMED", True),
    ("RESERVATION", "최지우", "010-4567-8901", "체외충격파 상담 원합니다.", "CONFIRMED", True),
    ("GENERAL", "정하늘", "010-5678-9012", "예약 변경하고 싶어요.", "PENDING", False),
]


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        t = (
            await db.execute(select(Tenant).where(Tenant.slug == "test-tenant"))
        ).scalars().first()
        if not t:
            print("❌ test-tenant 없음 — seed.py 먼저 실행")
            return
        tid = t.id

        # 기존 데모 데이터 제거 (재실행 대비)
        await db.execute(text("DELETE FROM section_settings WHERE tenant_id = :t"), {"t": str(tid)})
        await db.execute(text("DELETE FROM sections WHERE tenant_id = :t"), {"t": str(tid)})
        await db.execute(text("DELETE FROM inquiries WHERE tenant_id = :t"), {"t": str(tid)})
        await db.execute(text("DELETE FROM site_analytics WHERE tenant_id = :t"), {"t": str(tid)})
        await db.commit()

        # 섹션 + 설정
        for order, (stype, label, settings) in enumerate(SECTIONS):
            sec = Section(
                tenant_id=tid, section_type=stype, label=label,
                display_order=order, is_active=True,
            )
            db.add(sec)
            await db.flush()
            for fk, fv in settings:
                db.add(SectionSetting(
                    tenant_id=tid, section_id=sec.id,
                    field_key=fk, field_value=fv, value_type="text",
                ))
        # 문의
        base = datetime.now()
        for i, (itype, name, phone, msg, status, read) in enumerate(INQUIRIES):
            db.add(Inquiry(
                tenant_id=tid, inquiry_type=itype, name=name, phone=phone,
                message=msg, status=status, is_read=read,
            ))
        # 방문 통계 (최근 14일)
        for d in range(14):
            day = date.today() - timedelta(days=d)
            pv = 120 + (d * 7) % 90
            db.add(SiteAnalytics(
                tenant_id=tid, date=day,
                page_views=pv, unique_visitors=int(pv * 0.7),
                mobile_views=int(pv * 0.55),
                referrers={"naver": pv // 2, "google": pv // 4, "direct": pv // 4},
                bounce_rate=0.42, avg_session_duration=95,
            ))
        await db.commit()
        print("✅ 데모 데이터 생성 완료: 섹션 6 · 문의 5 · 방문통계 14일")


if __name__ == "__main__":
    asyncio.run(main())
