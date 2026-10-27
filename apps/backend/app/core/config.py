from pydantic import field_validator, model_validator
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
    # 앱 접속 계정 — 일반 권한(슈퍼유저 · BYPASSRLS 아님)이어야 RLS 가 실제로 적용된다
    database_url: str
    # 마이그레이션 · 계정 생성용 소유자 계정 (비우면 database_url 사용).
    # scripts/init_db_roles.py 가 이 계정으로 database_url 의 계정을 만든다
    migration_database_url: str = ""
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
    # 템플릿 샘플 이미지 공용 주소 (기획서 11.8, T-120). 비우면 클라이언트
    # public 의 상대 주소(/templates/...) 그대로, 운영은 CDN_BASE_URL 과 같은 값
    template_asset_base_url: str = ""

    # OpenAI
    openai_api_key: str = ""
    # AI 비용 최적화 (T-073)
    ai_cache_ttl_seconds: int = 3600  # 동일 입력 문구 추천 캐시 (1시간)
    ai_rate_limit_per_minute: int = 10  # 테넌트당 분당 AI 호출 한도 (비정상 사용 차단)

    # 알림톡
    kakao_api_key: str = ""
    # 방문자 소셜 로그인 (T-110, 오픈 이슈 #24 — 운영사 공용 앱 1개)
    # "test" | "live" — test 모드는 카카오 · 네이버 호출 없이 가짜 계정으로 동작
    social_mode: str = "test"
    kakao_rest_api_key: str = ""
    kakao_client_secret: str = ""
    naver_client_id: str = ""
    naver_client_secret: str = ""
    # 공용 콜백 페이지 (메인 도메인) — 카카오 · 네이버 개발자 콘솔에 등록하는 주소
    social_redirect_uri: str = "http://localhost:3000/member/social/callback"
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
    # 저장 후 홈페이지(Next.js) 캐시를 바로 비우는 내부 호출 (T-066-A)
    # 운영 compose: http://client:3000 — 홈페이지에도 같은 REVALIDATE_SECRET
    client_internal_url: str = "http://localhost:3000"
    revalidate_secret: str = ""

    # 슈퍼 어드민
    super_admin_email: str = "admin@cms.io"
    super_admin_password: str = ""
    # 빈 문자열 = 모든 IP 허용 / 쉼표 구분: "1.2.3.4,5.6.7.8"
    super_admin_allowed_ips: str = ""
    # 슈퍼 어드민 액세스 토큰 만료 (분) — 보안 강화로 짧게 유지
    super_admin_token_expire_minutes: int = 5

    # 요청 한도 (IP 당) — 운영 기본값.
    # E2E CI 처럼 한 IP 에서 많이 부를 때만 올린다 (T-078-A)
    login_rate_limit: str = "10/minute"
    inquiry_rate_limit: str = "3/minute"

    # reCAPTCHA (없으면 검증 스킵)
    recaptcha_secret_key: str = ""
    recaptcha_min_score: float = 0.5

    # 관측성 (T-083). SENTRY_DSN 미설정 시 Sentry 비활성(no-op).
    sentry_dsn: str = ""
    sentry_environment: str = ""
    sentry_traces_sample_rate: float = 0.1

    # 운영 안전 점검(production_problems)에서 일부러 건너뛸 항목 (쉼표 구분).
    # 예: 결제를 아직 열지 않을 때 PRODUCTION_CHECK_SKIP=payment_mode
    production_check_skip: str = ""

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

    def production_problems(self) -> dict[str, str]:
        """APP_ENV=production 인데 개발 기본값이 남은 설정 → {항목: 이유}."""
        problems: dict[str, str] = {}
        if "change-me" in self.app_secret_key:
            problems["app_secret_key"] = "예시 값(change-me…) 그대로입니다"
        if self.super_admin_password in ("", "change-me"):
            problems["super_admin_password"] = "슈퍼 어드민 비밀번호가 기본값입니다"
        if not self.cookie_domain:
            problems["cookie_domain"] = (
                "홈페이지 ↔ 관리자 로그인 공유용 상위 도메인이 없습니다"
            )
        if not self.revalidate_secret:
            problems["revalidate_secret"] = (
                "비어 있으면 저장한 내용이 홈페이지에 최대 1분 늦게 반영됩니다"
            )
        if not self.recaptcha_secret_key:
            problems["recaptcha_secret_key"] = (
                "비어 있으면 문의 폼이 검증 없이 통과합니다"
            )
        for name in (
            "allowed_origins",
            "cdn_base_url",
            "admin_base_url",
            "client_base_url",
            "client_internal_url",
        ):
            if "localhost" in getattr(self, name):
                problems[name] = "localhost 주소가 남아 있습니다"
        for name in (
            "notification_mode",
            "email_mode",
            "payment_mode",
            "social_mode",
            "domain_mode",
        ):
            if getattr(self, name) != "live":
                problems[name] = "test 모드 — 실제 발송 · 연동이 되지 않습니다 (live)"
        skip = {k.strip() for k in self.production_check_skip.split(",") if k.strip()}
        return {k: v for k, v in problems.items() if k not in skip}

    @model_validator(mode="after")
    def _validate_production(self) -> "Settings":
        """운영에서 개발 설정이 남아 있으면 기동하지 않는다 (배포 체크리스트 B2)."""
        if self.app_env == "production":
            problems = self.production_problems()
            if problems:
                lines = "\n".join(f"  - {k.upper()}: {v}" for k, v in problems.items())
                raise ValueError(
                    "운영(APP_ENV=production) 설정을 확인하세요:\n"
                    + lines
                    + "\n  (의도한 경우 PRODUCTION_CHECK_SKIP 에 항목 이름)"
                )
        return self

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
