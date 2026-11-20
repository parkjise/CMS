"""이용약관 · 개인정보처리방침 (T-200, 상위 기획서 10.2 #7 · 16.3).

사업체가 고친 문서가 없으면 기본 문안을 그때그때 만든다 — 사이트 설정(대표자 · 연락처)과
요금제(문의 보관 기간)가 바뀌면 기본 문안도 따라 바뀐다. 기본 문안은 예시라 게시 전
법률 확인이 필요하다 (관리자 화면에 늘 안내).

보관 기간은 시스템의 실제 동작과 맞춘다:
문의 — 요금제별 (workers/scheduled.py), 접속 IP · 브라우저 — 90일 (T-128),
해지 · 정지 사업체 — 30일 · 90일 뒤 파기, 결제 기록 5년 (T-198).
"""

from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.policy import ConsentRecord, PolicyVersion
from app.models.site import SiteSetting
from app.models.tenant import Tenant
from app.services import site_cache, tenant_purge
from app.services import site_settings as site_settings_service
from app.workers.scheduled import (
    INQUIRY_CLIENT_INFO_RETENTION_DAYS,
    INQUIRY_RETENTION_DAYS,
)

PolicyKind = Literal["terms", "privacy"]
POLICY_TITLES: dict[str, str] = {"terms": "이용약관", "privacy": "개인정보처리방침"}
POLICY_BODY_MAX = 30000
NOT_SET = "(사이트 설정에서 입력해 주세요)"
# 사이트 기본정보에서 숨긴 항목 (T-222) — 방문자에게 입력 안내가 보이지 않게
HIDDEN = "비공개"
_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "policies"


def _field(kind: str) -> str:
    return "terms_body" if kind == "terms" else "privacy_body"


def _inquiry_retention(plan: str) -> str:
    days = INQUIRY_RETENTION_DAYS.get(plan, INQUIRY_RETENTION_DAYS["BASIC"])
    return (
        "처리가 끝난 뒤 사업자가 지울 때까지"
        if days is None
        else f"접수일로부터 {days}일"
    )


def default_body(kind: str, tenant: Tenant, setting: SiteSetting | None) -> str:
    """기본 문안 — 사업체 이름 · 대표자 · 연락처 · 보관 기간을 채운다.

    공개로 둔 값만 쓴다 — 숨긴 항목이 약관 글로 새어 나가지 않게 (T-222).
    """
    info = site_settings_service.public_view(setting) if setting else None
    hidden = set(info.hidden_fields) if info else set()

    def value(raw: str | None, group: str) -> str:
        if raw:
            return raw
        return HIDDEN if group in hidden else NOT_SET

    name = (info.company_name if info else None) or tenant.name
    ceo = value(info.ceo if info else None, "ceo")
    phone = value(info.phone if info else None, "phone")
    email = value(info.email if info else None, "email")
    address = value(info.address if info else None, "address")
    # 보호책임자를 따로 정하지 않았으면 대표자 · 대표 연락처
    officer = (info.privacy_officer if info else None) or ceo
    officer_email = (info.privacy_email if info else None) or email
    template = (_TEMPLATE_DIR / f"{kind}.txt").read_text(encoding="utf-8")
    return template.format(
        name=name,
        ceo=ceo,
        phone=phone,
        email=email,
        address=address,
        officer=officer,
        officer_email=officer_email,
        inquiry=_inquiry_retention(tenant.plan_type),
        client_info_days=INQUIRY_CLIENT_INFO_RETENTION_DAYS,
        purge_days=tenant_purge.CANCELLED_RETENTION_DAYS,
    ).strip()


async def _setting(db: AsyncSession, tenant_id: UUID) -> SiteSetting | None:
    return (
        await db.execute(select(SiteSetting).where(SiteSetting.tenant_id == tenant_id))
    ).scalar_one_or_none()


# ── 버전 (T-224, 사이트 관리 기획서 SM-03) ──────────────────────────────────
#
# 초안 → 예약(시행일) 또는 바로 공개 → 다음 공개 때 보관.
# 공개 · 보관본은 고치지 않는다 — 공개본을 바꾸려면 새 초안을 만든다.
# 버전이 하나도 없으면 기본 문안을 그때그때 만든다 (사이트 설정이 바뀌면 따라 바뀜).

DRAFT = "draft"
SCHEDULED = "scheduled"
PUBLISHED = "published"
ARCHIVED = "archived"
WORKING = (DRAFT, SCHEDULED)
SUMMARY_MAX = 500
# 예약은 1년 안으로
SCHEDULE_MAX_DAYS = 366


class PolicyError(Exception):
    """화면에 보일 문장 · HTTP 상태"""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


async def _versions(
    db: AsyncSession, tenant_id: UUID, kind: str
) -> list[PolicyVersion]:
    result = await db.execute(
        select(PolicyVersion)
        .where(PolicyVersion.tenant_id == tenant_id, PolicyVersion.kind == kind)
        .order_by(PolicyVersion.version.desc())
    )
    return list(result.scalars())


def _pick(versions: list[PolicyVersion], *statuses: str) -> PolicyVersion | None:
    return next((v for v in versions if v.status in statuses), None)


def _summary(version: PolicyVersion) -> dict[str, Any]:
    return {
        "id": version.id,
        "version": version.version,
        "status": version.status,
        "summary": version.summary,
        "effective_at": version.effective_at,
        "published_at": version.published_at,
        "archived_at": version.archived_at,
        "created_at": version.created_at,
    }


def _document(
    kind: str,
    tenant: Tenant,
    setting: SiteSetting | None,
    versions: list[PolicyVersion],
) -> dict[str, Any]:
    """홈페이지에 보이는 문서 — 공개본, 없으면 기본 문안."""
    current = _pick(versions, PUBLISHED)
    # 0060 이전에 저장된 글(마이그레이션이 옮기지 못한 경우)도 그대로 보인다
    legacy = getattr(setting, _field(kind)) if setting and not current else None
    if current:
        body, updated = current.body, current.effective_at
    elif legacy:
        body, updated = legacy, setting.policies_updated_at if setting else None
    else:
        body, updated = default_body(kind, tenant, setting), None
    return {
        "kind": kind,
        "title": POLICY_TITLES[kind],
        "body": body,
        "is_default": current is None and not legacy,
        "updated_at": updated,
        "version": current.version if current else None,
        "effective_at": current.effective_at if current else None,
        # 홈페이지 '이전 버전' — 보관본만, 최신부터
        "history": [
            {"version": v.version, "effective_at": v.effective_at}
            for v in versions
            if v.status == ARCHIVED
        ],
    }


async def _admin_document(
    db: AsyncSession, tenant: Tenant, kind: str, setting: SiteSetting | None
) -> dict[str, Any]:
    versions = await _versions(db, tenant.id, kind)
    working = _pick(versions, *WORKING)
    return {
        **_document(kind, tenant, setting, versions),
        "default_body": default_body(kind, tenant, setting),
        "working": ({**_summary(working), "body": working.body} if working else None),
        "versions": [_summary(v) for v in versions],
    }


async def get_policies(db: AsyncSession, tenant: Tenant) -> dict[str, Any]:
    """관리자 화면 — 두 문서의 공개본 · 작업 중 버전 · 버전 이력 · 기본 문안."""
    setting = await _setting(db, tenant.id)
    return {
        kind: await _admin_document(db, tenant, kind, setting) for kind in POLICY_TITLES
    }


async def get_admin_policy(
    db: AsyncSession, tenant: Tenant, kind: str
) -> dict[str, Any]:
    return await _admin_document(db, tenant, kind, await _setting(db, tenant.id))


async def get_policy(db: AsyncSession, tenant: Tenant, kind: str) -> dict[str, Any]:
    return _document(
        kind,
        tenant,
        await _setting(db, tenant.id),
        await _versions(db, tenant.id, kind),
    )


async def get_version(
    db: AsyncSession, tenant: Tenant, kind: str, version: int, *, public: bool
) -> dict[str, Any] | None:
    """버전 한 개 — 홈페이지는 공개 · 보관본만."""
    row = next(
        (v for v in await _versions(db, tenant.id, kind) if v.version == version),
        None,
    )
    if row is None or (public and row.status not in (PUBLISHED, ARCHIVED)):
        return None
    return {
        **_summary(row),
        "kind": kind,
        "title": POLICY_TITLES[kind],
        "body": row.body,
    }


async def create_draft(
    db: AsyncSession, tenant: Tenant, kind: str, user_id: UUID | None
) -> dict[str, Any]:
    """새 초안 — 공개본(없으면 기본 문안)을 복사해 시작한다. 작업 중 버전은 하나만."""
    versions = await _versions(db, tenant.id, kind)
    if _pick(versions, *WORKING):
        raise PolicyError(
            "이미 작업 중인 초안이나 예약이 있어요. 그 버전을 먼저 마무리해 주세요.",
            409,
        )
    setting = await _setting(db, tenant.id)
    current = _document(kind, tenant, setting, versions)
    db.add(
        PolicyVersion(
            tenant_id=tenant.id,
            kind=kind,
            version=(versions[0].version + 1) if versions else 1,
            status=DRAFT,
            body=current["body"],
            created_by=user_id,
        )
    )
    await db.commit()
    return await get_admin_policy(db, tenant, kind)


async def _working(db: AsyncSession, tenant_id: UUID, kind: str) -> PolicyVersion:
    working = _pick(await _versions(db, tenant_id, kind), *WORKING)
    if working is None:
        raise PolicyError(
            "작업 중인 초안이 없어요. [새 버전 만들기]를 먼저 눌러 주세요.", 404
        )
    return working


async def update_draft(
    db: AsyncSession, tenant: Tenant, kind: str, body: str, summary: str | None
) -> dict[str, Any]:
    """초안 저장 — 예약된 버전은 예약을 취소한 뒤 고친다."""
    working = await _working(db, tenant.id, kind)
    if working.status != DRAFT:
        raise PolicyError(
            "예약된 버전이에요. 예약을 취소하면 다시 고칠 수 있어요.", 409
        )
    working.body = body
    working.summary = summary
    working.updated_at = datetime.now(UTC)
    await db.commit()
    return await get_admin_policy(db, tenant, kind)


async def _publish_now(
    db: AsyncSession, tenant_id: UUID, kind: str, version: PolicyVersion
) -> None:
    """공개본을 보관하고 이 버전을 공개 — 같은 트랜잭션 안에서"""
    now = datetime.now(UTC)
    await db.execute(
        update(PolicyVersion)
        .where(
            PolicyVersion.tenant_id == tenant_id,
            PolicyVersion.kind == kind,
            PolicyVersion.status == PUBLISHED,
        )
        .values(status=ARCHIVED, archived_at=now, updated_at=now)
    )
    # 보관이 먼저 반영돼야 '공개본 하나' 인덱스에 걸리지 않는다
    await db.flush()
    version.status = PUBLISHED
    version.published_at = now
    if version.effective_at is None or version.effective_at > now:
        version.effective_at = now
    version.updated_at = now


async def publish(
    db: AsyncSession, tenant: Tenant, kind: str, effective_at: datetime | None
) -> dict[str, Any]:
    """바로 공개(시행일이 없거나 지났으면) 또는 시행일 예약."""
    working = await _working(db, tenant.id, kind)
    if working.status != DRAFT:
        raise PolicyError(
            "이미 예약된 버전이에요. 예약을 취소한 뒤 다시 정해 주세요.", 409
        )
    if not working.body.strip():
        raise PolicyError("본문이 비어 있어요.")
    if not (working.summary or "").strip():
        raise PolicyError("변경 내용 요약을 적어 주세요. 버전 이력에 남아요.")
    now = datetime.now(UTC)
    if effective_at is not None and effective_at > now:
        if (effective_at - now).days > SCHEDULE_MAX_DAYS:
            raise PolicyError("시행일은 1년 안으로 정해 주세요.")
        working.status = SCHEDULED
        working.effective_at = effective_at
        working.updated_at = now
        await db.commit()
        return await get_admin_policy(db, tenant, kind)
    working.effective_at = None
    await _publish_now(db, tenant.id, kind, working)
    await db.commit()
    await site_cache.purge_site(db, tenant.id)
    return await get_admin_policy(db, tenant, kind)


async def cancel_schedule(
    db: AsyncSession, tenant: Tenant, kind: str
) -> dict[str, Any]:
    working = await _working(db, tenant.id, kind)
    if working.status != SCHEDULED:
        raise PolicyError("예약된 버전이 없어요.", 409)
    working.status = DRAFT
    working.effective_at = None
    working.updated_at = datetime.now(UTC)
    await db.commit()
    return await get_admin_policy(db, tenant, kind)


async def release_due_policies(db: AsyncSession) -> int:
    """시행일이 지난 예약을 공개로 (5분마다). 여러 번 돌아도 결과가 같다.

    다른 작업자가 잡고 있는 행은 건너뛴다(SKIP LOCKED). 공개한 버전 수를 돌려준다.
    super admin 컨텍스트에서 부른다.
    """
    now = datetime.now(UTC)
    due = list(
        (
            await db.execute(
                select(PolicyVersion)
                .where(
                    PolicyVersion.status == SCHEDULED,
                    PolicyVersion.effective_at <= now,
                )
                .order_by(PolicyVersion.effective_at)
                .with_for_update(skip_locked=True)
            )
        ).scalars()
    )
    tenants: set[UUID] = set()
    for version in due:
        await _publish_now(db, version.tenant_id, version.kind, version)
        tenants.add(version.tenant_id)
    await db.commit()
    for tenant_id in tenants:
        await site_cache.purge_site(db, tenant_id)
    return len(due)


# ── 동의 기록 (T-224) ─────────────────────────────────────────────────────

ConsentSubject = Literal["member", "board_post", "inquiry"]


async def record_consents(
    db: AsyncSession,
    tenant_id: UUID,
    kinds: tuple[str, ...],
    *,
    subject_type: ConsentSubject,
    subject_id: UUID | None,
    source: str,
) -> None:
    """동의한 문서의 지금 공개 버전을 남긴다 (기본 문안이면 버전 없음).

    커밋은 부르는 쪽이 — 회원 · 글 · 문의를 저장하는 트랜잭션과 함께.
    """
    published = {
        v.kind: v
        for v in (
            await db.execute(
                select(PolicyVersion).where(
                    PolicyVersion.tenant_id == tenant_id,
                    PolicyVersion.status == PUBLISHED,
                    PolicyVersion.kind.in_(kinds),
                )
            )
        ).scalars()
    }
    for kind in kinds:
        version = published.get(kind)
        db.add(
            ConsentRecord(
                tenant_id=tenant_id,
                kind=kind,
                policy_version_id=version.id if version else None,
                version=version.version if version else None,
                subject_type=subject_type,
                subject_id=subject_id,
                agreed=True,
                source=source,
            )
        )
