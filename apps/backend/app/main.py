from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api.super.router import super_router
from app.api.v1.endpoints.analytics import public_router as analytics_public_router
from app.api.v1.endpoints.inquiries import public_router as inquiry_public_router
from app.api.v1.endpoints.public import router as public_site_router
from app.api.v1.endpoints.seo import public_router as seo_public_router
from app.api.v1.endpoints.templates import public_router as template_public_router
from app.api.v1.router import api_router
from app.api.webhook.tosspayments import router as tosspayments_webhook_router
from app.core.config import settings
from app.core.observability import setup_observability
from app.core.redis import close_redis

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_redis()


app = FastAPI(
    title="CMS API",
    version="1.0.0",
    docs_url="/docs" if settings.app_env != "production" else None,
    redoc_url="/redoc" if settings.app_env != "production" else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# 관측성: Prometheus /metrics + Sentry (T-083)
setup_observability(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def super_admin_ip_whitelist(request: Request, call_next):
    if request.url.path.startswith("/api/super/"):
        allowed = settings.super_admin_allowed_ips
        if allowed:
            allowed_set = {ip.strip() for ip in allowed.split(",")}
            forwarded = request.headers.get("X-Forwarded-For")
            client_ip = forwarded.split(",")[0].strip() if forwarded else (
                request.client.host if request.client else ""
            )
            if client_ip not in allowed_set:
                return JSONResponse(
                    {"success": False, "error": {"code": "FORBIDDEN"}},
                    status_code=403,
                )
    return await call_next(request)


app.include_router(api_router, prefix="/api/v1")
app.include_router(super_router, prefix="/api/super/v1")
app.include_router(tosspayments_webhook_router, prefix="/api/webhook")
app.include_router(analytics_public_router, prefix="/api/public")
app.include_router(inquiry_public_router, prefix="/api/public")
app.include_router(seo_public_router, prefix="/api/public")
app.include_router(public_site_router, prefix="/api/public")
app.include_router(template_public_router, prefix="/api/public")


@app.get("/health")
async def root_health():
    return {"status": "ok"}
