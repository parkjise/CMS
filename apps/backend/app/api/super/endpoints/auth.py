from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_super_admin
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.auth import LoginResponse, SuperLoginRequest, UserResponse
from app.schemas.common import ApiResponse
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["super-auth"])


@router.post("/login", response_model=ApiResponse[LoginResponse])
async def super_login(
    body: SuperLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """슈퍼 어드민 로그인 (테넌트 불필요). SUPER_ADMIN 역할만 허용."""
    try:
        user = await auth_service.authenticate_super_admin(
            db, body.email, body.password
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
        ) from exc

    await auth_service.update_last_login(db, user.id)
    access_token = create_access_token(
        user_id=user.id,
        tenant_id=None,
        role=user.role,
        is_super_admin=True,
    )
    return ApiResponse.ok(
        LoginResponse(
            user=UserResponse.model_validate(user),
            access_token=access_token,
        )
    )


@router.get("/me", response_model=ApiResponse[UserResponse])
async def super_me(
    current_user: User = Depends(get_super_admin),
):
    return ApiResponse.ok(UserResponse.model_validate(current_user))
