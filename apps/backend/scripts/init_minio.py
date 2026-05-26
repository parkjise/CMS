"""
MinIO 버킷 및 초기 설정 스크립트.
docker compose up 후 한 번 실행: python scripts/init_minio.py
"""

import sys

import boto3
from botocore.exceptions import ClientError

ENDPOINT = "http://localhost:9000"
ACCESS_KEY = "minioadmin"
SECRET_KEY = "minioadmin"
BUCKET_NAME = "cms-media"

BUCKET_POLICY = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {"AWS": ["*"]},
            "Action": ["s3:GetObject"],
            "Resource": [f"arn:aws:s3:::{BUCKET_NAME}/public/*"],
        }
    ],
}


def main() -> None:
    import json

    s3 = boto3.client(
        "s3",
        endpoint_url=ENDPOINT,
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
    )

    # 버킷 생성
    try:
        s3.create_bucket(Bucket=BUCKET_NAME)
        print(f"✅ 버킷 '{BUCKET_NAME}' 생성 완료")
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
            print(f"ℹ️  버킷 '{BUCKET_NAME}' 이미 존재")
        else:
            print(f"❌ 버킷 생성 실패: {e}")
            sys.exit(1)

    # public/* 읽기 허용 정책 적용
    try:
        s3.put_bucket_policy(
            Bucket=BUCKET_NAME,
            Policy=json.dumps(BUCKET_POLICY),
        )
        print(f"✅ 버킷 정책 적용 완료 (public/* 읽기 허용)")
    except ClientError as e:
        print(f"❌ 정책 적용 실패: {e}")
        sys.exit(1)

    print("\n🎉 MinIO 초기화 완료")


if __name__ == "__main__":
    main()
