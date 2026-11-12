"""해지 · 정지 사업체 데이터 파기 (T-198, 기획서 10.2 #5 · #6 · 15.2 · 15.7).

- 해지(CANCELLED): 구독 기간이 끝나고 30일, 정지(SUSPENDED · PAST_DUE): 멈춘 날부터 90일
- 파기 7일 전 관리자에게 예고 메일 — 예고 뒤 7일이 지나야 지운다 (예고 없이 안 지움)
- 그 사이 다시 결제해 살아난 사업체는 건너뛴다 (돌 때마다 구독 상태를 다시 본다)
- 지운다: 홈페이지 · 게시판 · 문의 · 회원 · 통계 · 변경 기록 · 관리자 계정
  · 저장소 파일 · 도메인
- 남긴다: 결제 · 요금제 변경 기록과 구독(빌링키는 지움) — 전자상거래법 5년.
  사업체 이름 · 해지일

CLAUDE.md 6 소프트 삭제 원칙의 예외 (2026-11-11 사용자 결정).
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.audit import AuditLog
from app.models.billing import Subscription
from app.models.domain import TenantDomain
from app.models.tenant import Tenant
from app.services import domain as domain_service
from app.services import email as email_service
from app.services import image as image_service
from app.services import site_cache
from app.services.announcement import resolve_admin_emails

logger = logging.getLogger(__name__)

CANCELLED_RETENTION_DAYS = 30
SUSPENDED_RETENTION_DAYS = 90
NOTICE_DAYS = 7
CANCELLED = "CANCELLED"
SUSPENDED_STATUSES = ("SUSPENDED", "PAST_DUE")
SYSTEM_ACTOR_ID = uuid.UUID(int=0)
SYSTEM_ROLE = "SYSTEM"
PURGED_SLUG_PREFIX = "deleted-"
S3_DELETE_BATCH = 1000

# 지우는 표 — 앞의 표가 뒤의 표를 가리키므로 이 순서대로 (FK NO ACTION)
PURGE_TABLES = (
    "board_post_attachments",
    "board_post_reports",
    "board_post_versions",
    "board_posts",
    "board_fields",
    "board_categories",
    "boards",
    "gallery_items",
    "section_settings",
    "sections",
    "inquiry_attachments",
    "inquiries",
    "member_password_reset_tokens",
    "member_reservations",
    "member_social_accounts",
    "phone_verifications",
    "site_members",
    "site_analytics",
    "ai_usage_log",
    "ai_reports",
    "announcement_reads",
    "admin_user_preferences",
    "notification_settings",
    "seo_settings",
    "sns_channel_settings",
    "site_settings",
    "template_change_history",
    "tenant_template_overrides",
    "tenant_features",
    "tenant_domains",
    "uploaded_files",
    "audit_logs",
    "users",
)
# 남기는 표 — 결제 기록 5년 (전자상거래법). 사업체 행은 이름 · 해지일만 남긴다
KEPT_TABLES = ("subscriptions", "payment_history", "plan_change_history")


@dataclass
class Due:
    tenant: Tenant
    purge_at: datetime


def purge_at(sub: Subscription) -> datetime | None:
    """이 구독의 사업체를 지울 날 — 쓰는 중인 구독(ACTIVE · TRIAL)은 None."""
    if sub.status == CANCELLED:
        return sub.current_period_end + timedelta(days=CANCELLED_RETENTION_DAYS)
    if sub.status in SUSPENDED_STATUSES:
        return sub.current_period_end + timedelta(days=SUSPENDED_RETENTION_DAYS)
    return None


async def _candidates(db: AsyncSession) -> list[Due]:
    """아직 지우지 않은, 멈춘 사업체와 그 파기일."""
    rows = await db.execute(
        select(Tenant, Subscription)
        .join(Subscription, Subscription.tenant_id == Tenant.id)
        .where(
            Tenant.data_purged_at.is_(None),
            Subscription.status.in_((CANCELLED, *SUSPENDED_STATUSES)),
        )
    )
    result = []
    for tenant, sub in rows.all():
        when = purge_at(sub)
        if when is not None:
            result.append(Due(tenant, when))
    return result


async def notify_upcoming(db: AsyncSession, now: datetime | None = None) -> int:
    """파기 7일 안으로 들어온 사업체에 예고 메일 — 한 번만. 보낸 사업체 수."""
    now = now or datetime.now(UTC)
    sent = 0
    for due in await _candidates(db):
        tenant = due.tenant
        if tenant.purge_notified_at is not None:
            continue
        if now < due.purge_at - timedelta(days=NOTICE_DAYS):
            continue
        # 예고 뒤 7일은 기다린다 — 늦게 예고했으면 그만큼 늦게 지운다
        delete_on = max(due.purge_at, now + timedelta(days=NOTICE_DAYS))
        for address in await resolve_admin_emails(db, [tenant.id]):
            try:
                await email_service.send_data_deletion_notice(
                    address, tenant_name=tenant.name, delete_on=delete_on
                )
            except Exception:
                logger.exception("데이터 파기 예고 메일 실패 tenant=%s", tenant.id)
        tenant.purge_notified_at = now
        sent += 1
    await db.commit()
    return sent


async def purge_due(db: AsyncSession, now: datetime | None = None) -> int:
    """파기일이 지나고 예고한 지 7일이 넘은 사업체를 지운다. 지운 사업체 수."""
    now = now or datetime.now(UTC)
    purged = 0
    for due in await _candidates(db):
        notified = due.tenant.purge_notified_at
        if now < due.purge_at or notified is None:
            continue
        if now < notified + timedelta(days=NOTICE_DAYS):
            continue
        await purge_tenant(db, due.tenant, now)
        purged += 1
    return purged


def _delete_storage(tenant_id: uuid.UUID) -> int:
    """저장소의 사업체 폴더(`{tenant_id}/`)를 통째로 — 실패해도 DB 파기는 계속."""
    client = image_service._get_s3_client()
    bucket = settings.minio_bucket_name
    removed = 0
    token: str | None = None
    while True:
        params = {
            "Bucket": bucket,
            "Prefix": f"{tenant_id}/",
            "MaxKeys": S3_DELETE_BATCH,
        }
        if token:
            params["ContinuationToken"] = token
        page = client.list_objects_v2(**params)
        keys = [{"Key": item["Key"]} for item in page.get("Contents", [])]
        if keys:
            client.delete_objects(
                Bucket=bucket, Delete={"Objects": keys, "Quiet": True}
            )
            removed += len(keys)
        if not page.get("IsTruncated"):
            return removed
        token = page.get("NextContinuationToken")


async def purge_tenant(
    db: AsyncSession, tenant: Tenant, now: datetime | None = None
) -> None:
    """사업체 하나의 데이터를 지운다. 부르는 쪽이 슈퍼 어드민 RLS 컨텍스트를 연다."""
    now = now or datetime.now(UTC)
    tenant_id = tenant.id
    old_slug = tenant.slug
    emails = await resolve_admin_emails(db, [tenant_id])
    domains = list(
        (
            await db.execute(
                select(TenantDomain.domain).where(TenantDomain.tenant_id == tenant_id)
            )
        )
        .scalars()
        .all()
    )

    # 남기는 결제 기록이 지울 관리자 계정을 가리키지 않게
    await db.execute(
        text("UPDATE plan_change_history SET changed_by = NULL WHERE tenant_id = :t"),
        {"t": tenant_id},
    )
    for table in PURGE_TABLES:
        await db.execute(
            text(f"DELETE FROM {table} WHERE tenant_id = :t"),  # noqa: S608 — 고정 목록
            {"t": tenant_id},
        )
    # 결제 수단(빌링키 · 카드 표시)은 결제 기록이 아니다
    await db.execute(
        update(Subscription)
        .where(Subscription.tenant_id == tenant_id)
        .values(billing_key=None, card_company=None, card_last4=None)
    )
    tenant.slug = f"{PURGED_SLUG_PREFIX}{tenant_id.hex[:12]}"
    tenant.custom_domain = None
    tenant.is_active = False
    tenant.deleted_at = tenant.deleted_at or now
    tenant.data_purged_at = now
    # 사업체의 기록은 지웠으므로 운영사 쪽 기록(tenant 없음)에 남긴다
    db.add(
        AuditLog(
            tenant_id=None,
            actor_id=SYSTEM_ACTOR_ID,
            actor_role=SYSTEM_ROLE,
            action="TENANT_DATA_PURGED",
            target_type="tenant",
            target_id=str(tenant_id),
            after_value={"name": tenant.name, "slug": old_slug},
        )
    )
    await db.commit()

    try:
        _delete_storage(tenant_id)
    except Exception:
        logger.exception("사업체 저장소 파일 삭제 실패 tenant=%s", tenant_id)
    if domains and domain_service._is_live():
        from app.workers.domain import delete_domain_certificate

        for domain in domains:
            delete_domain_certificate.delay(domain)
    await site_cache.purge_slugs([old_slug], [tenant_id])
    for address in emails:
        try:
            await email_service.send_data_deleted(address)
        except Exception:
            logger.exception("데이터 삭제 완료 메일 실패 tenant=%s", tenant_id)
