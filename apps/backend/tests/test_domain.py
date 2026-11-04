"""T-100 커스텀 도메인 서비스/API/워커 테스트 (domain_mode=test stub)."""

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

import dns.resolver
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID
from fastapi import HTTPException
from sqlalchemy import text

from app.core.config import settings
from app.core.security import create_access_token
from app.services import domain as svc
from app.workers import domain as worker
from tests.conftest import _TestSession  # type: ignore


@pytest.fixture
async def super_headers() -> dict:
    user_id = uuid.uuid4()
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text(
                "INSERT INTO users "
                "(id, tenant_id, email, password_hash, role, is_active, "
                " created_at, updated_at) "
                "VALUES (:id, NULL, :email, 'x', 'SUPER_ADMIN', true, now(), now())"
            ),
            {"id": str(user_id), "email": f"sa-{uuid.uuid4().hex[:6]}@cms.io"},
        )
        await session.commit()
    token = create_access_token(
        user_id=user_id, tenant_id=None, role="SUPER_ADMIN", is_super_admin=True
    )
    yield {"Authorization": f"Bearer {token}"}
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("DELETE FROM users WHERE id = :id"), {"id": str(user_id)}
        )
        await session.commit()


async def _cleanup(tenant_id: str) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await s.execute(
            text("DELETE FROM tenant_domains WHERE tenant_id = :t"), {"t": tenant_id}
        )
        await s.execute(
            text("UPDATE tenants SET custom_domain = NULL WHERE id = :t"),
            {"t": tenant_id},
        )
        await s.commit()


def _domain() -> str:
    return f"www.{uuid.uuid4().hex[:8]}.com"


class TestDomainApi:
    async def test_register_and_status(
        self, client, auth_headers, test_tenant, test_user
    ):
        try:
            resp = await client.post(
                "/api/v1/domain/register",
                headers=auth_headers,
                json={"domain": _domain(), "domain_type": "CUSTOM"},
            )
            assert resp.status_code == 200, resp.text
            data = resp.json()["data"]
            assert data["status"] == "PENDING"
            assert data["cname_target"]

            st = await client.get("/api/v1/domain/status", headers=auth_headers)
            assert st.status_code == 200
        finally:
            await _cleanup(test_tenant["id"])

    async def test_verify_activates_domain(
        self, client, auth_headers, test_tenant, test_user
    ):
        try:
            dom = _domain()
            await client.post(
                "/api/v1/domain/register",
                headers=auth_headers,
                json={"domain": dom, "domain_type": "CUSTOM"},
            )
            # test 모드: DNS/SSL stub → 즉시 ACTIVE
            resp = await client.post("/api/v1/domain/verify", headers=auth_headers)
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert data["status"] == "ACTIVE"
            assert data["ssl_expires_at"] is not None
            assert data["verified_at"] is not None

            # tenants.custom_domain 반영 확인
            async with _TestSession() as s:
                await s.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                cd = (
                    await s.execute(
                        text("SELECT custom_domain FROM tenants WHERE id = :t"),
                        {"t": test_tenant["id"]},
                    )
                ).scalar_one()
                assert cd == dom
        finally:
            await _cleanup(test_tenant["id"])

    async def test_duplicate_registration_conflict(
        self, client, auth_headers, test_tenant, test_user
    ):
        try:
            await client.post(
                "/api/v1/domain/register",
                headers=auth_headers,
                json={"domain": _domain()},
            )
            dup = await client.post(
                "/api/v1/domain/register",
                headers=auth_headers,
                json={"domain": _domain()},
            )
            assert dup.status_code == 409
        finally:
            await _cleanup(test_tenant["id"])

    async def test_remove_domain(self, client, auth_headers, test_tenant, test_user):
        try:
            await client.post(
                "/api/v1/domain/register",
                headers=auth_headers,
                json={"domain": _domain()},
            )
            resp = await client.delete("/api/v1/domain", headers=auth_headers)
            assert resp.status_code == 200
            st = await client.get("/api/v1/domain/status", headers=auth_headers)
            assert st.status_code == 404
        finally:
            await _cleanup(test_tenant["id"])

    async def test_requires_auth(self, client):
        resp = await client.get("/api/v1/domain/status")
        assert resp.status_code == 401


class TestSuperDomainApi:
    async def test_list_and_ssl_renew(
        self, client, auth_headers, super_headers, test_tenant, test_user
    ):
        try:
            dom = _domain()
            await client.post(
                "/api/v1/domain/register",
                headers=auth_headers,
                json={"domain": dom},
            )
            await client.post("/api/v1/domain/verify", headers=auth_headers)

            listed = await client.get("/api/super/v1/domains", headers=super_headers)
            assert listed.status_code == 200
            items = listed.json()["data"]["items"]
            target = next(i for i in items if i["domain"] == dom)

            renew = await client.post(
                f"/api/super/v1/domains/{target['id']}/ssl-renew",
                headers=super_headers,
            )
            assert renew.status_code == 200
            assert renew.json()["data"]["ssl_expires_at"] is not None
        finally:
            await _cleanup(test_tenant["id"])

    async def test_list_requires_super_admin(self, client, auth_headers):
        resp = await client.get("/api/super/v1/domains", headers=auth_headers)
        assert resp.status_code == 403


class TestDomainWorker:
    async def test_poll_activates_in_test_mode(
        self, client, auth_headers, test_tenant, test_user
    ):
        from app.workers import domain as worker

        try:
            reg = await client.post(
                "/api/v1/domain/register",
                headers=auth_headers,
                json={"domain": _domain()},
            )
            domain_id = reg.json()["data"]["id"]
            result = await worker._poll_domain_dns(domain_id)
            assert result["status"] == "ACTIVE"
        finally:
            await _cleanup(test_tenant["id"])

    def test_ssl_renew_beat_registered(self):
        from app.workers.celery_app import celery_app

        names = {v["task"] for v in celery_app.conf.beat_schedule.values()}
        assert "app.workers.domain.renew_expiring_ssl" in names


class _Delay:
    def __init__(self):
        self.calls = []

    def delay(self, *args):
        self.calls.append(args)


class TestDomainValidation:
    @pytest.mark.parametrize(
        "bad",
        [
            "localhost",
            "1.2.3.4",
            "http://a.com",
            "a.com/../../etc",
            "-bad.com",
            "a b.com",
            "a.com --deploy-hook=x",
            "app.localhost",
        ],
    )
    def test_rejects(self, bad):
        with pytest.raises(HTTPException) as err:
            svc._validated_domain(bad)
        assert err.value.status_code == 400

    @pytest.mark.parametrize(
        ("raw", "value"),
        [("WWW.My-Hospital.COM", "www.my-hospital.com"), ("oo.co.kr.", "oo.co.kr")],
    )
    def test_normalizes(self, raw, value):
        assert svc._validated_domain(raw) == value

    def test_rejects_service_domain(self, monkeypatch):
        monkeypatch.setattr(settings, "client_base_url", "https://www.cms.kr")
        for bad in ("cms.kr", "www.cms.kr", "evil.cms.kr"):
            with pytest.raises(HTTPException):
                svc._validated_domain(bad)
        assert svc._validated_domain("notcms.kr") == "notcms.kr"


class TestLiveCertificates:
    """운영 모드 — certbot 은 domain 큐에서만, 인자 · 권한은 그대로 검증"""

    @pytest.fixture
    def live(self, monkeypatch):
        monkeypatch.setattr(settings, "domain_mode", "live")
        monkeypatch.setattr(settings, "domain_cert_email", "ops@example.com")

    def test_issue_arguments(self, live, monkeypatch, tmp_path):
        monkeypatch.setattr(settings, "certbot_config_dir", str(tmp_path))
        _write_certificate(tmp_path, "www.oo.test")
        seen = {}

        def fake_run(args, **_):
            seen["args"] = args
            return SimpleNamespace(returncode=0, stderr="")

        monkeypatch.setattr(svc.subprocess, "run", fake_run)
        expires = svc.issue_ssl_certificate("www.oo.test")
        args = seen["args"]
        assert args[:2] == ["certbot", "certonly"]
        assert args[args.index("-d") + 1] == "www.oo.test"
        assert args[args.index("--cert-name") + 1] == "www.oo.test"
        assert args[args.index("--config-dir") + 1] == str(tmp_path)
        assert "--webroot" in args and "--agree-tos" in args
        hook = args[args.index("--deploy-hook") + 1]
        assert f"chgrp -R 101 {tmp_path}/live {tmp_path}/archive" in hook
        assert "chmod -R g+rX" in hook
        # 90일 고정값이 아니라 인증서의 실제 만료일
        assert expires.year == 2031

    def test_certbot_failure_raises(self, live, monkeypatch):
        monkeypatch.setattr(
            svc.subprocess,
            "run",
            lambda *a, **k: SimpleNamespace(returncode=1, stderr="challenge failed"),
        )
        with pytest.raises(svc.DomainError):
            svc.issue_ssl_certificate("www.oo.test")

    async def test_verify_queues_issue_instead_of_running(
        self, live, monkeypatch, client, auth_headers, test_tenant
    ):
        queued = _Delay()
        monkeypatch.setattr(worker, "issue_domain_certificate", queued)
        monkeypatch.setattr(worker, "poll_domain_dns", _Delay())
        monkeypatch.setattr(svc, "verify_dns", lambda *a: True)
        monkeypatch.setattr(
            svc.subprocess,
            "run",
            lambda *a, **k: pytest.fail("API 프로세스에서 certbot 을 실행하면 안 된다"),
        )
        try:
            await client.post(
                "/api/v1/domain/register",
                json={"domain": "www.oo.test"},
                headers=auth_headers,
            )
            res = await client.post("/api/v1/domain/verify", headers=auth_headers)
            assert res.json()["data"]["status"] == "SSL_ISSUING"
            assert len(queued.calls) == 1
            # 다시 눌러도 또 발급하지 않는다
            again = await client.post("/api/v1/domain/verify", headers=auth_headers)
            assert again.json()["data"]["status"] == "SSL_ISSUING"
            assert len(queued.calls) == 1
        finally:
            await _cleanup(test_tenant["id"])

    async def test_worker_activates_and_fails(
        self, live, monkeypatch, client, auth_headers, test_tenant
    ):
        monkeypatch.setattr(worker, "issue_domain_certificate", _Delay())
        monkeypatch.setattr(worker, "poll_domain_dns", _Delay())
        monkeypatch.setattr(svc, "verify_dns", lambda *a: True)
        try:
            await client.post(
                "/api/v1/domain/register",
                json={"domain": "www.oo.test"},
                headers=auth_headers,
            )
            await client.post("/api/v1/domain/verify", headers=auth_headers)
            domain_id = (
                await client.get("/api/v1/domain/status", headers=auth_headers)
            ).json()["data"]["id"]

            def boom(_):
                raise svc.DomainError("x")

            monkeypatch.setattr(svc, "issue_ssl_certificate", boom)
            result = await worker._issue_domain_certificate(domain_id)
            assert result["status"] == "FAILED"
            # 실패 뒤 다시 시도할 수 있다 — 끝난 건은 건너뛴다
            assert (await worker._issue_domain_certificate(domain_id))["status"] == (
                "SKIPPED"
            )
        finally:
            await _cleanup(test_tenant["id"])

    async def test_remove_queues_certificate_delete(
        self, live, monkeypatch, client, auth_headers, test_tenant
    ):
        removed = _Delay()
        monkeypatch.setattr(worker, "delete_domain_certificate", removed)
        monkeypatch.setattr(worker, "poll_domain_dns", _Delay())
        try:
            await client.post(
                "/api/v1/domain/register",
                json={"domain": "www.oo.test"},
                headers=auth_headers,
            )
            res = await client.delete("/api/v1/domain", headers=auth_headers)
            assert res.status_code == 200
            assert removed.calls == [("www.oo.test",)]
        finally:
            await _cleanup(test_tenant["id"])


class TestDnsCheck:
    @pytest.fixture(autouse=True)
    def live(self, monkeypatch):
        monkeypatch.setattr(settings, "domain_mode", "live")

    def _records(self, monkeypatch, records):
        def resolve(name, kind):
            answers = records.get((name, kind))
            if answers is None:
                raise dns.resolver.NoAnswer
            if kind == "CNAME":
                return [SimpleNamespace(target=a) for a in answers]
            return answers

        monkeypatch.setattr(dns.resolver, "resolve", resolve)

    def test_cname_match(self, monkeypatch):
        self._records(monkeypatch, {("www.a.test", "CNAME"): ["cms.kr."]})
        assert svc.verify_dns("www.a.test", "cms.kr") is True

    def test_apex_same_ip(self, monkeypatch):
        self._records(
            monkeypatch, {("a.test", "A"): ["1.1.1.1"], ("cms.kr", "A"): ["1.1.1.1"]}
        )
        assert svc.verify_dns("a.test", "cms.kr") is True

    def test_other_server(self, monkeypatch):
        self._records(
            monkeypatch, {("a.test", "A"): ["2.2.2.2"], ("cms.kr", "A"): ["1.1.1.1"]}
        )
        assert svc.verify_dns("a.test", "cms.kr") is False

    def test_no_records(self, monkeypatch):
        self._records(monkeypatch, {})
        assert svc.verify_dns("a.test", "cms.kr") is False


def test_certificate_tasks_use_domain_queue():
    from app.workers.celery_app import celery_app

    routes = celery_app.conf.task_routes
    for task in (
        "issue_domain_certificate",
        "renew_domain_certificate",
        "delete_domain_certificate",
        "renew_expiring_ssl",
    ):
        assert routes[f"app.workers.domain.{task}"] == {"queue": "domain"}
    # DNS 확인은 일반 워커 — 인증서 저장소가 필요 없다
    assert "app.workers.domain.poll_domain_dns" not in routes


def _write_certificate(base, domain: str) -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, domain)])
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime(2026, 1, 1, tzinfo=UTC))
        .not_valid_after(datetime(2031, 1, 1, tzinfo=UTC))
        .sign(key, hashes.SHA256())
    )
    folder = base / "live" / domain
    folder.mkdir(parents=True)
    (folder / "fullchain.pem").write_bytes(
        cert.public_bytes(serialization.Encoding.PEM)
    )
