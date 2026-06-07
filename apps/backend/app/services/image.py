import io
from uuid import UUID

import boto3
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.file import UploadedFile

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB
MAX_DIMENSION = 1920
WEBP_QUALITY = 82

# 플랜별 스토리지 한도 (bytes)
STORAGE_QUOTAS: dict[str, int] = {
    "BASIC": 1 * 1024**3,  # 1GB
    "STANDARD": 5 * 1024**3,  # 5GB
    "PREMIUM": 20 * 1024**3,  # 20GB
}

# Pillow가 안전하게 디코딩 가능한 입력 MIME (헤더 검증)
_ACCEPTED_PIL_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}


class ImageValidationError(ValueError):
    """이미지 검증 실패 — endpoint에서 400 또는 413으로 매핑"""


class StorageQuotaExceeded(ValueError):
    """플랜 스토리지 한도 초과 — endpoint에서 422로 매핑"""


def validate_image(file_bytes: bytes) -> str:
    """크기·magic-bytes 검증. 통과 시 PIL 포맷 문자열 반환."""
    if len(file_bytes) > MAX_FILE_SIZE:
        raise ImageValidationError("FILE_TOO_LARGE")
    if len(file_bytes) == 0:
        raise ImageValidationError("EMPTY_FILE")

    # Pillow는 magic-bytes 기반으로 헤더를 파싱한다.
    # verify()는 디코딩 없이 이미지 구조 무결성을 확인.
    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            fmt = img.format or ""
            img.verify()
    except (UnidentifiedImageError, OSError) as e:
        raise ImageValidationError("INVALID_IMAGE") from e

    if fmt not in _ACCEPTED_PIL_FORMATS:
        raise ImageValidationError("UNSUPPORTED_FORMAT")
    return fmt


def optimize_image(file_bytes: bytes) -> tuple[bytes, dict]:
    """리사이즈 + WebP 변환. (최적화된 bytes, 메타데이터) 반환."""
    original_size = len(file_bytes)

    with Image.open(io.BytesIO(file_bytes)) as img:
        # EXIF 기반 회전 보정 (모바일 촬영 사진 대응)
        img = ImageOps.exif_transpose(img)

        # WebP는 P/RGBA를 지원하지만 일부 브라우저 호환 위해 RGB로 정규화
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # 최대 1920px (확대 금지, 비율 유지)
        img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)

        output = io.BytesIO()
        img.save(output, format="WEBP", quality=WEBP_QUALITY, optimize=True)
        optimized_bytes = output.getvalue()
        width, height = img.size

    return optimized_bytes, {
        "original_size": original_size,
        "optimized_size": len(optimized_bytes),
        "width": width,
        "height": height,
        "format": "webp",
    }


def _get_s3_client():
    """boto3 S3 클라이언트 (MinIO 호환). 호출 시점에 생성하여 테스트 패치 가능."""
    scheme = "https" if settings.minio_use_ssl else "http"
    return boto3.client(
        "s3",
        endpoint_url=f"{scheme}://{settings.minio_endpoint}",
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
        region_name="us-east-1",
        config=boto3.session.Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        ),
    )


def upload_to_storage(file_bytes: bytes, key: str, content_type: str) -> str:
    """MinIO/S3에 업로드 후 CDN URL 반환."""
    client = _get_s3_client()
    client.put_object(
        Bucket=settings.minio_bucket_name,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
    )
    return get_cdn_url(key)


def delete_from_storage(key: str) -> None:
    client = _get_s3_client()
    client.delete_object(Bucket=settings.minio_bucket_name, Key=key)


def get_cdn_url(key: str) -> str:
    base = settings.cdn_base_url.rstrip("/")
    return f"{base}/{key}"


async def get_used_storage(db: AsyncSession, tenant_id: UUID) -> int:
    """테넌트가 사용 중인 누적 파일 크기(bytes)."""
    result = await db.execute(
        select(func.coalesce(func.sum(UploadedFile.file_size), 0)).where(
            UploadedFile.tenant_id == tenant_id
        )
    )
    return int(result.scalar_one())


async def check_storage_quota(
    db: AsyncSession,
    tenant_id: UUID,
    plan_type: str,
    new_file_size: int,
) -> None:
    """누적 사용량 + 신규 크기가 플랜 한도를 초과하면 예외."""
    quota = STORAGE_QUOTAS.get(plan_type, STORAGE_QUOTAS["BASIC"])
    used = await get_used_storage(db, tenant_id)
    if used + new_file_size > quota:
        raise StorageQuotaExceeded("PLAN_LIMIT_EXCEEDED")
