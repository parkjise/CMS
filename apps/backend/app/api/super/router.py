from fastapi import APIRouter

from app.api.super.endpoints import health

super_router = APIRouter()

super_router.include_router(health.router)
