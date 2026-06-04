from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.sns import (
    SnsSettingsResponse,
    SnsSettingsUpdate,
    TestUrlRequest,
    TestUrlResponse,
)
from app.services import sns as sns_service

router = APIRouter(prefix="/sns-settings", tags=["sns"])


@router.get("", response_model=ApiResponse[SnsSettingsResponse | None])
async def get_sns_settings(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    setting = await sns_service.get_sns_settings(db)
    return ApiResponse.ok(
        SnsSettingsResponse.model_validate(setting) if setting else None
    )


@router.put("", response_model=ApiResponse[SnsSettingsResponse])
async def update_sns_settings(
    body: SnsSettingsUpdate,
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    try:
        setting = await sns_service.update_sns_settings(
            db, current_user.tenant_id, body
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return ApiResponse.ok(SnsSettingsResponse.model_validate(setting))


@router.post("/test-url", response_model=ApiResponse[TestUrlResponse])
async def test_url(
    body: TestUrlRequest,
    current_user: User = Depends(get_current_user),
):
    is_valid = await sns_service.test_url_validity(body.url)
    return ApiResponse.ok(TestUrlResponse(url=body.url, is_valid=is_valid))
