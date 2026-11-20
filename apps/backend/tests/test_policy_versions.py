"""약관 · 정책 버전 · 예약 · 동의 기록 (T-224, 사이트 관리 기획서 SM-03)."""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import text

from app.workers import scheduled as worker
from tests.conftest import _TestSession  # type: ignore

URL = "/api/v1/site-settings/policies"


def _public(slug: str, kind: str, version: int | None = None) -> str:
    base = f"/api/public/site/{slug}/policies/{kind}"
    return f"{base}/versions/{version}" if version else base


async def _rows(sql: str, **params) -> list:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        return list((await s.execute(text(sql), params)).mappings())


async def _sql(sql: str, **params) -> None:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await s.execute(text(sql), params)
        await s.commit()


async def _draft(client, headers, kind="terms", body="본문", summary="요약") -> dict:
    created = await client.post(f"{URL}/{kind}/draft", headers=headers)
    assert created.status_code == 200, created.text
    resp = await client.put(
        f"{URL}/{kind}/draft",
        json={"body": body, "summary": summary},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


async def _publish(client, headers, kind="terms", effective_at=None) -> dict:
    payload = {"effective_at": effective_at.isoformat()} if effective_at else {}
    resp = await client.post(f"{URL}/{kind}/publish", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


class TestVersionFlow:
    async def test_first_draft_starts_from_default_text(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(f"{URL}/privacy/draft", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        doc = resp.json()["data"]
        working = doc["working"]
        assert working["version"] == 1 and working["status"] == "draft"
        # 기본 문안을 복사해 시작 — 홈페이지는 아직 기본 문안
        assert working["body"] == doc["default_body"]
        assert doc["is_default"] is True

    async def test_publish_archive_and_history(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        slug = test_tenant["slug"]
        await _draft(client, auth_headers, body="첫 약관", summary="처음 만듦")
        first = await _publish(client, auth_headers)
        assert first["version"] == 1 and first["working"] is None
        # 공개본은 직접 고치지 않는다 — 새 버전이 공개본을 복사해 시작
        created = await client.post(f"{URL}/terms/draft", headers=auth_headers)
        assert created.json()["data"]["working"]["body"] == "첫 약관"
        await client.put(
            f"{URL}/terms/draft",
            json={"body": "둘째 약관", "summary": "환불 조항 추가"},
            headers=auth_headers,
        )
        # 공개 전에는 홈페이지가 그대로
        assert (await client.get(_public(slug, "terms"))).json()["data"][
            "body"
        ] == "첫 약관"
        second = await _publish(client, auth_headers)
        statuses = {v["version"]: v["status"] for v in second["versions"]}
        assert statuses == {2: "published", 1: "archived"}
        assert second["versions"][0]["summary"] == "환불 조항 추가"

        public = (await client.get(_public(slug, "terms"))).json()["data"]
        assert public["body"] == "둘째 약관" and public["version"] == 2
        assert [h["version"] for h in public["history"]] == [1]
        old = await client.get(_public(slug, "terms", 1))
        assert old.status_code == 200
        assert old.json()["data"]["body"] == "첫 약관"
        assert old.json()["data"]["status"] == "archived"

    async def test_only_one_working_version(
        self, client: AsyncClient, auth_headers: dict
    ):
        await client.post(f"{URL}/terms/draft", headers=auth_headers)
        again = await client.post(f"{URL}/terms/draft", headers=auth_headers)
        assert again.status_code == 409
        assert again.json()["error"]["code"] == "CONFLICT"

    async def test_publish_needs_summary(self, client: AsyncClient, auth_headers: dict):
        await _draft(client, auth_headers, summary="  ")
        resp = await client.post(f"{URL}/terms/publish", json={}, headers=auth_headers)
        assert resp.status_code == 400
        assert "요약" in resp.json()["error"]["message"]

    async def test_no_working_version(self, client: AsyncClient, auth_headers: dict):
        resp = await client.put(
            f"{URL}/terms/draft", json={"body": "x"}, headers=auth_headers
        )
        assert resp.status_code == 404
        resp = await client.post(f"{URL}/terms/publish", json={}, headers=auth_headers)
        assert resp.status_code == 404

    async def test_draft_validation(self, client: AsyncClient, auth_headers: dict):
        await client.post(f"{URL}/terms/draft", headers=auth_headers)
        for body in ({"body": "   "}, {"body": "x", "summary": "가" * 501}):
            resp = await client.put(
                f"{URL}/terms/draft", json=body, headers=auth_headers
            )
            assert resp.status_code == 400, body
            assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    async def test_drafts_are_not_public(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _draft(client, auth_headers, body="초안 본문")
        resp = await client.get(_public(test_tenant["slug"], "terms", 1))
        assert resp.status_code == 404
        # 관리자는 이력에서 볼 수 있다
        admin = await client.get(f"{URL}/terms/versions/1", headers=auth_headers)
        assert admin.json()["data"]["body"] == "초안 본문"


class TestSchedule:
    async def test_schedule_cancel_and_edit(
        self, client: AsyncClient, auth_headers: dict
    ):
        await _draft(client, auth_headers)
        later = datetime.now(UTC) + timedelta(days=7)
        doc = await _publish(client, auth_headers, effective_at=later)
        assert doc["working"]["status"] == "scheduled"
        assert doc["is_default"] is True  # 아직 시행 전
        # 예약된 버전은 고칠 수 없다 — 취소하면 초안으로
        locked = await client.put(
            f"{URL}/terms/draft", json={"body": "x"}, headers=auth_headers
        )
        assert locked.status_code == 409
        cancel = await client.post(f"{URL}/terms/cancel-schedule", headers=auth_headers)
        working = cancel.json()["data"]["working"]
        assert working["status"] == "draft" and working["effective_at"] is None

    async def test_schedule_limits(self, client: AsyncClient, auth_headers: dict):
        await _draft(client, auth_headers)
        far = datetime.now(UTC) + timedelta(days=400)
        resp = await client.post(
            f"{URL}/terms/publish",
            json={"effective_at": far.isoformat()},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        naive = await client.post(
            f"{URL}/terms/publish",
            json={"effective_at": "2030-01-01T00:00:00"},
            headers=auth_headers,
        )
        assert naive.status_code == 400

    async def test_past_date_publishes_now(
        self, client: AsyncClient, auth_headers: dict
    ):
        await _draft(client, auth_headers)
        doc = await _publish(
            client, auth_headers, effective_at=datetime.now(UTC) - timedelta(days=1)
        )
        assert doc["version"] == 1 and doc["working"] is None

    async def test_worker_releases_due_versions_once(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await _draft(client, auth_headers, body="첫 약관")
        await _publish(client, auth_headers)
        await _draft(client, auth_headers, body="예약 약관", summary="시행일 예약")
        await _publish(
            client, auth_headers, effective_at=datetime.now(UTC) + timedelta(hours=1)
        )
        # 아직이면 그대로
        await worker._release_due_policies()
        public = (await client.get(_public(test_tenant["slug"], "terms"))).json()
        assert public["data"]["body"] == "첫 약관"
        # 시행일이 지나면 공개 · 이전 버전 보관, 두 번 돌아도 같은 결과
        await _sql(
            "UPDATE policy_versions SET effective_at = now() - interval '1 minute'"
            " WHERE tenant_id = :t AND status = 'scheduled'",
            t=test_tenant["id"],
        )
        await worker._release_due_policies()
        await worker._release_due_policies()
        rows = await _rows(
            "SELECT version, status FROM policy_versions"
            " WHERE tenant_id = :t AND kind = 'terms' ORDER BY version",
            t=test_tenant["id"],
        )
        assert [(r["version"], r["status"]) for r in rows] == [
            (1, "archived"),
            (2, "published"),
        ]
        public = (await client.get(_public(test_tenant["slug"], "terms"))).json()
        assert public["data"]["body"] == "예약 약관"


class TestConsents:
    async def test_records_current_published_version(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        from app.services import site_policy

        await _draft(client, auth_headers, kind="privacy", body="방침 v1")
        await _publish(client, auth_headers, kind="privacy")
        async with _TestSession() as s:
            await s.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await site_policy.record_consents(
                s,
                test_tenant["id"],
                ("terms", "privacy"),
                subject_type="member",
                subject_id=None,
                source="member_join",
            )
            await s.commit()
        rows = await _rows(
            "SELECT kind, version, policy_version_id, agreed, source"
            " FROM consent_records WHERE tenant_id = :t ORDER BY kind",
            t=test_tenant["id"],
        )
        # 공개본이 있는 방침은 그 버전, 기본 문안인 약관은 버전 없음
        assert [(r["kind"], r["version"]) for r in rows] == [
            ("privacy", 1),
            ("terms", None),
        ]
        assert rows[0]["policy_version_id"] is not None
        assert all(r["agreed"] and r["source"] == "member_join" for r in rows)

    async def test_new_version_keeps_old_records(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        from app.services import site_policy

        async def consent() -> None:
            async with _TestSession() as s:
                await s.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await site_policy.record_consents(
                    s,
                    test_tenant["id"],
                    ("privacy",),
                    subject_type="inquiry",
                    subject_id=None,
                    source="inquiry",
                )
                await s.commit()

        await _draft(client, auth_headers, kind="privacy", body="v1")
        await _publish(client, auth_headers, kind="privacy")
        await consent()
        await _draft(client, auth_headers, kind="privacy", body="v2")
        await _publish(client, auth_headers, kind="privacy")
        await consent()
        rows = await _rows(
            "SELECT version FROM consent_records WHERE tenant_id = :t"
            " ORDER BY created_at",
            t=test_tenant["id"],
        )
        assert [r["version"] for r in rows] == [1, 2]

    async def test_inquiry_with_agree_records_consent(
        self, client: AsyncClient, test_tenant: dict
    ):
        resp = await client.post(
            "/api/public/inquiries",
            params={"tenant_slug": test_tenant["slug"]},
            json={
                "name": "홍길동",
                "phone": "010-1234-5678",
                "message": "예약 문의드립니다. 가능한 시간이 있나요?",
                "terms_agree": True,
                "privacy_agree": True,
            },
        )
        assert resp.status_code == 200, resp.text
        inquiry_id = resp.json()["data"]["inquiry_id"]
        rows = await _rows(
            "SELECT kind, subject_type, subject_id::text AS sid, source"
            " FROM consent_records WHERE tenant_id = :t ORDER BY kind",
            t=test_tenant["id"],
        )
        assert [(r["kind"], r["subject_type"], r["sid"]) for r in rows] == [
            ("privacy", "inquiry", inquiry_id),
            ("terms", "inquiry", inquiry_id),
        ]

    async def test_inquiry_without_checkbox_records_nothing(
        self, client: AsyncClient, test_tenant: dict
    ):
        resp = await client.post(
            "/api/public/inquiries",
            params={"tenant_slug": test_tenant["slug"]},
            json={
                "name": "홍길동",
                "phone": "010-1234-5678",
                "message": "체크박스가 없는 문의 화면에서 보낸 글",
            },
        )
        assert resp.status_code == 200, resp.text
        rows = await _rows(
            "SELECT id FROM consent_records WHERE tenant_id = :t",
            t=test_tenant["id"],
        )
        assert rows == []
