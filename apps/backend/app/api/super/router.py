from fastapi import APIRouter

from app.api.super.endpoints import (
    announcements,
    auth,
    dashboard,
    features,
    health,
    monitoring,
    tenants,
)

super_router = APIRouter()

super_router.include_router(health.router)
super_router.include_router(auth.router)
super_router.include_router(tenants.router)
super_router.include_router(features.router)
super_router.include_router(features.tenant_router)
super_router.include_router(announcements.router)
super_router.include_router(dashboard.router)
super_router.include_router(monitoring.router)
