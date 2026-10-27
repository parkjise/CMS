"""운영 설정 안전 점검 — APP_ENV=production 에서 개발 기본값이면 기동 거부 (배포 B2)."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings

GOOD = {
    "app_env": "production",
    "app_secret_key": "p" * 48,
    "database_url": "postgresql+asyncpg://cms_app:pw@postgres:5432/cms_db",
    "allowed_origins": "https://cms.kr,https://admin.cms.kr,https://system.cms.kr",
    "admin_base_url": "https://admin.cms.kr",
    "client_base_url": "https://cms.kr",
    "cdn_base_url": "https://cms.kr/cms-media",
    "cookie_domain": ".cms.kr",
    "super_admin_password": "Very-Strong-Password-1",
    "recaptcha_secret_key": "recaptcha-secret",
    "notification_mode": "live",
    "email_mode": "live",
    "payment_mode": "live",
    "social_mode": "live",
    "domain_mode": "live",
}


def _settings(**overrides) -> Settings:
    return Settings(_env_file=None, **{**GOOD, **overrides})  # type: ignore[call-arg]


def test_production_with_real_values_starts():
    assert _settings().production_problems() == {}


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("app_secret_key", "change-me-in-production-32-chars-min"),
        ("super_admin_password", "change-me"),
        ("super_admin_password", ""),
        ("cookie_domain", ""),
        ("recaptcha_secret_key", ""),
        ("allowed_origins", "http://localhost:3000"),
        ("cdn_base_url", "http://localhost:9000/cms-media"),
        ("client_base_url", "http://localhost:3000"),
        ("notification_mode", "test"),
        ("payment_mode", "test"),
        ("social_mode", "test"),
    ],
)
def test_production_rejects_dev_value(field, value):
    with pytest.raises(ValidationError, match=field.upper()):
        _settings(**{field: value})


def test_lists_every_problem_at_once():
    with pytest.raises(ValidationError) as exc:
        _settings(cookie_domain="", email_mode="test", domain_mode="test")
    text = str(exc.value)
    for name in ("COOKIE_DOMAIN", "EMAIL_MODE", "DOMAIN_MODE"):
        assert name in text


def test_skip_allows_intentional_exception():
    s = _settings(payment_mode="test", production_check_skip="payment_mode")
    assert s.payment_mode == "test"
    with pytest.raises(ValidationError, match="DOMAIN_MODE"):
        _settings(
            payment_mode="test",
            domain_mode="test",
            production_check_skip="payment_mode",
        )


def test_development_keeps_dev_defaults():
    s = Settings(  # type: ignore[call-arg]
        _env_file=None,
        app_env="development",
        app_secret_key="d" * 40,
        database_url="postgresql+asyncpg://u:p@localhost/db",
    )
    assert s.notification_mode == "test"
    assert (
        "cookie_domain" in s.production_problems()
    )  # 점검 목록은 계산되지만 막지 않음
