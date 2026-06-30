from fastapi import APIRouter

from app.api.super.endpoints import auth, health, tenants

super_router = APIRouter()

super_router.include_router(health.router)
super_router.include_router(auth.router)
super_router.include_router(tenants.router)
