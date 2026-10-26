"""T-107 방문자 회원 DB 스키마 테스트 (기획서 16.9).

- 마이그레이션 0019: downgrade → upgrade 왕복
- RLS: 네 테이블 모두 다른 테넌트 행 0건 (일반 권한 역할로 확인 — 슈퍼유저는 RLS 우회)
- 유니크: 테넌트별 이메일 · 소셜 계정, 탈퇴(soft delete) 후 재가입 허용
- 기본값 · inquiries.member_id ON DELETE SET NULL
- Pydantic 스키마 검증 (가입 · 휴대폰 인증 · 응답에 비밀 값 미포함)
"""

import hashlib
import subprocess
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models.site_member import SiteMember
from app.schemas.site_member import (
    PASSWORD_ERROR,
    MemberRegisterRequest,
    MemberResponse,
    PhoneSendRequest,
    PhoneVerifyRequest,
)
from tests.conftest import _TestSession  # type: ignore

BACKEND = Path(__file__).resolve().parents[1]
TABLES = (
    "site_members",
    "member_reservations",
    "phone_verifications",
    "member_password_reset_tokens",
)
PROBE_ROLE = "cms_rls_probe"


async def _admin_session():
    session = _TestSession()
    await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    return session


async def _insert_member(session, tenant_id: str, email: str, **cols) -> str:
    member_id = str(uuid.uuid4())
    values = {"id": member_id, "tid": tenant_id, "email": email, "name": "홍길동"}
    values.update(cols)
    names = ", ".join(k for k in values if k not in ("id", "tid"))
    params = ", ".join(f":{k}" for k in values if k not in ("id", "tid"))
    await session.execute(
        text(
            f"INSERT INTO site_members (id, tenant_id, {names})"  # noqa: S608
            f" VALUES (:id, :tid, {params})"
        ),
        values,
    )
    return member_id


async def _fill_tenant(session, tenant_id: str) -> None:
    """네 테이블에 한 행씩 넣는다."""
    member_id = await _insert_member(session, tenant_id, f"m-{tenant_id[:8]}@x.com")
    expires = datetime.now(UTC) + timedelta(minutes=3)
    await session.execute(
        text(
            "INSERT INTO member_reservations (tenant_id, member_id, reservation_type)"
            " VALUES (:t, :m, 'MEDICAL')"
        ),
        {"t": tenant_id, "m": member_id},
    )
    await session.execute(
        text(
            "INSERT INTO phone_verifications (tenant_id, phone, code, purpose,"
            " expires_at) VALUES (:t, '010-1234-5678', '123456', 'REGISTER', :e)"
        ),
        {"t": tenant_id, "e": expires},
    )
    await session.execute(
        text(
            "INSERT INTO member_password_reset_tokens (tenant_id, member_id,"
            " token_hash, expires_at) VALUES (:t, :m, :h, :e)"
        ),
        {
            "t": tenant_id,
            "m": member_id,
            "h": hashlib.sha256(uuid.uuid4().bytes).hexdigest(),
            "e": expires,
        },
    )


@pytest.fixture
async def tenants():
    """테넌트 2개 (삭제 시 FK CASCADE 로 회원 데이터도 함께 정리)."""
    ids = [str(uuid.uuid4()), str(uuid.uuid4())]
    session = await _admin_session()
    try:
        for tid in ids:
            await session.execute(
                text(
                    "INSERT INTO tenants (id, name, slug, plan_type, is_active,"
                    " created_at, updated_at) VALUES (:id, '회원 테스트', :slug,"
                    " 'FREE', true, now(), now())"
                ),
                {"id": tid, "slug": f"member-{tid[:8]}"},
            )
        await session.commit()
        yield ids
    finally:
        await session.close()
        cleanup = await _admin_session()
        await cleanup.execute(
            text("DELETE FROM inquiries WHERE tenant_id = ANY(:ids)"),
            {"ids": [uuid.UUID(i) for i in ids]},
        )
        await cleanup.execute(
            text("DELETE FROM tenants WHERE id = ANY(:ids)"),
            {"ids": [uuid.UUID(i) for i in ids]},
        )
        await cleanup.commit()
        await cleanup.close()


class TestMigration:
    def test_downgrade_and_upgrade_roundtrip(self):
        def alembic(*args: str) -> str:
            result = subprocess.run(
                [sys.executable, "-m", "alembic", *args],
                cwd=BACKEND,
                capture_output=True,
                text=True,
                check=True,
            )
            return result.stdout + result.stderr

        try:
            alembic("downgrade", "0018")
            assert "0018" in alembic("current")
        finally:
            alembic("upgrade", "head")
        assert "0019" in alembic("current")


class TestRowLevelSecurity:
    async def test_other_tenant_rows_are_hidden_in_all_tables(self, tenants):
        tenant_a, tenant_b = tenants
        session = await _admin_session()
        try:
            await _fill_tenant(session, tenant_a)
            await _fill_tenant(session, tenant_b)
            await session.commit()

            # 슈퍼유저는 RLS 를 우회하므로 일반 권한 역할로 바꿔 확인한다
            await session.execute(
                text(
                    f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE"
                    f" rolname = '{PROBE_ROLE}') THEN CREATE ROLE {PROBE_ROLE}"
                    f" NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$"
                )
            )
            for table in TABLES:
                await session.execute(text(f"GRANT SELECT ON {table} TO {PROBE_ROLE}"))
            await session.execute(text(f"SET LOCAL ROLE {PROBE_ROLE}"))
            await session.execute(
                text(
                    "SELECT set_config('app.current_tenant_id', :t, true),"
                    " set_config('app.is_super_admin', 'false', true)"
                ),
                {"t": tenant_a},
            )
            for table in TABLES:
                rows = (
                    await session.execute(
                        text(
                            f"SELECT tenant_id::text FROM {table}"  # noqa: S608
                            " WHERE tenant_id = ANY(:ids)"
                        ),
                        {"ids": [uuid.UUID(t) for t in tenants]},
                    )
                ).scalars()
                assert list(rows) == [tenant_a], table
        finally:
            await session.rollback()
            await session.close()

    async def test_policies_are_forced(self):
        session = await _admin_session()
        try:
            rows = (
                await session.execute(
                    text(
                        "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,"
                        " count(p.polname) FROM pg_class c LEFT JOIN pg_policy p"
                        " ON p.polrelid = c.oid WHERE c.relname = ANY(:t)"
                        " GROUP BY 1, 2, 3"
                    ),
                    {"t": list(TABLES)},
                )
            ).all()
        finally:
            await session.close()
        assert {r[0] for r in rows} == set(TABLES)
        assert all(r[1] and r[2] and r[3] == 1 for r in rows), rows


class TestConstraints:
    async def test_email_unique_per_tenant_and_rejoin_after_withdraw(self, tenants):
        tenant_a, tenant_b = tenants
        session = await _admin_session()
        try:
            first = await _insert_member(session, tenant_a, "same@x.com")
            # 다른 테넌트는 같은 이메일 가능
            await _insert_member(session, tenant_b, "same@x.com")
            await session.commit()

            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            with pytest.raises(IntegrityError):
                await _insert_member(session, tenant_a, "same@x.com")
            await session.rollback()

            # 탈퇴(soft delete) 후 같은 이메일로 재가입 가능 (오픈 이슈 #22)
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text("UPDATE site_members SET deleted_at = now() WHERE id = :id"),
                {"id": first},
            )
            await _insert_member(session, tenant_a, "same@x.com")
            await session.commit()
        finally:
            await session.close()

    async def test_social_account_unique_per_tenant(self, tenants):
        tenant_a, _ = tenants
        social = {"social_provider": "KAKAO", "social_id": "kakao-1"}
        session = await _admin_session()
        try:
            await _insert_member(session, tenant_a, "a@x.com", **social)
            await session.commit()
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            with pytest.raises(IntegrityError):
                await _insert_member(session, tenant_a, "b@x.com", **social)
            await session.rollback()
        finally:
            await session.close()

    async def test_defaults_and_inquiry_member_set_null(self, tenants):
        tenant_a, _ = tenants
        session = await _admin_session()
        try:
            member_id = await _insert_member(session, tenant_a, "d@x.com")
            await session.execute(
                text(
                    "INSERT INTO member_reservations (tenant_id, member_id,"
                    " reservation_type) VALUES (:t, :m, 'LODGING')"
                ),
                {"t": tenant_a, "m": member_id},
            )
            inquiry_id = uuid.uuid4()
            await session.execute(
                text(
                    "INSERT INTO inquiries (id, tenant_id, name, phone, message,"
                    " inquiry_type, status, is_read, is_notified, member_id,"
                    " created_at, updated_at) VALUES (:id, :t, '홍길동',"
                    " '010-1234-5678', '회원 문의입니다.', 'GENERAL', 'PENDING',"
                    " false, false, :m, now(), now())"
                ),
                {"id": inquiry_id, "t": tenant_a, "m": member_id},
            )
            member = (
                await session.execute(
                    text(
                        "SELECT is_active, marketing_agree, sms_agree, email_agree,"
                        " notify_reservation_confirmed, notify_reservation_cancelled,"
                        " failed_login_count FROM site_members WHERE id = :id"
                    ),
                    {"id": member_id},
                )
            ).one()
            assert tuple(member) == (True, False, True, False, True, True, 0)
            reservation = (
                await session.execute(
                    text(
                        "SELECT status, detail FROM member_reservations"
                        " WHERE member_id = :m"
                    ),
                    {"m": member_id},
                )
            ).one()
            assert (reservation.status, reservation.detail) == ("PENDING", {})

            await session.execute(
                text("DELETE FROM member_reservations WHERE member_id = :m"),
                {"m": member_id},
            )
            await session.execute(
                text("DELETE FROM site_members WHERE id = :m"), {"m": member_id}
            )
            linked = (
                await session.execute(
                    text("SELECT member_id FROM inquiries WHERE id = :id"),
                    {"id": inquiry_id},
                )
            ).scalar_one()
            assert linked is None
            await session.commit()
        finally:
            await session.close()


def _register(**overrides) -> dict:
    body = {
        "name": "홍길동",
        "email": "hong@email.com",
        "password": "abcd1234",
        "password_confirm": "abcd1234",
        "phone": "010-1234-5678",
        "phone_verification_id": str(uuid.uuid4()),
        "terms_agree": True,
        "privacy_agree": True,
    }
    body.update(overrides)
    return body


class TestSchemas:
    def test_register_valid(self):
        req = MemberRegisterRequest(**_register(name=" 홍길동 "))
        assert req.name == "홍길동" and req.marketing_agree is False

    @pytest.mark.parametrize(
        "overrides",
        [
            {"password": "abcdefgh", "password_confirm": "abcdefgh"},  # 숫자 없음
            {"password": "abc1234", "password_confirm": "abc1234"},  # 8자 미만
            {"password_confirm": "different1"},
            {"name": "홍"},
            {"name": "홍길동!"},
            {"phone": "02-123-4567"},
            {"email": "not-an-email"},
            {"terms_agree": False},
            {"privacy_agree": False},
        ],
    )
    def test_register_invalid(self, overrides):
        with pytest.raises(ValidationError):
            MemberRegisterRequest(**_register(**overrides))

    def test_password_error_message(self):
        with pytest.raises(ValidationError) as exc:
            MemberRegisterRequest(**_register(password="short", password_confirm="x"))
        assert PASSWORD_ERROR in str(exc.value)

    def test_phone_verification_enums(self):
        assert PhoneSendRequest(phone="010-1234-5678", purpose="RESET_PW")
        with pytest.raises(ValidationError):
            PhoneSendRequest(phone="010-1234-5678", purpose="LOGIN")
        with pytest.raises(ValidationError):
            PhoneVerifyRequest(verification_id=uuid.uuid4(), code="12a456")

    def test_member_response_hides_secrets(self):
        member = SiteMember(
            id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            email="hong@email.com",
            name="홍길동",
            password_hash="$2b$12$secret",
            social_provider="KAKAO",
            social_id="kakao-secret-id",
            marketing_agree=False,
            sms_agree=True,
            email_agree=False,
            notify_reservation_confirmed=True,
            notify_reservation_cancelled=True,
            failed_login_count=3,
            created_at=datetime.now(UTC),
        )
        dumped = MemberResponse.model_validate(member).model_dump()
        assert dumped["has_password"] is True
        assert dumped["social_provider"] == "KAKAO"
        for secret in ("password_hash", "social_id", "failed_login_count"):
            assert secret not in dumped
        assert "kakao-secret-id" not in str(dumped)
