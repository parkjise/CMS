"""메인 화면 최신 글 섹션의 게시판 · 개수 (T-185).

- 테마형 `BOARD_LATEST` 와 코드형 `NOTICE_LATEST` 가 같은 칸을 쓴다
- 게시판은 주소가 아닌 id 로 저장한다 — 주소를 바꿔도 연결이 끊기지 않는다
- 고를 수 있는 게시판: 이 사업체의 지우지 않은 새 게시판 또는 공지,
  회원만 읽기가 아닌 것 (방문자에게 회원 전용 글 제목이 보이면 안 된다)
- 비운 값은 허용 — 테마형은 섹션을 숨기고, 코드형은 공지를 보여 준다
"""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.section import SectionSettingUpdate
from app.services import board as board_service

LATEST_SECTION_TYPES = frozenset({"BOARD_LATEST", "NOTICE_LATEST"})
LATEST_BOARD_FIELD = "latest_board"
POST_COUNT_FIELD = "post_count"
POST_COUNT_MIN = 3
POST_COUNT_MAX = 8

MSG_BOARD = "보여 줄 게시판을 찾을 수 없습니다. 게시판을 다시 골라 주세요."
MSG_MEMBER_ONLY = "회원만 읽는 게시판은 메인 화면에 보여 줄 수 없습니다."
MSG_COUNT = f"글 개수는 {POST_COUNT_MIN}~{POST_COUNT_MAX}개로 정해 주세요."


async def _check_board(db: AsyncSession, tenant_id: UUID, value: str) -> str:
    try:
        board_id = UUID(value)
    except ValueError as e:
        raise ValueError(MSG_BOARD) from e
    board = await board_service.get_board(db, tenant_id, board_id)
    if board is None or board.system_key not in (None, board_service.NOTICE_KEY):
        raise ValueError(MSG_BOARD)
    if board_service.is_member_only(board):
        raise ValueError(MSG_MEMBER_ONLY)
    return str(board.id)


def _check_count(value: str) -> str:
    try:
        count = int(value)
    except ValueError as e:
        raise ValueError(MSG_COUNT) from e
    if not POST_COUNT_MIN <= count <= POST_COUNT_MAX:
        raise ValueError(MSG_COUNT)
    return str(count)


async def validate_settings(
    db: AsyncSession, tenant_id: UUID, settings: list[SectionSettingUpdate]
) -> None:
    """최신 글 칸 검사 · 정리 — 잘못된 값은 ValueError (400)."""
    for s in settings:
        value = (s.field_value or "").strip()
        if s.field_key == LATEST_BOARD_FIELD:
            s.field_value = await _check_board(db, tenant_id, value) if value else ""
            s.value_type = "STRING"
        elif s.field_key == POST_COUNT_FIELD:
            s.field_value = _check_count(value) if value else ""
            s.value_type = "INTEGER"
