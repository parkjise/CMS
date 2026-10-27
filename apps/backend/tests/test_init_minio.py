"""MinIO 초기화 스크립트 테스트 — 업로드 이미지 공개 읽기.

- 버킷이 없으면 만들고, 있으면 그대로
- 버킷 전체 익명 읽기(GetObject) 정책 — 업로드 경로({tenant_id}/…)가 403 이던 문제
- 목록 조회는 허용하지 않고, 기존 정책 항목은 유지, 여러 번 실행해도 한 번만
- 접속 정보 · 버킷 이름은 앱 설정 사용
"""

import importlib.util
import json
from pathlib import Path

from botocore.exceptions import ClientError

from app.core.config import settings
from app.services import image as image_service

_SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "init_minio.py"
_spec = importlib.util.spec_from_file_location("_init_minio", _SCRIPT)
assert _spec and _spec.loader
init_minio = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(init_minio)


class _FakeMinio:
    def __init__(self, *, exists: bool = False, policy: dict | None = None) -> None:
        self.buckets: set[str] = {settings.minio_bucket_name} if exists else set()
        self.policy = json.dumps(policy) if policy else None
        self.policy_puts = 0

    def create_bucket(self, *, Bucket):  # noqa: N803
        if Bucket in self.buckets:
            raise ClientError({"Error": {"Code": "BucketAlreadyOwnedByYou"}}, "Create")
        self.buckets.add(Bucket)

    def get_bucket_policy(self, *, Bucket):  # noqa: N803
        if self.policy is None:
            raise ClientError({"Error": {"Code": "NoSuchBucketPolicy"}}, "Get")
        return {"Policy": self.policy}

    def put_bucket_policy(self, *, Bucket, Policy):  # noqa: N803
        self.policy = Policy
        self.policy_puts += 1


def _statements(fake: _FakeMinio) -> list[dict]:
    return json.loads(fake.policy or "{}")["Statement"]


def test_creates_bucket_and_public_read_for_whole_bucket(capsys):
    fake = _FakeMinio()
    assert init_minio.main(fake) == 0
    assert settings.minio_bucket_name in fake.buckets
    (st,) = _statements(fake)
    assert st["Effect"] == "Allow"
    assert st["Action"] == ["s3:GetObject"]
    assert st["Resource"] == [f"arn:aws:s3:::{settings.minio_bucket_name}/*"]
    assert "생성 완료" in capsys.readouterr().out


def test_tenant_upload_keys_are_covered():
    """업로드 키 형식({tenant_id}/{context}/…)이 공개 읽기 범위 안에 있다."""
    resource = init_minio.public_read_resource("cms-media")
    prefix = resource.removeprefix("arn:aws:s3:::cms-media/")
    assert prefix == "*"


def test_never_allows_listing():
    fake = _FakeMinio()
    init_minio.main(fake)
    actions = [a for st in _statements(fake) for a in st["Action"]]
    assert "s3:ListBucket" not in actions


def test_idempotent_and_keeps_existing_statements(capsys):
    existing = {
        "Effect": "Allow",
        "Principal": {"AWS": ["*"]},
        "Action": ["s3:GetObject"],
        "Resource": [f"arn:aws:s3:::{settings.minio_bucket_name}/templates/*"],
    }
    fake = _FakeMinio(
        exists=True, policy={"Version": "2012-10-17", "Statement": [existing]}
    )
    assert init_minio.main(fake) == 0
    assert init_minio.main(fake) == 0
    statements = _statements(fake)
    assert statements[0] == existing
    assert len(statements) == 2
    assert fake.policy_puts == 1
    out = capsys.readouterr().out
    assert "이미 존재" in out and "이미 적용됨" in out


def test_accepts_string_action_and_resource():
    policy = {
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "s3:GetObject",
                "Resource": f"arn:aws:s3:::{settings.minio_bucket_name}/*",
            }
        ]
    }
    fake = _FakeMinio(exists=True, policy=policy)
    assert init_minio.ensure_public_read(fake, settings.minio_bucket_name) is False
    assert fake.policy_puts == 0


def test_failure_returns_error_code(capsys):
    class _Broken(_FakeMinio):
        def create_bucket(self, *, Bucket):  # noqa: N803
            raise ClientError({"Error": {"Code": "AccessDenied"}}, "Create")

    assert init_minio.main(_Broken()) == 1
    assert "실패" in capsys.readouterr().out


def test_uses_app_settings_client(monkeypatch):
    fake = _FakeMinio()
    monkeypatch.setattr(image_service, "_get_s3_client", lambda: fake)
    monkeypatch.setattr(settings, "minio_bucket_name", "other-bucket")
    assert init_minio.main() == 0
    assert "other-bucket" in fake.buckets
    assert _statements(fake)[0]["Resource"] == ["arn:aws:s3:::other-bucket/*"]
