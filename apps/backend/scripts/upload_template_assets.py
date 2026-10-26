"""템플릿 샘플 이미지를 공용 스토리지에 올린다 (기획서 11.8, T-120).

원본: apps/client/public/templates/{key}/{version}/…
대상: {MINIO_BUCKET_NAME}/templates/{key}/{version}/… (모든 테넌트가 같은 URL 참조)

    poetry run python scripts/upload_template_assets.py --dry-run
    poetry run python scripts/upload_template_assets.py --template hospital-a

- 같은 파일(크기 · MD5)이 이미 있으면 건너뛴다 — 여러 번 실행해도 안전
- 버전 폴더마다 SOURCES.md(이미지 출처 · 라이선스)가 있어야 하고, '확인 필요' 가
  남아 있으면 업로드하지 않는다. 개발 환경에서만 --allow-unverified 로 올릴 수 있다
- 버킷 정책에 templates/* 공개 읽기를 추가한다
- 올린 뒤 TEMPLATE_ASSET_BASE_URL 을 CDN_BASE_URL 과 같은 값으로 설정하면
  이후 샘플 복사부터 공용 주소를 쓴다 (기존 테넌트 주소는 그대로)
"""

import argparse
import hashlib
import json
import mimetypes
import sys
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from botocore.exceptions import ClientError

from app.core.config import settings
from app.services import image as image_service
from app.services.template_assets import TEMPLATE_KEY_PREFIX

DEFAULT_SOURCE = Path(__file__).resolve().parents[2] / "client" / "public" / "templates"
SOURCES_FILE = "SOURCES.md"
UNVERIFIED_MARK = "확인 필요"
CACHE_CONTROL = "public, max-age=31536000, immutable"  # 버전 경로라 내용이 바뀌지 않음
_EXTRA_TYPES = {
    ".avif": "image/avif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}


class AssetUploadError(Exception):
    """업로드를 시작할 수 없는 상태 (원본 없음 · 출처 미확인 등)."""


@dataclass
class UploadReport:
    uploaded: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)


def content_type_for(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in _EXTRA_TYPES:
        return _EXTRA_TYPES[suffix]
    return mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def version_dirs(source: Path, template: str | None) -> list[Path]:
    """`{key}/{version}` 폴더 목록."""
    if not source.is_dir():
        raise AssetUploadError(f"원본 폴더가 없습니다: {source}")
    # 템플릿 폴더만 (테마형 썸네일 *.svg 등 최상위 파일은 제외)
    keys = (
        [source / template]
        if template
        else sorted(d for d in source.iterdir() if d.is_dir())
    )
    dirs: list[Path] = []
    for key_dir in keys:
        if not key_dir.is_dir():
            raise AssetUploadError(f"템플릿 폴더가 없습니다: {key_dir}")
        dirs.extend(sorted(d for d in key_dir.iterdir() if d.is_dir()))
    return dirs


def unverified_sources(version_dir: Path) -> list[str]:
    """출처 확인이 안 된 SOURCES.md (없으면 그 폴더 자체를 미확인으로 본다)."""
    files = sorted(version_dir.rglob(SOURCES_FILE))
    if not files:
        return [f"{version_dir} ({SOURCES_FILE} 없음)"]
    return [
        str(f.relative_to(version_dir))
        for f in files
        if UNVERIFIED_MARK in f.read_text(encoding="utf-8")
    ]


def check_sources(dirs: list[Path], *, allow_unverified: bool) -> None:
    problems = [
        f"{d.parent.name}/{d.name}: {item}"
        for d in dirs
        for item in unverified_sources(d)
    ]
    if not problems:
        return
    if allow_unverified and settings.app_env != "production":
        print("⚠️  출처 미확인 이미지 포함 (개발용 업로드):")
        for p in problems:
            print(f"   - {p}")
        return
    raise AssetUploadError(
        "이미지 출처 · 라이선스 확인이 끝나지 않았습니다 (기획서 11.8):\n"
        + "\n".join(f"  - {p}" for p in problems)
        + "\n  SOURCES.md 를 채운 뒤 다시 실행하세요"
        + ("" if settings.app_env == "production" else " (개발용: --allow-unverified)")
    )


def iter_assets(version_dir: Path) -> Iterator[tuple[Path, str]]:
    """(파일, 스토리지 키) — SOURCES.md 등 숨김 · 문서 파일은 제외."""
    key_root = f"{TEMPLATE_KEY_PREFIX}{version_dir.parent.name}/{version_dir.name}"
    for path in sorted(version_dir.rglob("*")):
        if not path.is_file() or path.name == SOURCES_FILE or path.name.startswith("."):
            continue
        yield path, f"{key_root}/{path.relative_to(version_dir).as_posix()}"


def _same_object(client: Any, key: str, body: bytes) -> bool:
    try:
        head = client.head_object(Bucket=settings.minio_bucket_name, Key=key)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return False
        raise
    etag = str(head.get("ETag", "")).strip('"')
    return (
        head.get("ContentLength") == len(body)
        and etag == hashlib.md5(body, usedforsecurity=False).hexdigest()
    )


def ensure_public_read(client: Any) -> None:
    """버킷 정책에 templates/* 공개 읽기가 없으면 추가한다."""
    bucket = settings.minio_bucket_name
    resource = f"arn:aws:s3:::{bucket}/{TEMPLATE_KEY_PREFIX}*"
    try:
        policy = json.loads(client.get_bucket_policy(Bucket=bucket)["Policy"])
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") != "NoSuchBucketPolicy":
            raise
        policy = {"Version": "2012-10-17", "Statement": []}
    for st in policy.get("Statement", []):
        resources = st.get("Resource", [])
        resources = [resources] if isinstance(resources, str) else resources
        if st.get("Effect") == "Allow" and resource in resources:
            return
    policy.setdefault("Statement", []).append(
        {
            "Effect": "Allow",
            "Principal": {"AWS": ["*"]},
            "Action": ["s3:GetObject"],
            "Resource": [resource],
        }
    )
    client.put_bucket_policy(Bucket=bucket, Policy=json.dumps(policy))


def upload(
    source: Path = DEFAULT_SOURCE,
    *,
    template: str | None = None,
    dry_run: bool = False,
    allow_unverified: bool = False,
    client: Any = None,
) -> UploadReport:
    dirs = version_dirs(source, template)
    check_sources(dirs, allow_unverified=allow_unverified)
    report = UploadReport()
    if client is None and not dry_run:
        client = image_service._get_s3_client()
    for version_dir in dirs:
        for path, key in iter_assets(version_dir):
            body = path.read_bytes()
            if dry_run:
                report.uploaded.append(key)
                continue
            if _same_object(client, key, body):
                report.skipped.append(key)
                continue
            client.put_object(
                Bucket=settings.minio_bucket_name,
                Key=key,
                Body=body,
                ContentType=content_type_for(path),
                CacheControl=CACHE_CONTROL,
            )
            report.uploaded.append(key)
    if not dry_run:
        ensure_public_read(client)
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="템플릿 샘플 이미지 공용 스토리지 업로드"
    )
    parser.add_argument("--template", help="템플릿 key (예: hospital-a). 생략 시 전체")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--dry-run", action="store_true", help="올릴 목록만 출력")
    parser.add_argument(
        "--allow-unverified",
        action="store_true",
        help="출처 미확인 이미지도 올림 (개발 환경 전용)",
    )
    args = parser.parse_args(argv)
    try:
        report = upload(
            args.source,
            template=args.template,
            dry_run=args.dry_run,
            allow_unverified=args.allow_unverified,
        )
    except AssetUploadError as e:
        print(f"❌ {e}")
        return 1
    label = "업로드 예정" if args.dry_run else "업로드"
    for key in report.uploaded:
        print(f"  + {key}")
    print(
        f"✅ {label} {len(report.uploaded)}개"
        f" · 동일 파일 건너뜀 {len(report.skipped)}개"
    )
    if not args.dry_run:
        base = settings.cdn_base_url.rstrip("/")
        print(f"ℹ️  공용 주소 예: {base}/{TEMPLATE_KEY_PREFIX}…")
        print("   TEMPLATE_ASSET_BASE_URL 을 CDN_BASE_URL 과 같은 값으로 설정하세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
