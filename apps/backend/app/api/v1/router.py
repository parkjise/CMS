from fastapi import APIRouter

from app.api.v1.endpoints import (
    analytics,
    auth,
    dashboard,
    edit,
    gallery,
    inquiries,
    notification_settings,
    notifications,
    sections,
    seo,
    sns,
    upload,
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(sections.router)
api_router.include_router(inquiries.router)
api_router.include_router(sns.router)
api_router.include_router(seo.router)
api_router.include_router(dashboard.router)
api_router.include_router(notifications.router)
api_router.include_router(notification_settings.router)
api_router.include_router(edit.router)
api_router.include_router(analytics.router)
api_router.include_router(upload.router)
api_router.include_router(gallery.router)


# 헬스체크 (인증 불필요)
@api_router.get("/health", tags=["system"])
async def health():
    return {"status": "ok"}
