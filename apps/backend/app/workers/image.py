import asyncio
import io

from PIL import Image
from sqlalchemy import select, text

from app.core.config import settings
from app.models.file import UploadedFile
from app.models.gallery import GalleryItem
from app.models.section import SectionSetting
from app.services import image as image_service
from app.workers.celery_app import celery_app

THUMB_WIDTH = 400
THUMB_HEIGHT = 300
THUMB_QUALITY = 80
ORPHAN_AGE_DAYS = 30


# ── generate_thumbnail ──────────────────────────────────────────────────────


@celery_app.task(name="app.workers.image.generate_thumbnail", bind=True, max_retries=3)
def generate_thumbnail(self, file_id: str) -> None:
    try:
        asyncio.run(_generate_thumbnail(file_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


async def _generate_thumbnail(file_id: str) -> bool:
    """원본을 S3에서 받아 400x300 WebP 썸네일 생성 후 업로드 및 DB 기록."""
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        result = await db.execute(
            select(UploadedFile).where(UploadedFile.id == file_id)
        )
        file = result.scalar_one_or_none()
        if file is None:
            return False

        # file_url에서 storage key 역추출
        base = settings.cdn_base_url.rstrip("/")
        if not file.file_url.startswith(base + "/"):
            return False
        original_key = file.file_url[len(base) + 1 :]

        # 원본 다운로드
        client = image_service._get_s3_client()
        obj = client.get_object(Bucket=settings.minio_bucket_name, Key=original_key)
        body = obj["Body"]
        original_bytes = body.read() if hasattr(body, "read") else bytes(body)

        # 썸네일 생성 (비율 유지 fit)
        with Image.open(io.BytesIO(original_bytes)) as img:
            if img.mode != "RGB":
                img = img.convert("RGB")
            img.thumbnail((THUMB_WIDTH, THUMB_HEIGHT), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="WEBP", quality=THUMB_QUALITY, optimize=True)
            thumb_bytes = buf.getvalue()

        # 업로드 + DB
        thumb_key = original_key.rsplit(".", 1)[0] + "_thumb.webp"
        thumb_url = image_service.upload_to_storage(
            thumb_bytes, thumb_key, "image/webp"
        )
        file.thumbnail_url = thumb_url
        await db.commit()
        return True


# ── cleanup_orphan_files ────────────────────────────────────────────────────


@celery_app.task(
    name="app.workers.image.cleanup_orphan_files", bind=True, max_retries=3
)
def cleanup_orphan_files(self) -> int:
    try:
        return asyncio.run(_cleanup_orphan_files())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


async def _cleanup_orphan_files(age_days: int = ORPHAN_AGE_DAYS) -> int:
    """
    아래 조건을 모두 만족하는 uploaded_files를 정리:
      - 생성된 지 age_days 일 이상 경과
      - gallery_items.file_id 에서 미참조
      - section_settings.field_value 가 file_url 과 일치하는 행 없음

    MinIO의 원본·썸네일 객체도 함께 삭제. 정리된 파일 개수 반환.
    """
    from app.db.session import AsyncSessionLocal

    deleted = 0
    async with AsyncSessionLocal() as db:
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        # INTERVAL 안에서는 :param 바인딩이 안 되므로 정수 검증 후 SQL에 직접 포함
        if not isinstance(age_days, int) or age_days < 0:
            raise ValueError("age_days must be a non-negative integer")
        rows = await db.execute(
            text(
                f"""
                SELECT uf.id, uf.file_url
                FROM uploaded_files uf
                WHERE uf.created_at < NOW() - INTERVAL '{age_days} days'
                  AND NOT EXISTS (
                      SELECT 1 FROM gallery_items g WHERE g.file_id = uf.id
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM section_settings s
                      WHERE s.field_value = uf.file_url
                  )
                """
            )
        )
        candidates = list(rows.all())

        base = settings.cdn_base_url.rstrip("/")
        client = image_service._get_s3_client()

        for row in candidates:
            file_id, file_url = row.id, row.file_url
            # 원본 + 썸네일 키 추출
            keys_to_delete = []
            if file_url and file_url.startswith(base + "/"):
                key = file_url[len(base) + 1 :]
                keys_to_delete.append(key)
                keys_to_delete.append(key.rsplit(".", 1)[0] + "_thumb.webp")

            # MinIO 삭제 (실패해도 DB는 정리)
            for k in keys_to_delete:
                try:
                    client.delete_object(Bucket=settings.minio_bucket_name, Key=k)
                except Exception:
                    pass

            await db.execute(
                text("DELETE FROM uploaded_files WHERE id = :id"),
                {"id": str(file_id)},
            )
            deleted += 1

        await db.commit()

    return deleted


# 미사용 import 방지 — model 등록을 위해 참조
_ = (UploadedFile, GalleryItem, SectionSetting)
