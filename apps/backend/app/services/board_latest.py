"""메인 화면 최신 글 · 게시판 연결 섹션의 칸 (T-185, T-243).

- 테마형 `BOARD_LATEST` 와 코드형 `NOTICE_LATEST` 가 게시판 · 개수 칸을 함께 쓴다
- 게시판은 주소가 아닌 id 로 저장한다 — 주소를 바꿔도 연결이 끊기지 않는다
- 고를 수 있는 게시판: 이 사업체의 지우지 않은 새 게시판 또는 공지,
  회원만 읽기가 아닌 것 (방문자에게 회원 전용 글 제목이 보이면 안 된다)
- 비운 값은 허용 — 테마형은 섹션을 숨기고, 코드형은 공지를 보여 준다
- 게시판 연결(T-243, 테마형만): 보여 주는 방식 · 분류 · 정렬 · 빈 결과 문구.
  칸 매핑은 고정 — 제목 · 본문 요약 · 본문 첫 사진 · 공개일 (기획서 PM-05)
"""

import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.page import Page
from app.models.section import Section, SectionSetting
from app.schemas.section import SectionSettingUpdate
from app.services import board as board_service
from app.services import board_category as category_service

BOARD_LATEST = "BOARD_LATEST"
LATEST_SECTION_TYPES = frozenset({BOARD_LATEST, "NOTICE_LATEST"})
LATEST_BOARD_FIELD = "latest_board"
POST_COUNT_FIELD = "post_count"
DISPLAY_FIELD = "display_mode"
CATEGORY_FIELD = "category_id"
SORT_FIELD = "sort"
EMPTY_TEXT_FIELD = "empty_text"
POST_COUNT_MIN = 3
POST_COUNT_MAX = 8
# 카드 · FAQ · 연혁은 한 섹션에 더 많이 보여 준다 (T-243)
CONNECT_COUNT_MAX = 12
DISPLAY_MODES = frozenset({"LIST", "CARD", "FAQ", "TIMELINE"})
SORTS = frozenset({"latest", "oldest", "board"})
EMPTY_TEXT_MAX = 100

MSG_BOARD = "보여 줄 게시판을 찾을 수 없습니다. 게시판을 다시 골라 주세요."
MSG_MEMBER_ONLY = "회원만 읽는 게시판은 메인 화면에 보여 줄 수 없습니다."
MSG_COUNT = "글 개수는 {min}~{max}개로 정해 주세요."
MSG_DISPLAY = "보여 주는 방식을 다시 골라 주세요."
MSG_SORT = "정렬을 다시 골라 주세요."
MSG_CATEGORY = "고른 게시판의 분류가 아닙니다. 분류를 다시 골라 주세요."
MSG_EMPTY_TEXT = f"빈 결과 문구는 {EMPTY_TEXT_MAX}자 이하로 적어 주세요."


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


def _check_count(value: str, maximum: int) -> str:
    message = MSG_COUNT.format(min=POST_COUNT_MIN, max=maximum)
    try:
        count = int(value)
    except ValueError as e:
        raise ValueError(message) from e
    if not POST_COUNT_MIN <= count <= maximum:
        raise ValueError(message)
    return str(count)


def _check_choice(value: str, choices: frozenset[str], message: str) -> str:
    if value not in choices:
        raise ValueError(message)
    return value


async def _check_category(db: AsyncSession, board_id: str, value: str) -> str:
    """분류는 고른 게시판의 것만 — 게시판이 비었으면 분류도 비운다."""
    if not board_id:
        return ""
    try:
        category_id = UUID(value)
    except ValueError as e:
        raise ValueError(MSG_CATEGORY) from e
    if await category_service.get_category(db, UUID(board_id), category_id) is None:
        raise ValueError(MSG_CATEGORY)
    return str(category_id)


async def validate_settings(
    db: AsyncSession,
    tenant_id: UUID,
    settings: list[SectionSettingUpdate],
    *,
    section_type: str = BOARD_LATEST,
    current: dict[str, str | None] | None = None,
) -> None:
    """최신 글 칸 검사 · 정리 — 잘못된 값은 ValueError (400).

    current — 저장된 값. 분류만 바꿀 때 어느 게시판의 분류인지 알려고 쓴다.
    """
    connect = section_type == BOARD_LATEST
    by_key = {s.field_key: s for s in settings}
    board_id = (current or {}).get(LATEST_BOARD_FIELD) or ""
    if (board := by_key.get(LATEST_BOARD_FIELD)) is not None:
        value = (board.field_value or "").strip()
        board.field_value = await _check_board(db, tenant_id, value) if value else ""
        board.value_type = "STRING"
        board_id = board.field_value
    if (count := by_key.get(POST_COUNT_FIELD)) is not None:
        value = (count.field_value or "").strip()
        maximum = CONNECT_COUNT_MAX if connect else POST_COUNT_MAX
        count.field_value = _check_count(value, maximum) if value else ""
        count.value_type = "INTEGER"
    if not connect:
        return
    choices = {
        DISPLAY_FIELD: (DISPLAY_MODES, MSG_DISPLAY),
        SORT_FIELD: (SORTS, MSG_SORT),
    }
    for key, (allowed, message) in choices.items():
        if (choice := by_key.get(key)) is not None:
            value = (choice.field_value or "").strip()
            choice.field_value = _check_choice(value, allowed, message) if value else ""
            choice.value_type = "STRING"
    if (category := by_key.get(CATEGORY_FIELD)) is not None:
        value = (category.field_value or "").strip()
        category.field_value = (
            await _check_category(db, board_id, value) if value else ""
        )
        category.value_type = "STRING"
    if (empty := by_key.get(EMPTY_TEXT_FIELD)) is not None:
        value = (empty.field_value or "").strip()
        if len(value) > EMPTY_TEXT_MAX:
            raise ValueError(MSG_EMPTY_TEXT)
        empty.field_value = value
        empty.value_type = "STRING"


HOME_PAGE = "home"
HOME_TITLE = "홈"
TITLE_FIELD = "section_title"
_TAG = re.compile(r"<[^>]+>")


async def board_usage(db: AsyncSession, tenant_id: UUID, board_id: UUID) -> list[dict]:
    """이 게시판을 보여 주는 섹션 (T-243 사용 위치) — 지운 섹션은 빼고 페이지 순서로.

    페이지 이름은 페이지 관리의 이름, 행이 없으면 주소 그대로 (홈은 '홈').
    섹션 이름은 홈페이지에 보이는 섹션 제목(서식 뺌), 비었으면 관리용 이름.
    """
    sections = await _usage_sections(db, tenant_id, board_id)
    shown: dict[UUID, str] = {}
    if sections:
        rows = await db.execute(
            select(SectionSetting.section_id, SectionSetting.field_value).where(
                SectionSetting.section_id.in_([s.id for s in sections]),
                SectionSetting.field_key == TITLE_FIELD,
            )
        )
        shown = {sid: _TAG.sub("", value or "").strip() for sid, value in rows.all()}
    keys = {s.page_key or HOME_PAGE for s in sections}
    titles = {HOME_PAGE: HOME_TITLE}
    if keys:
        rows = await db.execute(
            select(Page.page_key, Page.title).where(
                Page.tenant_id == tenant_id,
                Page.page_key.in_(keys),
                Page.deleted_at.is_(None),
            )
        )
        titles.update({key: title for key, title in rows.all()})
    return [
        {
            "section_id": s.id,
            "section_type": s.section_type,
            "label": shown.get(s.id) or s.label,
            "page_key": s.page_key or HOME_PAGE,
            "page_title": titles.get(s.page_key or HOME_PAGE, s.page_key),
            "is_active": s.is_active,
        }
        for s in sections
    ]


async def _usage_sections(
    db: AsyncSession, tenant_id: UUID, board_id: UUID
) -> list[Section]:
    result = await db.execute(
        select(Section)
        .join(SectionSetting, SectionSetting.section_id == Section.id)
        .where(
            Section.tenant_id == tenant_id,
            Section.deleted_at.is_(None),
            Section.section_type.in_(LATEST_SECTION_TYPES),
            SectionSetting.field_key == LATEST_BOARD_FIELD,
            SectionSetting.field_value == str(board_id),
        )
        .order_by(Section.page_key, Section.display_order, Section.id)
    )
    return list(result.scalars().unique())
