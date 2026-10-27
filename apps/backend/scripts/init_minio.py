"""
MinIO 버킷 및 초기 설정 스크립트.
docker compose up 후 한 번 실행 (운영도 배포 전 한 번): python scripts/init_minio.py

- 버킷이 없으면 만든다 (MINIO_BUCKET_NAME)
- 버킷 안 파일은 모두 공개 홈페이지 이미지(섹션 · 갤러리 · 썸네일 · 템플릿 샘플)라
  익명 읽기(s3:GetObject)를 허용한다. 목록 조회(ListBucket)는 허용하지 않는다
- 접속 정보는 앱 설정(.env)을 그대로 쓴다. 여러 번 실행해도 안전 — 기존 정책 항목은 유지
"""

import json
import sys
from pathlib import Path
from typing import Any

# `python scripts/...` 로 바로 실행해도 app 패키지를 찾도록 (seed.py 와 같은 방식)
sys.path.insert(0, str(Path(__file__).parent.parent))

from botocore.exceptions import ClientError

from app.core.config import settings
from app.services import image as image_service


def public_read_resource(bucket: str) -> str:
    return f"arn:aws:s3:::{bucket}/*"


def ensure_bucket(client: Any, bucket: str) -> bool:
    """버킷이 없으면 만든다 → 새로 만들었으면 True."""
    try:
        client.create_bucket(Bucket=bucket)
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] in (
            "BucketAlreadyOwnedByYou",
            "BucketAlreadyExists",
        ):
            return False
        raise


def ensure_public_read(client: Any, bucket: str) -> bool:
    """버킷 전체 익명 읽기 정책을 넣는다 → 바꿨으면 True (이미 있으면 False)."""
    resource = public_read_resource(bucket)
    try:
        policy = json.loads(client.get_bucket_policy(Bucket=bucket)["Policy"])
    except ClientError as e:
        if e.response["Error"]["Code"] != "NoSuchBucketPolicy":
            raise
        policy = {"Version": "2012-10-17", "Statement": []}

    for st in policy.get("Statement", []):
        resources = st.get("Resource", [])
        resources = [resources] if isinstance(resources, str) else resources
        actions = st.get("Action", [])
        actions = [actions] if isinstance(actions, str) else actions
        if (
            st.get("Effect") == "Allow"
            and resource in resources
            and "s3:GetObject" in actions
        ):
            return False

    policy.setdefault("Statement", []).append(
        {
            "Effect": "Allow",
            "Principal": {"AWS": ["*"]},
            "Action": ["s3:GetObject"],
            "Resource": [resource],
        }
    )
    client.put_bucket_policy(Bucket=bucket, Policy=json.dumps(policy))
    return True


def main(client: Any = None) -> int:
    bucket = settings.minio_bucket_name
    client = client or image_service._get_s3_client()
    try:
        created = ensure_bucket(client, bucket)
        print(f"✅ 버킷 '{bucket}' {'생성 완료' if created else '이미 존재'}")
        changed = ensure_public_read(client, bucket)
        state = "적용 완료" if changed else "이미 적용됨"
        print(f"✅ 공개 읽기 정책 {state} ({bucket}/* GetObject, 목록 조회는 불가)")
    except ClientError as e:
        print(f"❌ MinIO 초기화 실패: {e}")
        return 1
    print("\n🎉 MinIO 초기화 완료")
    return 0


if __name__ == "__main__":
    sys.exit(main())
