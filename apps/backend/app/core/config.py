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
    allowed_origins: str = "http://localhost:3000,http://localhost:3001,http://localhost:3002"

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

    # 알림톡
    kakao_api_key: str = ""
    kakao_sender_key: str = ""

    # 슈퍼 어드민
    super_admin_email: str = "admin@cms.io"
    super_admin_password: str = ""

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",")]


settings = Settings()
