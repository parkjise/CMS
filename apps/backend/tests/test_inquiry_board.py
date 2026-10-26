"""T-123 온라인 상담 게시판 · 예약 필드 · 관리자 답변 테스트.

- 공개 목록: 이름 가림, 번호(최신이 큰 번호), 검색, 스팸 제외, 연락처 비노출
- 비밀글: 상세는 잠김 → 비밀번호 맞으면 내용·답변, 틀리면 403
- 글쓰기: 비밀번호는 해시로 저장, 관리자 문의 목록에 함께 보임
- 관리자 답변: answered_at 설정 + 상태 완료 + 게시판 상세에 노출
- 예약: reserved_date · reserved_time 저장 / 잘못된 시간 422
- 테넌트 격리
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from tests.conftest import _TestSession  # type: ignore

BOARD = "/api/public/inquiries/board"


def _post(**overrides) -> dict:
    body = {
        "name": "홍길동",
        "password": "1234",
        "phone": "010-1234-5678",
        "subject": "첫 상담 예약 시 준비할 서류 문의",
        "message": "다음 주에 처음 방문하려고 합니다. 준비할 서류가 있을까요?",
        "is_secret": True,
    }
    body.update(overrides)
    return body


async def _create(client: AsyncClient, slug: str, **overrides) -> str:
    resp = await client.post(
        BOARD, params={"tenant_slug": slug}, json=_post(**overrides)
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["post_id"]


@pytest.fixture
async def board(test_tenant: dict):
    yield test_tenant
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("DELETE FROM inquiries WHERE tenant_id = :t"), {"t": test_tenant["id"]}
        )
        await session.commit()


class TestBoardList:
    async def test_masks_names_numbers_and_hides_contact(
        self, client: AsyncClient, board: dict
    ):
        await _create(client, board["slug"], name="김철수", subject="첫 글")
        await _create(
            client, board["slug"], name="이영", subject="둘째 글", is_secret=False
        )
        resp = await client.get(BOARD, params={"tenant_slug": board["slug"]})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] == 2
        first, second = data["items"]
        assert (first["subject"], first["author"], first["no"]) == ("둘째 글", "이*", 2)
        assert (second["subject"], second["author"], second["no"]) == (
            "첫 글",
            "김**",
            1,
        )
        assert second["is_secret"] is True and second["answered"] is False
        raw = resp.text
        assert "010-1234-5678" not in raw and "password" not in raw

    async def test_search_and_paging(self, client: AsyncClient, board: dict):
        for i in range(3):
            await _create(client, board["slug"], subject=f"예약 변경 {i}")
        await _create(client, board["slug"], subject="주차 문의")
        found = await client.get(
            BOARD, params={"tenant_slug": board["slug"], "q": "예약"}
        )
        assert found.json()["data"]["total"] == 3
        paged = await client.get(
            BOARD, params={"tenant_slug": board["slug"], "size": 2, "page": 2}
        )
        data = paged.json()["data"]
        assert data["total"] == 4 and len(data["items"]) == 2
        assert [i["no"] for i in data["items"]] == [2, 1]

    async def test_spam_is_hidden(
        self, client: AsyncClient, board: dict, auth_headers: dict
    ):
        post_id = await _create(client, board["slug"])
        await client.patch(
            f"/api/v1/inquiries/{post_id}",
            json={"status": "SPAM"},
            headers=auth_headers,
        )
        resp = await client.get(BOARD, params={"tenant_slug": board["slug"]})
        assert resp.json()["data"]["total"] == 0
        detail = await client.get(
            f"{BOARD}/{post_id}", params={"tenant_slug": board["slug"]}
        )
        assert detail.status_code == 404

    async def test_unknown_tenant_404(self, client: AsyncClient):
        resp = await client.get(BOARD, params={"tenant_slug": "no-such-tenant"})
        assert resp.status_code == 404


class TestSecretPost:
    async def test_secret_detail_locked_until_password(
        self, client: AsyncClient, board: dict
    ):
        post_id = await _create(client, board["slug"])
        locked = await client.get(
            f"{BOARD}/{post_id}", params={"tenant_slug": board["slug"]}
        )
        data = locked.json()["data"]
        assert data["locked"] is True and data["message"] is None
        assert data["subject"] == "첫 상담 예약 시 준비할 서류 문의"

        wrong = await client.post(
            f"{BOARD}/{post_id}/unlock",
            params={"tenant_slug": board["slug"]},
            json={"password": "9999"},
        )
        assert wrong.status_code == 403

        right = await client.post(
            f"{BOARD}/{post_id}/unlock",
            params={"tenant_slug": board["slug"]},
            json={"password": "1234"},
        )
        assert right.status_code == 200
        assert right.json()["data"]["locked"] is False
        assert "준비할 서류" in right.json()["data"]["message"]

    async def test_public_post_is_readable_and_has_neighbors(
        self, client: AsyncClient, board: dict
    ):
        older = await _create(client, board["slug"], is_secret=False, subject="이전 글")
        newer = await _create(client, board["slug"], is_secret=False, subject="다음 글")
        resp = await client.get(
            f"{BOARD}/{older}", params={"tenant_slug": board["slug"]}
        )
        data = resp.json()["data"]
        assert data["locked"] is False and data["message"]
        assert data["next_id"] == newer and data["prev_id"] is None

    async def test_password_is_hashed(self, client: AsyncClient, board: dict):
        post_id = await _create(client, board["slug"])
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            stored = (
                await session.execute(
                    text(
                        "SELECT password_hash, is_board FROM inquiries WHERE id = :id"
                    ),
                    {"id": post_id},
                )
            ).one()
        assert stored.password_hash and stored.password_hash != "1234"
        assert stored.is_board is True

    async def test_validation(self, client: AsyncClient, board: dict):
        resp = await client.post(
            BOARD,
            params={"tenant_slug": board["slug"]},
            json=_post(password="12", subject=""),
        )
        assert resp.status_code in (400, 422)


class TestAdminAnswer:
    async def test_answer_shows_on_board_and_admin(
        self, client: AsyncClient, board: dict, auth_headers: dict
    ):
        post_id = await _create(client, board["slug"], is_secret=False)
        admin_list = await client.get("/api/v1/inquiries", headers=auth_headers)
        item = next(i for i in admin_list.json()["data"]["items"] if i["id"] == post_id)
        assert item["is_board"] is True and item["subject"]

        resp = await client.patch(
            f"/api/v1/inquiries/{post_id}",
            json={"answer": "신분증을 챙겨 오세요."},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["answer"] == "신분증을 챙겨 오세요."
        assert data["answered_at"] and data["status"] == "DONE"

        public = await client.get(
            f"{BOARD}/{post_id}", params={"tenant_slug": board["slug"]}
        )
        assert public.json()["data"]["answer"] == "신분증을 챙겨 오세요."
        listing = await client.get(BOARD, params={"tenant_slug": board["slug"]})
        assert listing.json()["data"]["items"][0]["answered"] is True

        cleared = await client.patch(
            f"/api/v1/inquiries/{post_id}", json={"answer": ""}, headers=auth_headers
        )
        assert cleared.json()["data"]["answer"] is None
        assert cleared.json()["data"]["answered_at"] is None


class TestReservation:
    async def test_reservation_fields_saved(
        self, client: AsyncClient, board: dict, auth_headers: dict
    ):
        resp = await client.post(
            "/api/public/inquiries",
            params={"tenant_slug": board["slug"]},
            json={
                "inquiry_type": "RESERVATION",
                "name": "홍길동",
                "phone": "010-1234-5678",
                "subject": "첫 방문 상담",
                "message": "11월 5일 오전 상담 받고 싶습니다.",
                "reserved_date": "2026-11-05",
                "reserved_time": "10:00",
            },
        )
        assert resp.status_code == 200, resp.text
        inquiry_id = resp.json()["data"]["inquiry_id"]
        detail = await client.get(
            f"/api/v1/inquiries/{inquiry_id}", headers=auth_headers
        )
        data = detail.json()["data"]
        assert (data["reserved_date"], data["reserved_time"]) == ("2026-11-05", "10:00")
        assert data["is_board"] is False
        # 예약은 공개 게시판에 나오지 않는다
        listing = await client.get(BOARD, params={"tenant_slug": board["slug"]})
        assert listing.json()["data"]["total"] == 0

    async def test_invalid_time_rejected(self, client: AsyncClient, board: dict):
        resp = await client.post(
            "/api/public/inquiries",
            params={"tenant_slug": board["slug"]},
            json={
                "inquiry_type": "RESERVATION",
                "name": "홍길동",
                "phone": "010-1234-5678",
                "message": "예약 시간 형식이 틀린 경우입니다.",
                "reserved_time": "25:99",
            },
        )
        assert resp.status_code in (400, 422)


class TestIsolation:
    async def test_other_tenant_cannot_see_post(self, client: AsyncClient, board: dict):
        post_id = await _create(client, board["slug"], is_secret=False)
        other_id = uuid.uuid4()
        other_slug = f"other-{other_id.hex[:8]}"
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text(
                    "INSERT INTO tenants (id, name, slug, plan_type, is_active,"
                    " created_at, updated_at) VALUES (:id, '다른', :slug, 'FREE', true,"
                    " now(), now())"
                ),
                {"id": str(other_id), "slug": other_slug},
            )
            await session.commit()
        try:
            listing = await client.get(BOARD, params={"tenant_slug": other_slug})
            assert listing.json()["data"]["total"] == 0
            detail = await client.get(
                f"{BOARD}/{post_id}", params={"tenant_slug": other_slug}
            )
            assert detail.status_code == 404
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("DELETE FROM tenants WHERE id = :id"), {"id": str(other_id)}
                )
                await session.commit()
