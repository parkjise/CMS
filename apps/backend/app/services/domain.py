"""T-100 커스텀 도메인 자동화 서비스.

test 모드(`settings.domain_mode != "live"`)에서는 DNS 조회·certbot·nginx 호출
없이 결정적 stub으로 동작한다. 실제 발급/설정은 live 모드에서만 일어난다.

상태 전이: PENDING → DNS_CHECKING → SSL_ISSUING → ACTIVE (실패 시 FAILED)
"""

import subprocess
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.domain import TenantDomain
from app.models.tenant import Tenant

SSL_VALID_DAYS = 90


class DomainError(RuntimeError):
    """도메인 처리 관련 에러."""


def _is_live() -> bool:
    return settings.domain_mode == "live"


# ── 외부 연동 래퍼 (test 모드 stub) ────────────────────────────────────────
def verify_dns(domain: str, expected_cname: str) -> bool:
    """도메인의 CNAME이 우리 타깃을 가리키는지 확인."""
    if not _is_live():
        return True
    try:
        import dns.resolver

        answers = dns.resolver.resolve(domain, "CNAME")
        targets = {str(r.target).rstrip(".") for r in answers}
        return expected_cname.rstrip(".") in targets
    except Exception:
        return False


def issue_ssl_certificate(domain: str) -> datetime:
    """Let's Encrypt SSL 발급. 만료일 반환."""
    now = datetime.now(UTC)
    if not _is_live():
        return now + timedelta(days=SSL_VALID_DAYS)
    result = subprocess.run(
        ["certbot", "--nginx", "-d", domain, "--non-interactive", "--agree-tos"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise DomainError(f"SSL 발급 실패: {result.stderr[:200]}")
    return now + timedelta(days=SSL_VALID_DAYS)


def add_nginx_config(domain: str, tenant_slug: str) -> None:
    """Nginx 가상 호스트 추가."""
    if not _is_live():
        return
    config = (
        f"server {{\n"
        f"    server_name {domain};\n"
        f"    location / {{ proxy_pass http://client_upstream; "
        f'proxy_set_header X-Tenant-Slug "{tenant_slug}"; }}\n'
        f"}}\n"
    )
    path = f"{settings.nginx_sites_dir}/{domain}.conf"
    with open(path, "w") as f:
        f.write(config)
    subprocess.run(["nginx", "-s", "reload"], capture_output=True)


def remove_nginx_config(domain: str) -> None:
    if not _is_live():
        return
    import os

    path = f"{settings.nginx_sites_dir}/{domain}.conf"
    if os.path.exists(path):
        os.remove(path)
        subprocess.run(["nginx", "-s", "reload"], capture_output=True)


def renew_ssl_certificate(domain: str) -> datetime:
    now = datetime.now(UTC)
    if not _is_live():
        return now + timedelta(days=SSL_VALID_DAYS)
    result = subprocess.run(
        ["certbot", "renew", "--cert-name", domain, "--non-interactive"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise DomainError(f"SSL 갱신 실패: {result.stderr[:200]}")
    return now + timedelta(days=SSL_VALID_DAYS)


# ── 오케스트레이션 ─────────────────────────────────────────────────────────
async def _get_domain(db: AsyncSession, tenant_id: uuid.UUID) -> TenantDomain | None:
    return (
        await db.execute(
            select(TenantDomain).where(TenantDomain.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()


async def register_domain(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    domain: str,
    domain_type: str = "CUSTOM",
) -> TenantDomain:
    """커스텀 도메인 등록 신청 (PENDING). 테넌트당 1개."""
    if await _get_domain(db, tenant_id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 등록된 도메인이 있습니다. 해제 후 다시 시도하세요.",
        )
    existing = (
        await db.execute(select(TenantDomain).where(TenantDomain.domain == domain))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 사용 중인 도메인입니다.",
        )
    row = TenantDomain(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        domain=domain,
        domain_type=domain_type,
        status="PENDING",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_status(db: AsyncSession, tenant_id: uuid.UUID) -> TenantDomain:
    row = await _get_domain(db, tenant_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="등록된 도메인이 없습니다."
        )
    return row


async def verify_domain(db: AsyncSession, tenant_id: uuid.UUID) -> TenantDomain:
    """DNS 확인 → SSL 발급 → Nginx 설정 → ACTIVE 전환."""
    row = await get_status(db, tenant_id)
    slug = (
        await db.execute(select(Tenant.slug).where(Tenant.id == tenant_id))
    ).scalar_one_or_none() or ""

    row.status = "DNS_CHECKING"
    await db.commit()

    if not verify_dns(row.domain, settings.domain_cname_target):
        row.status = "FAILED"
        await db.commit()
        await db.refresh(row)
        return row

    row.status = "SSL_ISSUING"
    await db.commit()

    try:
        ssl_expires = issue_ssl_certificate(row.domain)
        add_nginx_config(row.domain, slug)
    except DomainError:
        row.status = "FAILED"
        await db.commit()
        await db.refresh(row)
        return row

    row.status = "ACTIVE"
    row.ssl_expires_at = ssl_expires
    row.verified_at = datetime.now(UTC)
    await db.execute(
        update(Tenant).where(Tenant.id == tenant_id).values(custom_domain=row.domain)
    )
    await db.commit()
    await db.refresh(row)
    return row


async def remove_domain(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    row = await get_status(db, tenant_id)
    remove_nginx_config(row.domain)
    await db.execute(
        update(Tenant).where(Tenant.id == tenant_id).values(custom_domain=None)
    )
    await db.delete(row)
    await db.commit()


# ── 슈퍼 어드민 ────────────────────────────────────────────────────────────
async def list_domains(db: AsyncSession) -> list[TenantDomain]:
    rows = (
        (
            await db.execute(
                select(TenantDomain).order_by(TenantDomain.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return list(rows)


async def renew_ssl(db: AsyncSession, domain_id: uuid.UUID) -> TenantDomain:
    row = await db.get(TenantDomain, domain_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="도메인을 찾을 수 없습니다."
        )
    row.ssl_expires_at = renew_ssl_certificate(row.domain)
    await db.commit()
    await db.refresh(row)
    return row
