from fastapi import APIRouter

from app.api.super.endpoints import (
    announcements,
    audit,
    auth,
    dashboard,
    domains,
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
super_router.include_router(audit.router)
super_router.include_router(domains.router)
