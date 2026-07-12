from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, get_db_with_rls
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.seo import SeoSettingsResponse, SeoSettingsUpdate
from app.services import seo as seo_service

router = APIRouter(prefix="/seo-settings", tags=["seo"])
public_router = APIRouter(tags=["public"])


@router.get("", response_model=ApiResponse[SeoSettingsResponse | None])
async def get_seo_settings(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    setting = await seo_service.get_seo_settings(db)
    return ApiResponse.ok(
        SeoSettingsResponse.model_validate(setting) if setting else None
    )


@router.put("", response_model=ApiResponse[SeoSettingsResponse])
async def update_seo_settings(
    body: SeoSettingsUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    try:
        setting = await seo_service.update_seo_settings(
            db, current_user.tenant_id, body
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return ApiResponse.ok(SeoSettingsResponse.model_validate(setting))


@public_router.get("/sitemap/{tenant_slug}.xml", response_class=PlainTextResponse)
async def get_sitemap(
    tenant_slug: str,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import text

    await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    xml = await seo_service.generate_sitemap_xml(db, tenant_slug)
    if not xml:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")
    return Response(content=xml, media_type="application/xml")
