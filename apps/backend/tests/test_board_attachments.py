"""게시글 파일 첨부 (T-194, 게시판 모듈 기획서 BM-06)."""

import uuid
from collections.abc import AsyncIterator
from urllib.parse import quote

import pytest
from fastapi import HTTPException
from sqlalchemy import text

from app.core.config import settings
from app.services import board_attachment as attachment_service
from app.services import feature as feature_service
from app.services import image as image_service
from app.services import site_cache
from app.workers import image as image_worker
from tests.conftest import _TestSession  # type: ignore

BOARDS = "/api/v1/boards"
PDF = b"%PDF-1.7\n" + b"0" * 200
HWP = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"0" * 200


async def _sql(sql: str, **params) -> list:
    async with _TestSession() as s:
        await s.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await s.execute(text(sql), params)
        rows = result.all() if result.returns_rows else []
        await s.commit()
        return rows


@pytest.fixture(autouse=True)
def storage(monkeypatch) -> dict:
    """저장소 대신 — 올린 키 · Content-Disposition 을 기록한다."""
    stored: dict = {}

    def fake_upload(data, key, content_type, content_disposition=None):
        stored[key] = {"type": content_type, "disposition": content_disposition}
        return f"{settings.cdn_base_url.rstrip('/')}/{key}"

    async def fake_purge(_db, _tenant_id):
        return True

    monkeypatch.setattr(image_service, "upload_to_storage", fake_upload)
    monkeypatch.setattr(site_cache, "purge_site", fake_purge)
    return stored


@pytest.fixture
async def tenant(test_tenant, test_user) -> AsyncIterator[dict]:
    await feature_service.invalidate_cache(test_tenant["id"])
    await _sql(
        "UPDATE tenants SET plan_type = 'STANDARD' WHERE id = :t", t=test_tenant["id"]
    )
    yield test_tenant
    await _sql("DELETE FROM uploaded_files WHERE tenant_id = :t", t=test_tenant["id"])
    await feature_service.invalidate_cache(test_tenant["id"])


@pytest.fixture
async def board(client, auth_headers, tenant) -> dict:
    resp = await client.post(
        BOARDS, json={"name": "소식", "slug": "news"}, headers=auth_headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _upload(client, headers, board, name="진료 안내.pdf", data=PDF):
    return await client.post(
        f"{BOARDS}/{board['id']}/attachments",
        files={"file": (name, data, "application/octet-stream")},
        headers=headers,
    )


async def _uploaded(client, headers, board, name="진료 안내.pdf", data=PDF) -> dict:
    resp = await _upload(client, headers, board, name, data)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _post(client, headers, board, **fields):
    return await client.post(
        f"{BOARDS}/{board['id']}/posts",
        json={"title": "공지", "body": [], "status": "PUBLISHED", **fields},
        headers=headers,
    )


class TestUpload:
    async def test_keeps_original_name_for_download(
        self, client, auth_headers, tenant, board, storage
    ):
        item = await _uploaded(client, auth_headers, board)

        assert item["name"] == "진료 안내.pdf"
        assert item["size"] == len(PDF)
        assert item["content_type"] == "application/pdf"
        assert f"/{tenant['id']}/attachments/" in item["url"]
        (stored,) = storage.values()
        assert stored["disposition"].startswith('attachment; filename="')
        assert f"filename*=UTF-8''{quote('진료 안내.pdf')}" in stored["disposition"]
        # 요금제 저장 용량에 함께 센다
        used = await _sql(
            "SELECT sum(file_size) FROM uploaded_files WHERE tenant_id = :t",
            t=tenant["id"],
        )
        assert used[0][0] == len(PDF)

    @pytest.mark.parametrize(
        ("name", "data", "code", "message"),
        [
            ("setup.exe", b"MZ" + b"0" * 100, 400, "올릴 수 있습니다"),
            ("가짜.pdf", b"MZ" + b"0" * 100, 400, "확장자와 맞지 않습니다"),
            ("빈.pdf", b"", 400, "빈 파일"),
        ],
    )
    async def test_rejects_bad_files(
        self, client, auth_headers, board, name, data, code, message
    ):
        resp = await _upload(client, auth_headers, board, name, data)
        assert resp.status_code == code
        assert message in resp.json()["error"]["message"]

    async def test_too_large(self, client, auth_headers, board, monkeypatch):
        monkeypatch.setattr(attachment_service, "MAX_ATTACHMENT_SIZE", 100)
        resp = await _upload(client, auth_headers, board)
        assert resp.status_code == 413

    async def test_path_and_control_chars_removed(self):
        assert attachment_service.clean_name("../../etc/공지\n.hwp") == "공지.hwp"
        assert attachment_service.clean_name(None) == "file"


class TestPostAttachments:
    async def test_attach_reorder_and_remove(self, client, auth_headers, tenant, board):
        first = await _uploaded(client, auth_headers, board)
        second = await _uploaded(client, auth_headers, board, "서식.hwp", HWP)

        created = await _post(
            client, auth_headers, board, attachment_ids=[first["id"], second["id"]]
        )
        assert created.status_code == 201, created.text
        post = created.json()["data"]
        assert [a["name"] for a in post["attachments"]] == ["진료 안내.pdf", "서식.hwp"]

        url = f"{BOARDS}/{board['id']}/posts/{post['id']}"
        # 다른 칸만 고치면 첨부는 그대로
        kept = await client.patch(url, json={"title": "새 제목"}, headers=auth_headers)
        assert len(kept.json()["data"]["attachments"]) == 2

        swapped = await client.patch(
            url, json={"attachment_ids": [second["id"]]}, headers=auth_headers
        )
        assert [a["name"] for a in swapped.json()["data"]["attachments"]] == [
            "서식.hwp"
        ]
        removed = await _sql(
            "SELECT count(*) FROM board_post_attachments"
            " WHERE post_id = :p AND deleted_at IS NOT NULL",
            p=post["id"],
        )
        assert removed[0][0] == 1

        cleared = await client.patch(
            url, json={"attachment_ids": []}, headers=auth_headers
        )
        assert cleared.json()["data"]["attachments"] == []

    async def test_public_detail_lists_files(self, client, auth_headers, tenant, board):
        item = await _uploaded(client, auth_headers, board)
        post = (
            await _post(client, auth_headers, board, attachment_ids=[item["id"]])
        ).json()["data"]

        resp = await client.get(
            f"/api/public/site/{tenant['slug']}/boards/news/posts/{post['id']}"
        )
        assert resp.status_code == 200, resp.text
        (public,) = resp.json()["data"]["attachments"]
        assert public["name"] == "진료 안내.pdf"
        assert public["url"] == item["url"]

    async def test_limit_and_unknown_files(self, client, auth_headers, board):
        ids = [(await _uploaded(client, auth_headers, board))["id"] for _ in range(6)]
        too_many = await _post(client, auth_headers, board, attachment_ids=ids)
        assert too_many.status_code == 400
        assert "5개" in too_many.json()["error"]["message"]

        unknown = await _post(
            client, auth_headers, board, attachment_ids=[str(uuid.uuid4())]
        )
        assert unknown.status_code == 400

    async def test_image_upload_is_not_an_attachment(
        self, client, auth_headers, tenant, board
    ):
        """본문 사진(uploaded_files 지만 attachments 폴더가 아님)은 붙일 수 없다."""
        image_id = uuid.uuid4()
        await _sql(
            "INSERT INTO uploaded_files (id, tenant_id, file_name, file_url, file_size,"
            " mime_type, created_at, updated_at) VALUES (:id, :t, 'a.webp',"
            " :url, 10, 'image/webp', now(), now())",
            id=str(image_id),
            t=tenant["id"],
            url=f"http://cdn/{tenant['id']}/board/{image_id}.webp",
        )
        resp = await _post(client, auth_headers, board, attachment_ids=[str(image_id)])
        assert resp.status_code == 400

    async def test_not_on_secret_or_member_only(self):
        with pytest.raises(HTTPException):
            attachment_service.ensure_public_allowed(False, True, True)
        with pytest.raises(HTTPException):
            attachment_service.ensure_public_allowed(True, False, True)
        attachment_service.ensure_public_allowed(True, True, False)
        attachment_service.ensure_public_allowed(False, False, True)

    async def test_cleanup_keeps_attached_and_drops_removed(
        self, client, auth_headers, tenant, board, monkeypatch
    ):
        kept = await _uploaded(client, auth_headers, board)
        dropped = await _uploaded(client, auth_headers, board, "옛 서식.hwp", HWP)
        post = (
            await _post(
                client, auth_headers, board, attachment_ids=[kept["id"], dropped["id"]]
            )
        ).json()["data"]
        await client.patch(
            f"{BOARDS}/{board['id']}/posts/{post['id']}",
            json={"attachment_ids": [kept["id"]]},
            headers=auth_headers,
        )
        await _sql(
            "UPDATE uploaded_files SET created_at = now() - interval '100 days'"
            " WHERE tenant_id = :t",
            t=tenant["id"],
        )

        class _Client:
            def delete_object(self, **_kwargs):
                return None

        monkeypatch.setattr(image_service, "_get_s3_client", lambda: _Client())
        await image_worker._cleanup_orphan_files(age_days=30)

        rows = await _sql(
            "SELECT id FROM uploaded_files WHERE tenant_id = :t", t=tenant["id"]
        )
        assert {str(r[0]) for r in rows} == {kept["id"]}


class TestListFlag:
    async def test_lists_mark_posts_with_files(
        self, client, auth_headers, tenant, board
    ):
        """T-197: 관리자 · 홈페이지 글 목록에 첨부 있는 글 표시."""
        item = await _uploaded(client, auth_headers, board)
        with_file = (
            await _post(client, auth_headers, board, attachment_ids=[item["id"]])
        ).json()["data"]
        plain = (await _post(client, auth_headers, board, title="그냥 글")).json()[
            "data"
        ]

        admin = await client.get(f"{BOARDS}/{board['id']}/posts", headers=auth_headers)
        flags = {p["id"]: p["has_attachments"] for p in admin.json()["data"]["items"]}
        assert flags == {with_file["id"]: True, plain["id"]: False}

        public = await client.get(
            f"/api/public/site/{tenant['slug']}/boards/news/posts"
        )
        flags = {p["id"]: p["has_attachments"] for p in public.json()["data"]["items"]}
        assert flags == {with_file["id"]: True, plain["id"]: False}
