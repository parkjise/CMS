"""T-026 이미지 업로드 API 통합 테스트"""

import io
import uuid

import pytest
from PIL import Image
from sqlalchemy import text

from app.services import image as image_service
from tests.conftest import _TestSession

# ── boto3 S3 클라이언트를 인메모리 dict로 대체 ──────────────────────────────


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


# ── 이미지 생성 헬퍼 ───────────────────────────────────────────────────────


def _make_jpeg(width: int = 2400, height: int = 1600, color=(180, 30, 30)) -> bytes:
    """리사이즈가 일어나는 큰 JPG 생성."""
    img = Image.new("RGB", (width, height), color)
    # 노이즈 추가 (압축 가능한 이미지가 너무 작아지지 않게)
    pixels = img.load()
    for y in range(0, height, 8):
        for x in range(0, width, 8):
            pixels[x, y] = ((x * y) % 255, (x + y) % 255, (x - y) % 255)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


def _make_png(width: int = 800, height: int = 600) -> bytes:
    img = Image.new("RGBA", (width, height), (0, 200, 0, 128))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ── 단위 테스트: image 서비스 ──────────────────────────────────────────────


class TestImageService:
    def test_validate_image_accepts_jpeg(self):
        fmt = image_service.validate_image(_make_jpeg(100, 100))
        assert fmt == "JPEG"

    def test_validate_image_accepts_png(self):
        fmt = image_service.validate_image(_make_png(100, 100))
        assert fmt == "PNG"

    def test_validate_image_rejects_empty(self):
        with pytest.raises(image_service.ImageValidationError, match="EMPTY_FILE"):
            image_service.validate_image(b"")

    def test_validate_image_rejects_too_large(self):
        # 21MB 가짜 데이터 — Pillow가 형식 검증 전에 크기 체크
        big = b"X" * (21 * 1024 * 1024)
        with pytest.raises(image_service.ImageValidationError, match="FILE_TOO_LARGE"):
            image_service.validate_image(big)

    def test_validate_image_rejects_non_image(self):
        with pytest.raises(image_service.ImageValidationError, match="INVALID_IMAGE"):
            image_service.validate_image(b"not an image at all" * 100)

    def test_optimize_image_resizes_and_converts_to_webp(self):
        jpeg_bytes = _make_jpeg(2400, 1600)
        optimized, meta = image_service.optimize_image(jpeg_bytes)

        # 1920px 한도 적용 (가로 2400 → 1920, 세로 비율 유지)
        assert meta["width"] == 1920
        assert meta["height"] == 1280
        assert meta["format"] == "webp"
        # WebP 헤더 확인
        assert optimized[:4] == b"RIFF"
        assert b"WEBP" in optimized[:16]
        # 최적화 시 원본보다 작아야 함
        assert meta["optimized_size"] < meta["original_size"]

    def test_optimize_image_preserves_smaller_dimensions(self):
        jpeg_bytes = _make_jpeg(800, 600)
        _, meta = image_service.optimize_image(jpeg_bytes)
        # 1920보다 작으면 그대로 유지 (확대 금지)
        assert meta["width"] == 800
        assert meta["height"] == 600

    def test_optimize_image_handles_rgba_png(self):
        png_bytes = _make_png(500, 400)
        optimized, meta = image_service.optimize_image(png_bytes)
        assert meta["format"] == "webp"
        assert meta["width"] == 500


# ── 통합 테스트: POST /api/v1/upload/image ─────────────────────────────────


class TestUploadImage:
    async def test_upload_jpeg_returns_webp_url(
        self, client, auth_headers, test_section, fake_s3
    ):
        jpeg = _make_jpeg(2400, 1600)
        resp = await client.post(
            "/api/v1/upload/image",
            files={"file": ("hero.jpg", jpeg, "image/jpeg")},
            data={"context": "hero", "section_id": test_section["id"]},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["url"].endswith(".webp")
        assert data["format"] == "webp"
        assert data["width"] == 1920
        assert data["height"] == 1280
        assert data["original_size_kb"] > 0
        assert data["optimized_size_kb"] < data["original_size_kb"]

        # S3에 저장되었는지 확인
        assert any(key.endswith(".webp") for (_bucket, key) in fake_s3.keys())

    async def test_upload_records_file_in_db(
        self, client, auth_headers, test_section, test_tenant, fake_s3
    ):
        jpeg = _make_jpeg(800, 600)
        resp = await client.post(
            "/api/v1/upload/image",
            files={"file": ("intro.jpg", jpeg, "image/jpeg")},
            data={"context": "intro", "section_id": test_section["id"]},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        file_id = resp.json()["data"]["id"]

        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            row = await session.execute(
                text("SELECT mime_type, file_size FROM uploaded_files WHERE id = :id"),
                {"id": file_id},
            )
            r = row.one_or_none()
            assert r is not None
            assert r.mime_type == "image/webp"
            assert r.file_size > 0

            # 정리
            await session.execute(
                text("DELETE FROM uploaded_files WHERE id = :id"), {"id": file_id}
            )
            await session.commit()

    async def test_upload_rejects_invalid_context(
        self, client, auth_headers, test_section, fake_s3
    ):
        jpeg = _make_jpeg(400, 300)
        resp = await client.post(
            "/api/v1/upload/image",
            files={"file": ("x.jpg", jpeg, "image/jpeg")},
            data={"context": "unknown_context", "section_id": test_section["id"]},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "INVALID_CONTEXT"

    async def test_upload_rejects_non_image_file(
        self, client, auth_headers, test_section, fake_s3
    ):
        bogus = b"This is not an image, just plain text content." * 50
        resp = await client.post(
            "/api/v1/upload/image",
            files={"file": ("fake.jpg", bogus, "image/jpeg")},
            data={"context": "hero", "section_id": test_section["id"]},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "INVALID_IMAGE"

    async def test_upload_unauthenticated(self, client, test_section, fake_s3):
        jpeg = _make_jpeg(400, 300)
        resp = await client.post(
            "/api/v1/upload/image",
            files={"file": ("x.jpg", jpeg, "image/jpeg")},
            data={"context": "hero", "section_id": test_section["id"]},
        )
        assert resp.status_code == 401

    async def test_upload_quota_exceeded(
        self, client, auth_headers, test_section, test_tenant, fake_s3
    ):
        """BASIC 플랜 한도(1GB)를 거의 채운 상태에서 업로드 시 422."""
        # BASIC 한도에 가까운 가짜 파일 기록을 미리 삽입
        used_id = uuid.uuid4()
        almost_full = image_service.STORAGE_QUOTAS["BASIC"] - 1024  # 1KB 여유
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text(
                    "INSERT INTO uploaded_files "
                    "(id, tenant_id, file_name, file_url, file_size, mime_type, created_at, updated_at) "  # noqa: E501
                    "VALUES (:id, :tid, 'placeholder.webp', 'http://x', :sz, "
                    "'image/webp', now(), now())"
                ),
                {"id": str(used_id), "tid": test_tenant["id"], "sz": almost_full},
            )
            await session.commit()

        try:
            jpeg = _make_jpeg(2400, 1600)  # 최적화 후에도 1KB는 넘는다
            resp = await client.post(
                "/api/v1/upload/image",
                files={"file": ("big.jpg", jpeg, "image/jpeg")},
                data={"context": "hero", "section_id": test_section["id"]},
                headers=auth_headers,
            )
            assert resp.status_code == 422
            assert resp.json()["detail"] == "PLAN_LIMIT_EXCEEDED"
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("DELETE FROM uploaded_files WHERE id = :id"),
                    {"id": str(used_id)},
                )
                await session.commit()
