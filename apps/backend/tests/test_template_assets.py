"""T-120 템플릿 샘플 이미지 공용 스토리지 테스트 (기획서 11.8).

- 샘플 주소 변환: TEMPLATE_ASSET_BASE_URL 이 있으면 /templates/… → 공용 주소
- 샘플 복사 시 섹션 설정(문자열 · 목록 안 이미지)이 공용 주소를 참조
- 공용 원본(templates/…) 덮어쓰기 · 삭제 차단 — 업로드 · 삭제 · 고아 파일 정리
- 업로드 스크립트: 키 경로 · 형식 · 중복 건너뛰기 · dry-run · 출처 미확인 거부
  · 버킷 정책
"""

import hashlib
import importlib.util
import json
import uuid
from pathlib import Path

import pytest
from botocore.exceptions import ClientError
from httpx import AsyncClient

from app.core.config import settings
from app.services import image as image_service
from app.services import template_assets
from app.services.template_assets import (
    ProtectedAssetError,
    is_protected_key,
    resolve_sample_url,
    resolve_sample_value,
)
from tests.test_templates_code import _apply, _cleanup, _insert_template, _sections

_SCRIPT = (
    Path(__file__).resolve().parent.parent / "scripts" / "upload_template_assets.py"
)
_spec = importlib.util.spec_from_file_location("_upload_template_assets", _SCRIPT)
assert _spec and _spec.loader
script = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(script)

CDN = "https://cdn.example.com/cms-media"


@pytest.fixture
def asset_base(monkeypatch):
    monkeypatch.setattr(settings, "template_asset_base_url", CDN + "/")
    return CDN


# ── 주소 변환 ──────────────────────────────────────────────────────────────


class TestResolveSampleUrl:
    def test_without_base_keeps_relative(self, monkeypatch):
        monkeypatch.setattr(settings, "template_asset_base_url", "")
        url = "/templates/hospital-a/1.0.0/logo.svg"
        assert resolve_sample_url(url) == url

    def test_with_base_points_to_shared_storage(self, asset_base):
        assert (
            resolve_sample_url("/templates/hospital-a/1.0.0/logo.svg")
            == f"{CDN}/templates/hospital-a/1.0.0/logo.svg"
        )

    def test_other_values_untouched(self, asset_base):
        for value in ("샘플 제목", "/hospital/about", "https://x.com/templates/a.jpg"):
            assert resolve_sample_url(value) == value

    def test_nested_values(self, asset_base):
        value = {
            "slides": [{"image_url": "/templates/a/1/s.jpg", "title": "T", "n": 1}],
            "flag": True,
        }
        assert resolve_sample_value(value) == {
            "slides": [
                {"image_url": f"{CDN}/templates/a/1/s.jpg", "title": "T", "n": 1}
            ],
            "flag": True,
        }


# ── 공용 원본 보호 ─────────────────────────────────────────────────────────


class _RecordingS3:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def put_object(self, *, Bucket, Key, Body, ContentType, **_):  # noqa: N803
        self.calls.append(("put", Key))

    def delete_object(self, *, Bucket, Key):  # noqa: N803
        self.calls.append(("delete", Key))


class TestProtectedKeys:
    @pytest.mark.parametrize(
        "key",
        ["templates/hospital-a/1.0.0/a.jpg", "/templates/x", "./templates/x"],
    )
    def test_template_paths_are_protected(self, key):
        assert is_protected_key(key)

    @pytest.mark.parametrize(
        "key", [f"{uuid.uuid4()}/sections/a.webp", "public/logo.png", "templatesX/a"]
    )
    def test_tenant_paths_are_not(self, key):
        assert not is_protected_key(key)

    def test_delete_from_storage_refuses_shared_original(self, monkeypatch):
        s3 = _RecordingS3()
        monkeypatch.setattr(image_service, "_get_s3_client", lambda: s3)
        with pytest.raises(ProtectedAssetError):
            image_service.delete_from_storage("templates/hospital-a/1.0.0/logo.svg")
        assert s3.calls == []

    def test_upload_to_storage_refuses_shared_original(self, monkeypatch):
        s3 = _RecordingS3()
        monkeypatch.setattr(image_service, "_get_s3_client", lambda: s3)
        with pytest.raises(ProtectedAssetError):
            image_service.upload_to_storage(b"x", "templates/a/1/a.jpg", "image/jpeg")
        assert s3.calls == []

    def test_tenant_paths_still_work(self, monkeypatch):
        s3 = _RecordingS3()
        monkeypatch.setattr(image_service, "_get_s3_client", lambda: s3)
        key = f"{uuid.uuid4()}/sections/s/a.webp"
        image_service.upload_to_storage(b"x", key, "image/webp")
        image_service.delete_from_storage(key)
        assert s3.calls == [("put", key), ("delete", key)]

    def test_module_prefix_matches_sample_paths(self):
        assert template_assets.TEMPLATE_KEY_PREFIX == "templates/"


# ── 샘플 복사 연동 ─────────────────────────────────────────────────────────

ASSET_SAMPLE = {
    "pages": {
        "home": [
            {
                "section_type": "HERO_SLIDER",
                "label": "메인 비주얼",
                "settings": {
                    "slides": [
                        {"title": "슬라이드", "image_url": "/templates/t/1.0.0/s1.jpg"}
                    ],
                    "background_url": "/templates/t/1.0.0/bg.webp",
                    "title": "샘플 제목",
                },
            }
        ]
    }
}


@pytest.fixture
async def asset_template(test_tenant: dict):
    tid = await _insert_template(
        code=f"TPL_ASSET_{uuid.uuid4().hex[:6].upper()}",
        renderer="code",
        sample=ASSET_SAMPLE,
    )
    yield tid
    await _cleanup(test_tenant["id"], [tid])


class TestSampleCopyUsesSharedStorage:
    async def _hero_settings(self, client, headers) -> dict:
        sections = await _sections(client, headers)
        hero = next(s for s in sections if s["section_type"] == "HERO_SLIDER")
        return {st["field_key"]: st for st in hero["settings"]}

    async def test_copied_images_point_to_shared_storage(
        self, client: AsyncClient, auth_headers, asset_template, asset_base
    ):
        resp = await _apply(client, auth_headers, asset_template, "replace_with_sample")
        assert resp.status_code == 200
        st = await self._hero_settings(client, auth_headers)
        assert st["background_url"]["field_value"] == f"{CDN}/templates/t/1.0.0/bg.webp"
        assert st["background_url"]["is_sample"] is True
        slides = json.loads(st["slides"]["field_value"])
        assert slides[0]["image_url"] == f"{CDN}/templates/t/1.0.0/s1.jpg"
        assert st["title"]["field_value"] == "샘플 제목"

    async def test_without_base_keeps_client_public_paths(
        self, client: AsyncClient, auth_headers, asset_template, monkeypatch
    ):
        monkeypatch.setattr(settings, "template_asset_base_url", "")
        await _apply(client, auth_headers, asset_template, "replace_with_sample")
        st = await self._hero_settings(client, auth_headers)
        assert st["background_url"]["field_value"] == "/templates/t/1.0.0/bg.webp"


# ── 업로드 스크립트 ────────────────────────────────────────────────────────

VERIFIED = "| 파일 | 출처 |\n|---|---|\n| a.jpg | Unsplash License |\n"


class _FakeBucket:
    """put / head / policy 만 흉내 내는 S3 클라이언트."""

    def __init__(self) -> None:
        self.objects: dict[str, dict] = {}
        self.policy: str | None = None
        self.puts: list[str] = []

    def head_object(self, *, Bucket, Key):  # noqa: N803
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")
        obj = self.objects[Key]
        body = obj["Body"]
        return {
            "ContentLength": len(body),
            "ETag": f'"{hashlib.md5(body, usedforsecurity=False).hexdigest()}"',
        }

    def put_object(self, *, Bucket, Key, Body, ContentType, CacheControl):  # noqa: N803
        self.objects[Key] = {
            "Body": Body,
            "ContentType": ContentType,
            "Cache": CacheControl,
        }
        self.puts.append(Key)

    def get_bucket_policy(self, *, Bucket):  # noqa: N803
        if self.policy is None:
            raise ClientError({"Error": {"Code": "NoSuchBucketPolicy"}}, "Get")
        return {"Policy": self.policy}

    def put_bucket_policy(self, *, Bucket, Policy):  # noqa: N803
        self.policy = Policy


def _make_source(root: Path, sources: str = VERIFIED) -> Path:
    version = root / "hospital-a" / "1.0.0"
    (version / "unsplash").mkdir(parents=True)
    (version / "head.jpg").write_bytes(b"jpg-bytes")
    (version / "card.avif").write_bytes(b"avif")
    (version / "logo.svg").write_text("<svg/>")
    (version / "unsplash" / "hero.jpg").write_bytes(b"hero")
    (version / ".DS_Store").write_bytes(b"x")
    (version / "SOURCES.md").write_text(sources, encoding="utf-8")
    (version / "unsplash" / "SOURCES.md").write_text(VERIFIED, encoding="utf-8")
    return root


class TestUploadScript:
    def test_uploads_to_versioned_shared_keys(self, tmp_path):
        bucket = _FakeBucket()
        report = script.upload(_make_source(tmp_path), client=bucket)
        prefix = "templates/hospital-a/1.0.0/"
        assert sorted(report.uploaded) == sorted(
            prefix + p
            for p in ("card.avif", "head.jpg", "logo.svg", "unsplash/hero.jpg")
        )
        assert bucket.objects[prefix + "card.avif"]["ContentType"] == "image/avif"
        assert bucket.objects[prefix + "logo.svg"]["ContentType"] == "image/svg+xml"
        assert bucket.objects[prefix + "head.jpg"]["ContentType"] == "image/jpeg"
        assert "immutable" in bucket.objects[prefix + "head.jpg"]["Cache"]
        assert not any("SOURCES.md" in k or ".DS_Store" in k for k in bucket.objects)

    def test_second_run_skips_identical_files(self, tmp_path):
        bucket = _FakeBucket()
        source = _make_source(tmp_path)
        script.upload(source, client=bucket)
        (source / "hospital-a" / "1.0.0" / "head.jpg").write_bytes(b"changed")
        report = script.upload(source, client=bucket)
        assert report.uploaded == ["templates/hospital-a/1.0.0/head.jpg"]
        assert len(report.skipped) == 3

    def test_dry_run_does_not_touch_storage(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            image_service, "_get_s3_client", lambda: pytest.fail("S3 호출 금지")
        )
        report = script.upload(_make_source(tmp_path), dry_run=True)
        assert len(report.uploaded) == 4

    def test_adds_public_read_policy_once(self, tmp_path):
        bucket = _FakeBucket()
        source = _make_source(tmp_path)
        script.upload(source, client=bucket)
        script.upload(source, client=bucket)
        statements = json.loads(bucket.policy or "{}")["Statement"]
        assert len(statements) == 1
        assert statements[0]["Resource"] == [
            f"arn:aws:s3:::{settings.minio_bucket_name}/templates/*"
        ]

    def test_keeps_existing_policy_statements(self, tmp_path):
        bucket = _FakeBucket()
        existing = {"Effect": "Allow", "Resource": ["arn:aws:s3:::b/public/*"]}
        bucket.policy = json.dumps({"Version": "2012-10-17", "Statement": [existing]})
        script.upload(_make_source(tmp_path), client=bucket)
        statements = json.loads(bucket.policy)["Statement"]
        assert statements[0] == existing and len(statements) == 2

    def test_unverified_sources_are_refused(self, tmp_path):
        bucket = _FakeBucket()
        source = _make_source(tmp_path, "| a.jpg | **확인 필요** |")
        with pytest.raises(
            script.AssetUploadError, match="hospital-a/1.0.0: SOURCES.md"
        ):
            script.upload(source, client=bucket)
        assert bucket.puts == []

    def test_missing_sources_file_is_refused(self, tmp_path):
        source = _make_source(tmp_path)
        (source / "hospital-a" / "1.0.0" / "SOURCES.md").unlink()
        (source / "hospital-a" / "1.0.0" / "unsplash" / "SOURCES.md").unlink()
        with pytest.raises(script.AssetUploadError, match="SOURCES.md 없음"):
            script.upload(source, client=_FakeBucket())

    def test_allow_unverified_only_outside_production(self, tmp_path, monkeypatch):
        source = _make_source(tmp_path, "확인 필요")
        report = script.upload(source, allow_unverified=True, client=_FakeBucket())
        assert len(report.uploaded) == 4

        monkeypatch.setattr(settings, "app_env", "production")
        with pytest.raises(script.AssetUploadError):
            script.upload(source, allow_unverified=True, client=_FakeBucket())

    def test_unknown_template_folder(self, tmp_path):
        _make_source(tmp_path)
        with pytest.raises(script.AssetUploadError, match="템플릿 폴더가 없습니다"):
            script.upload(tmp_path, template="nope", client=_FakeBucket())

    def test_main_exit_codes(self, tmp_path, capsys):
        source = _make_source(tmp_path, "확인 필요")
        assert script.main(["--source", str(source), "--dry-run"]) == 1
        assert "출처" in capsys.readouterr().out
        assert (
            script.main(["--source", str(source), "--dry-run", "--allow-unverified"])
            == 0
        )
        assert "업로드 예정 4개" in capsys.readouterr().out

    def test_real_sample_folder_has_sources(self):
        """저장소의 실제 샘플 폴더 — 버전마다 SOURCES.md 가 있어야 한다."""
        for version_dir in script.version_dirs(script.DEFAULT_SOURCE, None):
            assert list(version_dir.rglob("SOURCES.md")), version_dir
