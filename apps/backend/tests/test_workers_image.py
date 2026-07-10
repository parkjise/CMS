"""T-029 Celery 이미지 후처리 태스크 단위 테스트.

Celery 브로커 의존 없이 _generate_thumbnail / _cleanup_orphan_files
async 함수를 직접 호출하여 검증한다.
"""

import io
import uuid

import pytest
from PIL import Image
from sqlalchemy import text

from app.core.config import settings
from app.services import image as image_service
from app.workers import image as image_worker
from tests.conftest import _TestSession

# ── Fake S3 (test_upload.py 패턴 재사용) ───────────────────────────────────


class _FakeS3Client:
    def __init__(self, store: dict):
        self.store = store

    def put_object(self, Bucket, Key, Body, ContentType):
        self.store[(Bucket, Key)] = {"body": Body, "content_type": ContentType}
        return {}

    def get_object(self, Bucket, Key):
        entry = self.store.get((Bucket, Key))
        if entry is None:
            raise KeyError(Key)
        body = entry["body"]
        return {"Body": io.BytesIO(body)}

    def delete_object(self, Bucket, Key):
        self.store.pop((Bucket, Key), None)
        return {}


@pytest.fixture
def fake_s3(monkeypatch):
    store: dict = {}
    client = _FakeS3Client(store)
    monkeypatch.setattr(image_service, "_get_s3_client", lambda: client)
    return store


def _make_webp(width: int, height: int) -> bytes:
    img = Image.new("RGB", (width, height), (100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=90)
    return buf.getvalue()


# ── _generate_thumbnail ────────────────────────────────────────────────────


class TestGenerateThumbnail:
    async def test_generates_400x300_and_updates_db(self, test_tenant, fake_s3):
        # 원본 업로드 (1200x900 WebP)
        file_id = uuid.uuid4()
        original_key = f"{test_tenant['id']}/hero/{uuid.uuid4()}/{file_id}.webp"
        original_bytes = _make_webp(1200, 900)
        fake_s3[(settings.minio_bucket_name, original_key)] = {
            "body": original_bytes,
            "content_type": "image/webp",
        }

        # uploaded_files 레코드 삽입
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            file_url = f"{settings.cdn_base_url.rstrip('/')}/{original_key}"
            await session.execute(
                text(
                    "INSERT INTO uploaded_files "
                    "(id, tenant_id, file_name, file_url, file_size, mime_type, created_at, updated_at) "  # noqa: E501
                    "VALUES (:id, :tid, 'hero.webp', :url, :sz, 'image/webp', now(), now())"  # noqa: E501
                ),
                {
                    "id": str(file_id),
                    "tid": test_tenant["id"],
                    "url": file_url,
                    "sz": len(original_bytes),
                },
            )
            await session.commit()

        try:
            ok = await image_worker._generate_thumbnail(str(file_id))
            assert ok is True

            # 썸네일이 S3에 저장됨 (_thumb.webp 키)
            thumb_keys = [k for (_b, k) in fake_s3.keys() if k.endswith("_thumb.webp")]
            assert len(thumb_keys) == 1
            thumb_entry = fake_s3[(settings.minio_bucket_name, thumb_keys[0])]

            # 썸네일이 400x300 이하인지 확인
            with Image.open(io.BytesIO(thumb_entry["body"])) as img:
                assert img.width <= image_worker.THUMB_WIDTH
                assert img.height <= image_worker.THUMB_HEIGHT

            # DB의 thumbnail_url 채워졌는지 확인
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                row = await session.execute(
                    text("SELECT thumbnail_url FROM uploaded_files WHERE id = :id"),
                    {"id": str(file_id)},
                )
                thumb_url = row.scalar_one()
                assert thumb_url is not None
                assert thumb_url.endswith("_thumb.webp")
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("DELETE FROM uploaded_files WHERE id = :id"),
                    {"id": str(file_id)},
                )
                await session.commit()

    async def test_returns_false_when_file_not_found(self, fake_s3):
        fake_id = uuid.uuid4()
        ok = await image_worker._generate_thumbnail(str(fake_id))
        assert ok is False


# ── _cleanup_orphan_files ──────────────────────────────────────────────────


class TestCleanupOrphanFiles:
    async def test_cleans_only_old_unreferenced_files(
        self, test_tenant, test_section, fake_s3
    ):
        """규칙: age_days 초과 + 미참조 파일만 삭제, 참조되거나 최신은 보존."""
        tenant_id = test_tenant["id"]
        section_id = test_section["id"]

        old_orphan = uuid.uuid4()
        old_referenced_gallery = uuid.uuid4()
        old_referenced_settings = uuid.uuid4()
        recent_orphan = uuid.uuid4()
        gallery_item_id = uuid.uuid4()

        base = settings.cdn_base_url.rstrip("/")

        def _key(fid):
            return f"{tenant_id}/hero/x/{fid}.webp"

        def _url(fid):
            return f"{base}/{_key(fid)}"

        # 모든 파일을 S3에 넣어둠
        for fid in (
            old_orphan,
            old_referenced_gallery,
            old_referenced_settings,
            recent_orphan,
        ):
            fake_s3[(settings.minio_bucket_name, _key(fid))] = {
                "body": b"x",
                "content_type": "image/webp",
            }

        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            # 오래된 파일들 (created_at = 100일 전)
            for fid in (
                old_orphan,
                old_referenced_gallery,
                old_referenced_settings,
            ):
                await session.execute(
                    text(
                        "INSERT INTO uploaded_files "
                        "(id, tenant_id, file_name, file_url, file_size, mime_type, created_at, updated_at) "  # noqa: E501
                        "VALUES (:id, :tid, 'x.webp', :url, 100, 'image/webp', NOW() - INTERVAL '100 days', NOW())"  # noqa: E501
                    ),
                    {"id": str(fid), "tid": tenant_id, "url": _url(fid)},
                )

            # 최근 파일 (생성된 지 1시간 전)
            await session.execute(
                text(
                    "INSERT INTO uploaded_files "
                    "(id, tenant_id, file_name, file_url, file_size, mime_type, created_at, updated_at) "  # noqa: E501
                    "VALUES (:id, :tid, 'x.webp', :url, 100, 'image/webp', NOW() - INTERVAL '1 hour', NOW())"  # noqa: E501
                ),
                {
                    "id": str(recent_orphan),
                    "tid": tenant_id,
                    "url": _url(recent_orphan),
                },
            )

            # 갤러리 참조 설정
            await session.execute(
                text(
                    "INSERT INTO gallery_items "
                    "(id, tenant_id, section_id, file_id, image_url, storage_key, display_order, created_at, updated_at) "  # noqa: E501
                    "VALUES (:gid, :tid, :sid, :fid, :url, :key, 0, NOW(), NOW())"
                ),
                {
                    "gid": str(gallery_item_id),
                    "tid": tenant_id,
                    "sid": section_id,
                    "fid": str(old_referenced_gallery),
                    "url": _url(old_referenced_gallery),
                    "key": _key(old_referenced_gallery),
                },
            )

            # section_settings 참조
            await session.execute(
                text(
                    "INSERT INTO section_settings "
                    "(id, tenant_id, section_id, field_key, field_value, value_type, created_at, updated_at) "  # noqa: E501
                    "VALUES (:id, :tid, :sid, 'bg_image_url', :val, 'STRING', NOW(), NOW())"  # noqa: E501
                ),
                {
                    "id": str(uuid.uuid4()),
                    "tid": tenant_id,
                    "sid": section_id,
                    "val": _url(old_referenced_settings),
                },
            )
            await session.commit()

        try:
            deleted = await image_worker._cleanup_orphan_files(age_days=30)
            # 전역 정리이므로 다른 테스트의 잔여 orphan이 섞일 수 있어 >= 1로 확인.
            # 정확성은 아래 파일별 존재/부재 검증으로 보장한다.
            assert deleted >= 1

            # DB 확인
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                rows = await session.execute(
                    text("SELECT id FROM uploaded_files WHERE id = ANY(:ids)"),
                    {
                        "ids": [
                            str(old_orphan),
                            str(old_referenced_gallery),
                            str(old_referenced_settings),
                            str(recent_orphan),
                        ]
                    },
                )
                remaining = {str(r.id) for r in rows.all()}
                assert str(old_orphan) not in remaining
                assert str(old_referenced_gallery) in remaining
                assert str(old_referenced_settings) in remaining
                assert str(recent_orphan) in remaining

            # MinIO 객체도 삭제됨
            assert (settings.minio_bucket_name, _key(old_orphan)) not in fake_s3
            assert (
                settings.minio_bucket_name,
                _key(old_referenced_gallery),
            ) in fake_s3
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                await session.execute(
                    text("DELETE FROM gallery_items WHERE id = :id"),
                    {"id": str(gallery_item_id)},
                )
                await session.execute(
                    text("DELETE FROM section_settings WHERE tenant_id = :tid"),
                    {"tid": tenant_id},
                )
                await session.execute(
                    text("DELETE FROM uploaded_files WHERE tenant_id = :tid"),
                    {"tid": tenant_id},
                )
                await session.commit()

    async def test_returns_zero_when_no_orphans(self, fake_s3):
        deleted = await image_worker._cleanup_orphan_files(age_days=10000)
        assert deleted == 0

    async def test_rejects_negative_age(self, fake_s3):
        with pytest.raises(ValueError):
            await image_worker._cleanup_orphan_files(age_days=-1)
