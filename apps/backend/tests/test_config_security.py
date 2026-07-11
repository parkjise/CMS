"""T-079 보안 점검: 설정 강도 검증 단위 테스트.

APP_SECRET_KEY(JWT 서명 키)가 최소 32자 이상이어야 한다는
OWASP 요구사항을 config.Settings 검증기가 강제하는지 확인한다.
"""

import pytest
from pydantic import ValidationError

from app.core.config import Settings

# Settings는 필수 필드가 많아 직접 인스턴스화가 어려우므로,
# 필수 환경 값을 갖춘 기본 kwargs를 구성한다.
_BASE_KWARGS = {
    "database_url": "postgresql+asyncpg://u:p@localhost:5432/db",
}


def test_secret_key_shorter_than_32_is_rejected():
    """실패: 32자 미만 시크릿 키는 ValidationError."""
    with pytest.raises(ValidationError) as exc:
        Settings(app_secret_key="short-key", **_BASE_KWARGS)
    assert "32자" in str(exc.value)


def test_secret_key_exactly_32_is_accepted():
    """정상: 32자 시크릿 키 허용."""
    settings = Settings(app_secret_key="a" * 32, **_BASE_KWARGS)
    assert len(settings.app_secret_key) == 32


def test_secret_key_longer_than_32_is_accepted():
    """정상: 32자 초과 허용."""
    settings = Settings(app_secret_key="b" * 48, **_BASE_KWARGS)
    assert settings.app_secret_key == "b" * 48
