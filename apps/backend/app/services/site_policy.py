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

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.site import SiteSetting
from app.models.tenant import Tenant
from app.services import site_cache, tenant_purge
from app.workers.scheduled import (
    INQUIRY_CLIENT_INFO_RETENTION_DAYS,
    INQUIRY_RETENTION_DAYS,
)

PolicyKind = Literal["terms", "privacy"]
POLICY_TITLES: dict[str, str] = {"terms": "이용약관", "privacy": "개인정보처리방침"}
POLICY_BODY_MAX = 30000
NOT_SET = "(사이트 설정에서 입력해 주세요)"
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
    """기본 문안 — 사업체 이름 · 대표자 · 연락처 · 보관 기간을 채운다."""
    name = tenant.name
    ceo = (setting.ceo if setting else None) or NOT_SET
    phone = (setting.phone if setting else None) or NOT_SET
    email = (setting.email if setting else None) or NOT_SET
    address = (setting.address if setting else None) or NOT_SET
    template = (_TEMPLATE_DIR / f"{kind}.txt").read_text(encoding="utf-8")
    return template.format(
        name=name,
        ceo=ceo,
        phone=phone,
        email=email,
        address=address,
        inquiry=_inquiry_retention(tenant.plan_type),
        client_info_days=INQUIRY_CLIENT_INFO_RETENTION_DAYS,
        purge_days=tenant_purge.CANCELLED_RETENTION_DAYS,
    ).strip()


async def _setting(db: AsyncSession, tenant_id: UUID) -> SiteSetting | None:
    return (
        await db.execute(select(SiteSetting).where(SiteSetting.tenant_id == tenant_id))
    ).scalar_one_or_none()


def _document(kind: str, tenant: Tenant, setting: SiteSetting | None) -> dict[str, Any]:
    saved = getattr(setting, _field(kind)) if setting else None
    return {
        "kind": kind,
        "title": POLICY_TITLES[kind],
        "body": saved or default_body(kind, tenant, setting),
        "is_default": not saved,
        "updated_at": setting.policies_updated_at if setting and saved else None,
    }


async def get_policies(db: AsyncSession, tenant: Tenant) -> dict[str, Any]:
    """관리자 화면 — 두 문서와 각각의 기본 문안."""
    setting = await _setting(db, tenant.id)
    return {
        kind: {
            **_document(kind, tenant, setting),
            "default_body": default_body(kind, tenant, setting),
        }
        for kind in POLICY_TITLES
    }


async def get_policy(db: AsyncSession, tenant: Tenant, kind: str) -> dict[str, Any]:
    return _document(kind, tenant, await _setting(db, tenant.id))


async def update_policy(
    db: AsyncSession, tenant: Tenant, kind: str, body: str | None
) -> dict[str, Any]:
    """문서를 저장한다. body 가 None 이면 기본 문안으로 되돌린다."""
    setting = await _setting(db, tenant.id)
    if setting is None:
        setting = SiteSetting(tenant_id=tenant.id)
        db.add(setting)
    text = (body or "").strip()
    setattr(setting, _field(kind), text or None)
    setting.policies_updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(setting)
    # 홈페이지는 사이트 캐시 태그로 다시 읽는다
    await site_cache.purge_site(db, tenant.id)
    return {
        **_document(kind, tenant, setting),
        "default_body": default_body(kind, tenant, setting),
    }
