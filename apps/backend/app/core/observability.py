"""T-083 관측성(Observability) 설정.

- Prometheus 메트릭: HTTP 요청 지연(P95용 히스토그램) + 상태코드(에러율용).
  `/metrics` 엔드포인트로 노출 → Prometheus가 스크레이프.
- Sentry: 에러 추적. SENTRY_DSN이 설정된 경우에만 활성화(미설정 시 no-op).

둘 다 환경변수 기반으로 선택 활성화되며, 미설정 시 앱 동작에 영향 없음.
"""

import time

from fastapi import FastAPI, Request
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Histogram,
    generate_latest,
)
from starlette.responses import Response

from app.core.config import settings

# 프로세스 전용 레지스트리 (테스트 간 중복 등록 방지 위해 명시적 생성)
registry = CollectorRegistry()

REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP 요청 처리 시간(초)",
    labelnames=("method", "handler", "status"),
    registry=registry,
    # P95/P99 관측에 적합한 버킷
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

REQUEST_COUNT = Counter(
    "http_requests_total",
    "HTTP 요청 수",
    labelnames=("method", "handler", "status"),
    registry=registry,
)


def _handler_label(request: Request) -> str:
    """라우트 경로 템플릿을 라벨로 사용(고카디널리티 방지).

    매칭된 라우트가 없으면 'unmatched'로 집계.
    """
    route = request.scope.get("route")
    if route is not None and getattr(route, "path", None):
        return route.path
    return "unmatched"


def _init_sentry() -> bool:
    """SENTRY_DSN이 있으면 Sentry 초기화. 반환값: 활성화 여부."""
    if not settings.sentry_dsn:
        return False
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment or settings.app_env,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,
    )
    return True


def setup_observability(app: FastAPI) -> None:
    """FastAPI 앱에 메트릭 미들웨어·/metrics 엔드포인트·Sentry를 설치."""
    _init_sentry()

    @app.middleware("http")
    async def _prometheus_middleware(request: Request, call_next):
        # /metrics 자체는 집계 제외
        if request.url.path == "/metrics":
            return await call_next(request)

        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            elapsed = time.perf_counter() - start
            labels = (request.method, _handler_label(request), str(status))
            REQUEST_DURATION.labels(*labels).observe(elapsed)
            REQUEST_COUNT.labels(*labels).inc()

    @app.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        return Response(generate_latest(registry), media_type=CONTENT_TYPE_LATEST)
