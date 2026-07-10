"""T-106 대칭키 암호화 (AES-256-GCM).

빌링키 등 민감 문자열을 저장 시 암호화한다. 암호문은 `enc:v1:<base64>` 형식이며,
프리픽스가 없는 값은 평문으로 간주하여 하위호환 복호화한다.

키는 `settings.billing_key_encryption_key`(base64 32B)를 사용하고, 미설정 시
`app_secret_key`에서 SHA-256으로 32바이트 키를 파생한다.
"""

import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings

_PREFIX = "enc:v1:"
_NONCE_BYTES = 12


def _key() -> bytes:
    configured = settings.billing_key_encryption_key
    if configured:
        try:
            key = base64.b64decode(configured)
            if len(key) == 32:
                return key
        except Exception:
            pass
    # 전용 키 미설정/부적합 시 app_secret_key에서 파생 (AES-256)
    return hashlib.sha256(settings.app_secret_key.encode()).digest()


def encrypt_secret(plaintext: str) -> str:
    """평문을 AES-256-GCM으로 암호화하여 `enc:v1:<base64>` 반환."""
    if plaintext is None:
        return plaintext
    nonce = os.urandom(_NONCE_BYTES)
    ct = AESGCM(_key()).encrypt(nonce, plaintext.encode(), None)
    return _PREFIX + base64.b64encode(nonce + ct).decode()


def decrypt_secret(value: str | None) -> str | None:
    """`enc:v1:` 암호문은 복호화, 프리픽스 없으면 평문으로 반환(하위호환)."""
    if value is None or not value.startswith(_PREFIX):
        return value
    raw = base64.b64decode(value[len(_PREFIX) :])
    nonce, ct = raw[:_NONCE_BYTES], raw[_NONCE_BYTES:]
    return AESGCM(_key()).decrypt(nonce, ct, None).decode()


def is_encrypted(value: str | None) -> bool:
    return bool(value) and value.startswith(_PREFIX)
