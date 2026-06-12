"""T-034 스케줄링 Celery 태스크 단위 테스트.

Celery Beat 의존 없이 _reset_monthly_notification_count / _cleanup_old_inquiries /
_cleanup_old_analytics async 함수를 직접 호출하여 검증.
"""

import uuid
from datetime import date

from sqlalchemy import text

from app.workers import scheduled as worker
from tests.conftest import _TestSession


async def _set_tenant_plan(tenant_id: str, plan: str) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("UPDATE tenants SET plan_type = :plan WHERE id = :tid"),
            {"plan": plan, "tid": tenant_id},
        )
        await session.commit()


# ── reset_monthly_notification_count ───────────────────────────────────────


class TestResetMonthlyNotificationCount:
    async def test_resets_count_and_reset_date_for_all_tenants(self, test_tenant):
        # 카운터가 가득 찬 상태로 setting 삽입
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text(
                    "INSERT INTO notification_settings "
                    "(id, tenant_id, monthly_kakao_count, monthly_reset_at, "
                    "created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :tid, 99, "
                    "(CURRENT_DATE - INTERVAL '60 days')::date, NOW(), NOW())"
                ),
                {"tid": test_tenant["id"]},
            )
            await session.commit()

        try:
            affected = await worker._reset_monthly_notification_count()
            assert affected >= 1

            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                row = await session.execute(
                    text(
                        "SELECT monthly_kakao_count, monthly_reset_at "
                        "FROM notification_settings WHERE tenant_id = :tid"
                    ),
                    {"tid": test_tenant["id"]},
                )
                r = row.one()
                assert r.monthly_kakao_count == 0
                assert r.monthly_reset_at == date.today().replace(day=1)
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("DELETE FROM notification_settings WHERE tenant_id = :tid"),
                    {"tid": test_tenant["id"]},
                )
                await session.commit()


# ── cleanup_old_inquiries ──────────────────────────────────────────────────


async def _insert_inquiry(tenant_id: str, days_ago: int) -> str:
    inquiry_id = uuid.uuid4()
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text(
                f"""
                INSERT INTO inquiries
                  (id, tenant_id, inquiry_type, name, phone, message, status,
                   is_read, is_notified, created_at, updated_at)
                VALUES (:id, :tid, 'GENERAL', '홍길동', '010-1111-2222',
                  '테스트', 'PENDING', false, false,
                  NOW() - INTERVAL '{days_ago} days', NOW())
                """
            ),
            {"id": str(inquiry_id), "tid": tenant_id},
        )
        await session.commit()
    return str(inquiry_id)


class TestCleanupOldInquiries:
    async def test_basic_plan_soft_deletes_inquiries_over_30_days(self, test_tenant):
        await _set_tenant_plan(test_tenant["id"], "BASIC")
        # BASIC = 30일 초과 inquiry는 소프트 삭제, 30일 이하는 보존
        old_id = await _insert_inquiry(test_tenant["id"], days_ago=45)
        recent_id = await _insert_inquiry(test_tenant["id"], days_ago=5)

        try:
            deleted = await worker._cleanup_old_inquiries()
            assert deleted >= 1

            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                old_row = await session.execute(
                    text("SELECT deleted_at FROM inquiries WHERE id = :id"),
                    {"id": old_id},
                )
                recent_row = await session.execute(
                    text("SELECT deleted_at FROM inquiries WHERE id = :id"),
                    {"id": recent_id},
                )
                assert old_row.scalar_one() is not None
                assert recent_row.scalar_one() is None
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("DELETE FROM inquiries WHERE id IN (:o, :r)"),
                    {"o": old_id, "r": recent_id},
                )
                await session.commit()

    async def test_premium_plan_keeps_all_inquiries(self, test_tenant):
        """PREMIUM은 영구 보관 → 1년 전 데이터도 유지."""
        await _set_tenant_plan(test_tenant["id"], "PREMIUM")
        very_old_id = await _insert_inquiry(test_tenant["id"], days_ago=400)

        try:
            await worker._cleanup_old_inquiries()
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                row = await session.execute(
                    text("SELECT deleted_at FROM inquiries WHERE id = :id"),
                    {"id": very_old_id},
                )
                assert row.scalar_one() is None
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("DELETE FROM inquiries WHERE id = :id"),
                    {"id": very_old_id},
                )
                await session.commit()

    async def test_standard_plan_uses_180_day_window(self, test_tenant):
        await _set_tenant_plan(test_tenant["id"], "STANDARD")
        edge_id = await _insert_inquiry(test_tenant["id"], days_ago=200)
        recent_id = await _insert_inquiry(test_tenant["id"], days_ago=100)

        try:
            await worker._cleanup_old_inquiries()
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                edge_row = await session.execute(
                    text("SELECT deleted_at FROM inquiries WHERE id = :id"),
                    {"id": edge_id},
                )
                recent_row = await session.execute(
                    text("SELECT deleted_at FROM inquiries WHERE id = :id"),
                    {"id": recent_id},
                )
                assert edge_row.scalar_one() is not None
                assert recent_row.scalar_one() is None
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("DELETE FROM inquiries WHERE id IN (:e, :r)"),
                    {"e": edge_id, "r": recent_id},
                )
                await session.commit()


# ── cleanup_old_analytics ──────────────────────────────────────────────────


async def _insert_analytics(tenant_id: str, days_ago: int) -> str:
    analytics_id = uuid.uuid4()
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text(
                f"""
                INSERT INTO site_analytics
                  (id, tenant_id, date, page_views, unique_visitors,
                   created_at, updated_at)
                VALUES (:id, :tid, CURRENT_DATE - INTERVAL '{days_ago} days',
                  100, 50, NOW(), NOW())
                ON CONFLICT (tenant_id, date) DO NOTHING
                """
            ),
            {"id": str(analytics_id), "tid": tenant_id},
        )
        await session.commit()
    return str(analytics_id)


class TestCleanupOldAnalytics:
    async def test_basic_plan_removes_analytics_over_90_days(self, test_tenant):
        # BASIC = 90일
        await _set_tenant_plan(test_tenant["id"], "BASIC")
        old_id = await _insert_analytics(test_tenant["id"], days_ago=120)
        recent_id = await _insert_analytics(test_tenant["id"], days_ago=30)

        try:
            await worker._cleanup_old_analytics()

            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                old_row = await session.execute(
                    text("SELECT id FROM site_analytics WHERE id = :id"),
                    {"id": old_id},
                )
                recent_row = await session.execute(
                    text("SELECT id FROM site_analytics WHERE id = :id"),
                    {"id": recent_id},
                )
                assert old_row.scalar_one_or_none() is None
                assert recent_row.scalar_one_or_none() is not None
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("DELETE FROM site_analytics WHERE tenant_id = :tid"),
                    {"tid": test_tenant["id"]},
                )
                await session.commit()

    async def test_premium_plan_keeps_within_3_years(self, test_tenant):
        """PREMIUM = 1095일 (3년). 그 전 데이터까지는 유지."""
        await _set_tenant_plan(test_tenant["id"], "PREMIUM")
        # 2년 전 데이터는 보존되어야 함
        two_years_old = await _insert_analytics(test_tenant["id"], days_ago=730)

        try:
            await worker._cleanup_old_analytics()
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                row = await session.execute(
                    text("SELECT id FROM site_analytics WHERE id = :id"),
                    {"id": two_years_old},
                )
                assert row.scalar_one_or_none() is not None
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("DELETE FROM site_analytics WHERE tenant_id = :tid"),
                    {"tid": test_tenant["id"]},
                )
                await session.commit()


# ── Beat 스케줄 등록 확인 ─────────────────────────────────────────────────


class TestBeatSchedule:
    def test_all_three_tasks_registered_in_beat_schedule(self):
        from app.workers.celery_app import celery_app

        schedule = celery_app.conf.beat_schedule
        assert "reset-monthly-notification-count" in schedule
        assert "cleanup-old-inquiries-daily-2am" in schedule
        assert "cleanup-old-analytics-daily-230am" in schedule
