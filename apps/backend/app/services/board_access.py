"""게시판 권한 — 회원만 읽기 · 회원 글쓰기의 서버 검사 (T-150, 기획서 BM-10 · 11.1).

방문자 회원 토큰만 받는다. 관리자 토큰 · 다른 사업체 회원 토큰은 403, 토큰이 없거나
만료 · 탈퇴 · 비밀번호 변경 전 토큰이면 401. 회원 기능을 끈 사업체는 아무도 읽지 못한다.
회원 글쓰기는 병원 업종 · 필수 칸이 있는 게시판에서 막는다 (D-14, 의료법 확인 전).
"""

from uuid import UUID

from fastapi import HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import SITE_MEMBER_ROLE, decode_token, issued_before
from app.models.board import Board
from app.models.site_member import SiteMember
from app.models.tenant import Tenant
from app.schemas.board import BoardPermissions
from app.services import board_field as field_service
from app.services import member_auth as member_auth_service
from app.services import member_features

PERMISSIONS_KEY = "permissions"
MEMBER = "MEMBER"
HOSPITAL = "HOSPITAL"

MSG_MEMBER_REQUIRED = "회원만 볼 수 있는 게시판입니다. 로그인해 주세요."
MSG_LOGIN_TO_WRITE = "로그인한 회원만 글을 쓸 수 있습니다."
MSG_FORBIDDEN = "이 게시판을 볼 수 있는 권한이 없습니다."
MSG_WRITE_FORBIDDEN = "이 게시판에는 글을 쓸 수 없습니다."
MSG_MEMBER_FEATURE_OFF = "방문자 회원 기능이 꺼져 있어 회원 권한을 줄 수 없습니다."
MSG_HOSPITAL = "병원 업종은 홈페이지 회원 글쓰기를 쓸 수 없습니다."
MSG_REQUIRED_FIELDS = (
    "필수 칸이 있는 게시판은 회원 글쓰기를 켤 수 없습니다. "
    "필드 관리에서 필수를 꺼 주세요."
)
# 회원 전용 응답은 브라우저 · 중간 캐시에 남기지 않는다
PRIVATE_CACHE = "private, no-store"


def permissions_of(board: Board) -> BoardPermissions:
    return BoardPermissions(**(board.settings or {}).get(PERMISSIONS_KEY, {}))


def _error(code: int, message: str) -> HTTPException:
    name = "UNAUTHORIZED" if code == status.HTTP_401_UNAUTHORIZED else "FORBIDDEN"
    return HTTPException(status_code=code, detail={"code": name, "message": message})


async def _member_from_token(
    db: AsyncSession,
    board: Board,
    credentials: HTTPAuthorizationCredentials | None,
    login_message: str,
    forbidden_message: str,
) -> SiteMember:
    """이 게시판 사업체의 로그인한 회원 — 아니면 401 · 403."""
    unauthorized = _error(status.HTTP_401_UNAUTHORIZED, login_message)
    forbidden = _error(status.HTTP_403_FORBIDDEN, forbidden_message)
    if credentials is None:
        raise unauthorized
    try:
        payload = decode_token(credentials.credentials)
    except ValueError as e:
        raise unauthorized from e
    if payload.get("role") != SITE_MEMBER_ROLE or payload.get("type"):
        raise forbidden
    if payload.get("tenant_id") != str(board.tenant_id):
        raise forbidden
    tenant = await db.get(Tenant, board.tenant_id)
    if tenant is None or not (await member_features.flags_for(db, tenant)).enabled:
        raise forbidden
    try:
        member_id = UUID(str(payload.get("sub")))
    except ValueError as e:
        raise unauthorized from e
    member = await member_auth_service.get_active_member(db, board.tenant_id, member_id)
    if member is None or issued_before(payload, member.password_changed_at):
        raise unauthorized
    return member


async def ensure_member_reader(
    db: AsyncSession,
    board: Board,
    credentials: HTTPAuthorizationCredentials | None,
) -> SiteMember:
    return await _member_from_token(
        db, board, credentials, MSG_MEMBER_REQUIRED, MSG_FORBIDDEN
    )


async def member_writer(
    db: AsyncSession,
    board: Board,
    credentials: HTTPAuthorizationCredentials | None,
) -> SiteMember:
    """홈페이지에서 글을 쓰는 회원 — 회원 글쓰기를 켠 게시판 · 병원 업종이 아닐 때만."""
    member = await _member_from_token(
        db, board, credentials, MSG_LOGIN_TO_WRITE, MSG_WRITE_FORBIDDEN
    )
    if permissions_of(board).write != MEMBER:
        raise _error(status.HTTP_403_FORBIDDEN, MSG_WRITE_FORBIDDEN)
    tenant = await db.get(Tenant, board.tenant_id)
    if tenant is None or tenant.template_type == HOSPITAL:
        raise _error(status.HTTP_403_FORBIDDEN, MSG_HOSPITAL)
    return member


async def post_owner(
    db: AsyncSession,
    board: Board,
    credentials: HTTPAuthorizationCredentials | None,
) -> SiteMember:
    """자기 글을 보거나 지우는 회원 — 글쓰기가 꺼져도 자기 글은 지울 수 있다."""
    return await _member_from_token(
        db, board, credentials, MSG_LOGIN_TO_WRITE, MSG_WRITE_FORBIDDEN
    )


async def member_read_blocked(db: AsyncSession, board: Board) -> str | None:
    tenant = await db.get(Tenant, board.tenant_id)
    if tenant is None or not (await member_features.flags_for(db, tenant)).enabled:
        return MSG_MEMBER_FEATURE_OFF
    return None


async def member_write_blocked(db: AsyncSession, board: Board) -> str | None:
    """회원 글쓰기를 켤 수 없는 이유 — 켤 수 있으면 None."""
    tenant = await db.get(Tenant, board.tenant_id)
    if tenant is not None and tenant.template_type == HOSPITAL:
        return MSG_HOSPITAL
    blocked = await member_read_blocked(db, board)
    if blocked:
        return blocked
    fields = await field_service.list_fields(db, board.id)
    if any(field.is_required for field in fields):
        return MSG_REQUIRED_FIELDS
    return None
