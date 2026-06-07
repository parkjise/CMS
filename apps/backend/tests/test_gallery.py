"""T-027 갤러리 다중 업로드 / 조회 / 순서 변경 / 삭제 통합 테스트"""

import io
import uuid

import pytest
from PIL import Image
from sqlalchemy import text

from app.services import image as image_service
from tests.conftest import _TestSession

# ── boto3 mock (test_upload.py와 동일 패턴) ─────────────────────────────────


class _FakeS3Client:
    def __init__(self, store: dict):
        self.store = store

    def put_object(self, Bucket, Key, Body, ContentType):
        self.store[(Bucket, Key)] = {"body": Body, "content_type": ContentType}
        return {}

    def delete_object(self, Bucket, Key):
        self.store.pop((Bucket, Key), None)
        return {}


@pytest.fixture
def fake_s3(monkeypatch):
    store: dict = {}
    client = _FakeS3Client(store)
    monkeypatch.setattr(image_service, "_get_s3_client", lambda: client)
    return store


def _make_jpeg(width: int = 600, height: int = 400) -> bytes:
    img = Image.new("RGB", (width, height), (50, 100, 200))
    pixels = img.load()
    for y in range(0, height, 8):
        for x in range(0, width, 8):
            pixels[x, y] = ((x * y) % 255, (x + y) % 255, (x - y) % 255)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


# ── POST /api/v1/upload/gallery ───────────────────────────────────────────


class TestUploadGallery:
    async def test_upload_multiple_files(
        self, client, auth_headers, test_section, fake_s3
    ):
        files = [
            ("files", (f"img{i}.jpg", _make_jpeg(), "image/jpeg")) for i in range(3)
        ]
        resp = await client.post(
            "/api/v1/upload/gallery",
            files=files,
            data={"section_id": test_section["id"]},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["uploaded_count"] == 3
        assert data["failed_count"] == 0
        assert len(data["items"]) == 3
        # display_order가 0, 1, 2로 순차 부여
        orders = sorted(item["display_order"] for item in data["items"])
        assert orders == [0, 1, 2]

        # 정리
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text("DELETE FROM gallery_items WHERE section_id = :sid"),
                {"sid": test_section["id"]},
            )
            await session.execute(
                text("DELETE FROM uploaded_files WHERE tenant_id = :tid"),
                {"tid": test_section["tenant_id"]},
            )
            await session.commit()

    async def test_upload_too_many_files(
        self, client, auth_headers, test_section, fake_s3
    ):
        files = [
            ("files", (f"img{i}.jpg", _make_jpeg(100, 100), "image/jpeg"))
            for i in range(11)
        ]
        resp = await client.post(
            "/api/v1/upload/gallery",
            files=files,
            data={"section_id": test_section["id"]},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "TOO_MANY_FILES"

    async def test_upload_skips_invalid_file_but_continues(
        self, client, auth_headers, test_section, fake_s3
    ):
        files = [
            ("files", ("ok.jpg", _make_jpeg(), "image/jpeg")),
            ("files", ("bad.jpg", b"not an image" * 50, "image/jpeg")),
            ("files", ("ok2.jpg", _make_jpeg(), "image/jpeg")),
        ]
        resp = await client.post(
            "/api/v1/upload/gallery",
            files=files,
            data={"section_id": test_section["id"]},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["uploaded_count"] == 2
        assert data["failed_count"] == 1

        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text("DELETE FROM gallery_items WHERE section_id = :sid"),
                {"sid": test_section["id"]},
            )
            await session.execute(
                text("DELETE FROM uploaded_files WHERE tenant_id = :tid"),
                {"tid": test_section["tenant_id"]},
            )
            await session.commit()

    async def test_upload_unauthenticated(self, client, test_section, fake_s3):
        files = [("files", ("x.jpg", _make_jpeg(100, 100), "image/jpeg"))]
        resp = await client.post(
            "/api/v1/upload/gallery",
            files=files,
            data={"section_id": test_section["id"]},
        )
        assert resp.status_code == 401


# ── GET /api/v1/gallery/{section_id} ──────────────────────────────────────


class TestListGallery:
    async def test_list_returns_items_in_order(
        self, client, auth_headers, test_section, fake_s3
    ):
        # 직접 DB에 3건 삽입 (display_order 역순)
        tenant_id = test_section["tenant_id"]
        section_id = test_section["id"]
        ids = [uuid.uuid4() for _ in range(3)]
        file_ids = [uuid.uuid4() for _ in range(3)]

        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            for fid in file_ids:
                await session.execute(
                    text(
                        "INSERT INTO uploaded_files "
                        "(id, tenant_id, file_name, file_url, file_size, mime_type, created_at, updated_at) "  # noqa: E501
                        "VALUES (:id, :tid, 'x.webp', 'http://x', 1024, 'image/webp', now(), now())"  # noqa: E501
                    ),
                    {"id": str(fid), "tid": tenant_id},
                )
            for i, (gid, fid) in enumerate(zip(ids, file_ids, strict=False)):
                await session.execute(
                    text(
                        "INSERT INTO gallery_items "
                        "(id, tenant_id, section_id, file_id, image_url, storage_key, display_order, created_at, updated_at) "  # noqa: E501
                        "VALUES (:id, :tid, :sid, :fid, 'http://x.webp', 'k', :ord, now(), now())"  # noqa: E501
                    ),
                    {
                        "id": str(gid),
                        "tid": tenant_id,
                        "sid": section_id,
                        "fid": str(fid),
                        "ord": 2 - i,
                    },
                )
            await session.commit()

        try:
            resp = await client.get(
                f"/api/v1/gallery/{section_id}", headers=auth_headers
            )
            assert resp.status_code == 200
            items = resp.json()["data"]
            assert len(items) == 3
            # display_order 오름차순으로 정렬되어 반환
            orders = [item["display_order"] for item in items]
            assert orders == sorted(orders)
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("DELETE FROM gallery_items WHERE section_id = :sid"),
                    {"sid": section_id},
                )
                await session.execute(
                    text("DELETE FROM uploaded_files WHERE tenant_id = :tid"),
                    {"tid": tenant_id},
                )
                await session.commit()

    async def test_list_unauthenticated(self, client, test_section):
        resp = await client.get(f"/api/v1/gallery/{test_section['id']}")
        assert resp.status_code == 401


# ── PATCH /api/v1/gallery/order ───────────────────────────────────────────


class TestReorderGallery:
    async def test_reorder_updates_display_order(
        self, client, auth_headers, test_section, fake_s3
    ):
        # 2건 삽입
        tenant_id = test_section["tenant_id"]
        section_id = test_section["id"]
        gid1, gid2 = uuid.uuid4(), uuid.uuid4()
        fid1, fid2 = uuid.uuid4(), uuid.uuid4()

        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            for fid in (fid1, fid2):
                await session.execute(
                    text(
                        "INSERT INTO uploaded_files "
                        "(id, tenant_id, file_name, file_url, file_size, mime_type, created_at, updated_at) "  # noqa: E501
                        "VALUES (:id, :tid, 'x.webp', 'http://x', 1024, 'image/webp', now(), now())"  # noqa: E501
                    ),
                    {"id": str(fid), "tid": tenant_id},
                )
            for gid, fid, ord in [(gid1, fid1, 0), (gid2, fid2, 1)]:
                await session.execute(
                    text(
                        "INSERT INTO gallery_items "
                        "(id, tenant_id, section_id, file_id, image_url, storage_key, display_order, created_at, updated_at) "  # noqa: E501
                        "VALUES (:id, :tid, :sid, :fid, 'http://x.webp', 'k', :ord, now(), now())"  # noqa: E501
                    ),
                    {
                        "id": str(gid),
                        "tid": tenant_id,
                        "sid": section_id,
                        "fid": str(fid),
                        "ord": ord,
                    },
                )
            await session.commit()

        try:
            # 순서 뒤바꿈
            resp = await client.patch(
                "/api/v1/gallery/order",
                json={
                    "items": [
                        {"id": str(gid1), "display_order": 1},
                        {"id": str(gid2), "display_order": 0},
                    ]
                },
                headers=auth_headers,
            )
            assert resp.status_code == 200

            # 확인
            resp = await client.get(
                f"/api/v1/gallery/{section_id}", headers=auth_headers
            )
            items = resp.json()["data"]
            assert items[0]["id"] == str(gid2)
            assert items[1]["id"] == str(gid1)
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("DELETE FROM gallery_items WHERE section_id = :sid"),
                    {"sid": section_id},
                )
                await session.execute(
                    text("DELETE FROM uploaded_files WHERE tenant_id = :tid"),
                    {"tid": tenant_id},
                )
                await session.commit()


# ── DELETE /api/v1/gallery/{item_id} ──────────────────────────────────────


class TestDeleteGalleryItem:
    async def test_delete_removes_item_and_file(
        self, client, auth_headers, test_section, fake_s3
    ):
        # 업로드해서 1건 생성
        files = [("files", ("x.jpg", _make_jpeg(), "image/jpeg"))]
        upload_resp = await client.post(
            "/api/v1/upload/gallery",
            files=files,
            data={"section_id": test_section["id"]},
            headers=auth_headers,
        )
        item_id = upload_resp.json()["data"]["items"][0]["id"]

        # MinIO 키 존재 확인
        assert len(fake_s3) == 1

        # 삭제
        resp = await client.delete(f"/api/v1/gallery/{item_id}", headers=auth_headers)
        assert resp.status_code == 200

        # MinIO에서도 제거됨
        assert len(fake_s3) == 0

        # DB에서도 제거됨
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            row = await session.execute(
                text("SELECT id FROM gallery_items WHERE id = :id"),
                {"id": item_id},
            )
            assert row.scalar_one_or_none() is None

    async def test_delete_not_found(self, client, auth_headers, fake_s3):
        fake_id = uuid.uuid4()
        resp = await client.delete(f"/api/v1/gallery/{fake_id}", headers=auth_headers)
        assert resp.status_code == 404
