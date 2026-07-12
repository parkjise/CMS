from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # 앱
    app_env: str = "development"
    app_secret_key: str
    allowed_origins: str = (
        "http://localhost:3000,http://localhost:3001,http://localhost:3002"
    )

    # DB
    database_url: str
    database_pool_size: int = 10
    database_max_overflow: int = 20

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # JWT
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket_name: str = "cms-media"
    minio_use_ssl: bool = False
    cdn_base_url: str = "http://localhost:9000/cms-media"

    # OpenAI
    openai_api_key: str = ""
    # AI 비용 최적화 (T-073)
    ai_cache_ttl_seconds: int = 3600  # 동일 입력 문구 추천 캐시 (1시간)
    ai_rate_limit_per_minute: int = 10  # 테넌트당 분당 AI 호출 한도 (비정상 사용 차단)

    # 알림톡
    kakao_api_key: str = ""
    kakao_sender_key: str = ""

    # 네이버 클라우드 SENS (알림톡/SMS 발송)
    ncloud_sens_service_id: str = ""
    ncloud_sens_sms_service_id: str = ""
    ncloud_sens_access_key: str = ""
    ncloud_sens_secret_key: str = ""
    ncloud_sens_from_no: str = ""
    # "test" | "live" — test 모드는 외부 API 호출 없이 stub 응답
    notification_mode: str = "test"

    # 토스페이먼츠 정기결제 (T-096)
    toss_client_key: str = ""
    toss_secret_key: str = ""
    toss_webhook_secret: str = ""
    # "test" | "live" — test 모드는 토스 API 호출 없이 stub 응답
    payment_mode: str = "test"

    # 이메일 발송 (T-098, AWS SES)
    aws_ses_region: str = "ap-northeast-2"
    aws_ses_from_email: str = "no-reply@cms.io"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    # "test" | "live" — test 모드는 SES 호출 없이 stub 응답
    email_mode: str = "test"

    # 무료 체험 (T-099)
    trial_days: int = 14

    # 빌링키 암호화 키 (T-106, base64 인코딩된 32바이트). 미설정 시 app_secret 파생.
    billing_key_encryption_key: str = ""

    # 커스텀 도메인 (T-100)
    # "test" | "live" — test 모드는 DNS/certbot/nginx 호출 없이 stub
    domain_mode: str = "test"
    domain_cname_target: str = "cms.example.com"
    nginx_sites_dir: str = "/etc/nginx/sites-enabled"
    ssl_renew_before_days: int = 30

    # 쿠키 & URL
    cookie_domain: str = ""  # 로컬: "" → None, 프로덕션: ".mysite.com"
    admin_base_url: str = "http://localhost:3001"
    client_base_url: str = "http://localhost:3000"

    # 슈퍼 어드민
    super_admin_email: str = "admin@cms.io"
    super_admin_password: str = ""
    # 빈 문자열 = 모든 IP 허용 / 쉼표 구분: "1.2.3.4,5.6.7.8"
    super_admin_allowed_ips: str = ""
    # 슈퍼 어드민 액세스 토큰 만료 (분) — 보안 강화로 짧게 유지
    super_admin_token_expire_minutes: int = 5

    # reCAPTCHA (없으면 검증 스킵)
    recaptcha_secret_key: str = ""
    recaptcha_min_score: float = 0.5

    # 관측성 (T-083). SENTRY_DSN 미설정 시 Sentry 비활성(no-op).
    sentry_dsn: str = ""
    sentry_environment: str = ""
    sentry_traces_sample_rate: float = 0.1

    @field_validator("app_secret_key")
    @classmethod
    def _validate_secret_key_strength(cls, v: str) -> str:
        # OWASP: JWT 서명 키는 최소 32자 이상 (T-079 보안 점검)
        if len(v) < 32:
            raise ValueError(
                "APP_SECRET_KEY는 최소 32자 이상이어야 합니다. "
                "(JWT 서명 키 강도 요구사항)"
            )
        return v

    @property
    def cors_origins(self) -> list[str]:
        origins = [o.strip() for o in self.allowed_origins.split(",")]
        # admin/client URL이 allowed_origins에 없으면 자동 추가
        for url in (self.admin_base_url, self.client_base_url):
            if url and url not in origins:
                origins.append(url)
        return origins

    @property
    def cookie_domain_value(self) -> str | None:
        return self.cookie_domain or None


settings = Settings()
