"""게시판 읽기 권한 — 회원만 읽는 게시판의 공개 API 검사 (T-150, 기획서 BM-10 · 11.1).

방문자 회원 토큰만 받는다. 관리자 토큰 · 다른 사업체 회원 토큰은 403, 토큰이 없거나
만료 · 탈퇴 · 비밀번호 변경 전 토큰이면 401. 회원 기능을 끈 사업체는 아무도 읽지 못한다.
"""

from uuid import UUID

from fastapi import HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import SITE_MEMBER_ROLE, decode_token, issued_before
from app.models.board import Board
from app.models.tenant import Tenant
from app.services import member_auth as member_auth_service
from app.services import member_features

MSG_MEMBER_REQUIRED = "회원만 볼 수 있는 게시판입니다. 로그인해 주세요."
MSG_FORBIDDEN = "이 게시판을 볼 수 있는 권한이 없습니다."
# 회원 전용 응답은 브라우저 · 중간 캐시에 남기지 않는다
PRIVATE_CACHE = "private, no-store"


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "UNAUTHORIZED", "message": MSG_MEMBER_REQUIRED},
    )


def _forbidden() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"code": "FORBIDDEN", "message": MSG_FORBIDDEN},
    )


async def ensure_member_reader(
    db: AsyncSession,
    board: Board,
    credentials: HTTPAuthorizationCredentials | None,
) -> None:
    """이 게시판 사업체의 로그인한 회원인지 — 아니면 401 · 403."""
    if credentials is None:
        raise _unauthorized()
    try:
        payload = decode_token(credentials.credentials)
    except ValueError as e:
        raise _unauthorized() from e
    if payload.get("role") != SITE_MEMBER_ROLE or payload.get("type"):
        raise _forbidden()
    if payload.get("tenant_id") != str(board.tenant_id):
        raise _forbidden()
    tenant = await db.get(Tenant, board.tenant_id)
    if tenant is None or not (await member_features.flags_for(db, tenant)).enabled:
        raise _forbidden()
    try:
        member_id = UUID(str(payload.get("sub")))
    except ValueError as e:
        raise _unauthorized() from e
    member = await member_auth_service.get_active_member(db, board.tenant_id, member_id)
    if member is None or issued_before(payload, member.password_changed_at):
        raise _unauthorized()
