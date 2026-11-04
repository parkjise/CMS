"""T-100 커스텀 도메인 자동화 서비스.

test 모드(`settings.domain_mode != "live"`)에서는 DNS 조회 · certbot 호출 없이
결정적 stub 으로 동작한다. live 모드의 인증서 발급은 domain 큐(domain-worker)에서만.
Nginx 는 접속 도메인으로 인증서를 찾으므로 설정 변경 · 재시작이 필요 없다 (T-137).

상태 전이: PENDING → DNS_CHECKING → SSL_ISSUING → ACTIVE (실패 시 FAILED)
"""

import re
import subprocess
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

from cryptography import x509
from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.domain import TenantDomain
from app.models.tenant import Tenant
from app.services import billing_notice, site_cache

SSL_VALID_DAYS = 90
DOMAIN_PLANS = frozenset({"STANDARD", "PREMIUM"})
DOMAIN_PLAN_MESSAGE = "커스텀 도메인은 STANDARD 이상 요금제에서 연결할 수 있습니다."
_DOMAIN_RE = re.compile(
    r"^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$"
)


class DomainError(RuntimeError):
    """도메인 처리 관련 에러."""


def _is_live() -> bool:
    return settings.domain_mode == "live"


# ── 외부 연동 래퍼 (test 모드 stub) ────────────────────────────────────────
def _addresses(name: str) -> set[str]:
    import dns.resolver

    try:
        return {str(r) for r in dns.resolver.resolve(name, "A")}
    except Exception:
        return set()


def verify_dns(domain: str, expected_cname: str) -> bool:
    """우리 서버를 가리키는지 — CNAME 또는 같은 IP (루트 도메인은 CNAME 을 못 쓴다)."""
    if not _is_live():
        return True
    try:
        import dns.resolver

        answers = dns.resolver.resolve(domain, "CNAME")
        if expected_cname.rstrip(".") in {str(r.target).rstrip(".") for r in answers}:
            return True
    except Exception:
        pass
    return bool(_addresses(domain) & _addresses(expected_cname))


def _deploy_hook() -> str:
    """Nginx 워커가 인증서를 읽게 그룹 권한 — 갱신 때도 certbot 이 다시 실행한다."""
    base = settings.certbot_config_dir
    paths = f"{base}/live {base}/archive"
    return f"chgrp -R {settings.nginx_gid} {paths} && chmod -R g+rX {paths}"


def _run_certbot(args: list[str], action: str) -> None:
    result = subprocess.run(
        ["certbot", *args, "--config-dir", settings.certbot_config_dir],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise DomainError(f"{action} 실패: {result.stderr[:200]}")


def _certificate_expiry(domain: str) -> datetime:
    path = Path(settings.certbot_config_dir) / "live" / domain / "fullchain.pem"
    certificate = x509.load_pem_x509_certificate(path.read_bytes())
    return certificate.not_valid_after_utc


def issue_ssl_certificate(domain: str) -> datetime:
    """Let's Encrypt 발급 (webroot — Nginx :80 이 확인 파일을 내준다). 만료일 반환."""
    if not _is_live():
        return datetime.now(UTC) + timedelta(days=SSL_VALID_DAYS)
    _run_certbot(
        [
            "certonly",
            "--webroot",
            "-w",
            settings.certbot_webroot,
            "-d",
            domain,
            "--cert-name",
            domain,
            "--non-interactive",
            "--agree-tos",
            "--email",
            settings.domain_cert_email,
            "--deploy-hook",
            _deploy_hook(),
        ],
        "SSL 발급",
    )
    return _certificate_expiry(domain)


def renew_ssl_certificate(domain: str) -> datetime:
    if not _is_live():
        return datetime.now(UTC) + timedelta(days=SSL_VALID_DAYS)
    _run_certbot(["renew", "--cert-name", domain, "--non-interactive"], "SSL 갱신")
    return _certificate_expiry(domain)


def delete_ssl_certificate(domain: str) -> None:
    if not _is_live():
        return
    _run_certbot(["delete", "--cert-name", domain, "--non-interactive"], "SSL 삭제")


async def _get_domain(db: AsyncSession, tenant_id: uuid.UUID) -> TenantDomain | None:
    return (
        await db.execute(
            select(TenantDomain).where(TenantDomain.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()


def normalize_host(host: str) -> str:
    """Host 헤더 → 도메인 (소문자, 포트 · 끝 점 제거)."""
    return host.strip().lower().split(":", 1)[0].rstrip(".")


async def active_slug_for_host(db: AsyncSession, host: str) -> str | None:
    """연결이 끝난 도메인의 사업체 slug — 홈페이지 미들웨어 · robots.txt 용 (T-137)."""
    return (
        await db.execute(
            select(Tenant.slug)
            .join(TenantDomain, TenantDomain.tenant_id == Tenant.id)
            .where(
                TenantDomain.domain == normalize_host(host),
                TenantDomain.status == "ACTIVE",
                Tenant.is_active.is_(True),
                Tenant.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()


async def domain_allowed(db: AsyncSession, tenant_id: uuid.UUID) -> bool:
    plan = (
        await db.execute(select(Tenant.plan_type).where(Tenant.id == tenant_id))
    ).scalar_one_or_none()
    return (plan or "").upper() in DOMAIN_PLANS


async def ensure_domain_allowed(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    """새로 연결할 때만 검사 — 요금제를 내려도 이미 연결된 도메인은 끊지 않는다."""
    if not await domain_allowed(db, tenant_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=DOMAIN_PLAN_MESSAGE,
        )


def _validated_domain(domain: str) -> str:
    """도메인 형식 · 서비스 주소 거부 — 인증서 폴더 이름 · certbot 인자로 쓰인다."""
    value = normalize_host(domain)
    service = (urlparse(settings.client_base_url).hostname or "").removeprefix("www.")
    is_service = bool(service) and (value == service or value.endswith(f".{service}"))
    if not _DOMAIN_RE.match(value) or is_service:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="도메인 주소가 올바르지 않습니다. 예: www.my-hospital.com",
        )
    return value


async def register_domain(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    domain: str,
    domain_type: str = "CUSTOM",
) -> TenantDomain:
    """커스텀 도메인 등록 신청 (PENDING). 테넌트당 1개."""
    await ensure_domain_allowed(db, tenant_id)
    domain = _validated_domain(domain)
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
    if row.status in ("SSL_ISSUING", "ACTIVE"):
        return row  # 발급 중 · 완료 — 다시 눌러도 인증서를 또 발급하지 않는다

    row.status = "DNS_CHECKING"
    row.failure_code = None
    await db.commit()

    if not verify_dns(row.domain, settings.domain_cname_target):
        row.status = "FAILED"
        row.failure_code = "DNS"
        await db.commit()
        await db.refresh(row)
        return row

    row.status = "SSL_ISSUING"
    await db.commit()

    if _is_live():
        # 발급은 인증서 저장소를 쓸 수 있는 domain-worker 에서 — 끝나면 ACTIVE
        from app.workers.domain import issue_domain_certificate

        issue_domain_certificate.delay(str(row.id))
        await db.refresh(row)
        return row
    return await finish_activation(db, row)


async def finish_activation(db: AsyncSession, row: TenantDomain) -> TenantDomain:
    """인증서 발급 → ACTIVE (실패하면 FAILED)."""
    tenant_id = row.tenant_id
    try:
        ssl_expires = issue_ssl_certificate(row.domain)
    except DomainError:
        row.status = "FAILED"
        row.failure_code = "SSL"
        await db.commit()
        await db.refresh(row)
        return row

    row.status = "ACTIVE"
    row.failure_code = None
    row.ssl_expires_at = ssl_expires
    row.verified_at = datetime.now(UTC)
    await db.execute(
        update(Tenant).where(Tenant.id == tenant_id).values(custom_domain=row.domain)
    )
    await db.commit()
    await db.refresh(row)
    await site_cache.purge_site(db, tenant_id)  # 대표 주소가 연결한 도메인으로 바뀐다
    await billing_notice.domain_activated(db, tenant_id, row.domain)
    return row


async def remove_domain(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    row = await get_status(db, tenant_id)
    domain = row.domain
    await db.execute(
        update(Tenant).where(Tenant.id == tenant_id).values(custom_domain=None)
    )
    await db.delete(row)
    await db.commit()
    await site_cache.purge_site(db, tenant_id)
    if _is_live():
        from app.workers.domain import delete_domain_certificate

        delete_domain_certificate.delay(domain)


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
    if _is_live():
        # 인증서 저장소는 domain-worker 만 쓸 수 있다 — 결과는 만료일 · 실패 메일로 확인
        from app.workers.domain import renew_domain_certificate

        renew_domain_certificate.delay(str(row.id))
        return row
    row.ssl_expires_at = renew_ssl_certificate(row.domain)
    await db.commit()
    await db.refresh(row)
    return row
