"""게시판 필드 정의 · 값 검증 (T-142-A, 게시판 모듈 기획서 BM-04 · 8.4 · 11.2).

값은 board_posts.custom_data[field_key] 에 둔다. 규칙:
- 정의에 없는 칸 · 삭제한 칸은 받지 않는다. 삭제한 칸의 값은 지우지 않고 그대로 둔다
- 빈 값(None · "" · [])은 값 없음 — 저장하지 않는다. BOOLEAN 의 false 는 값이다
- 필수 칸은 공개할 때만 본다. 한 번도 공개한 적 없는 글은 전부 검사하고, 이미 공개했던
  글은 있던 값을 비우는 것만 막는다 — 필수 칸을 새로 만들어도 예전 글을 고칠 수 있게
"""

import re
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.models.board import Board, BoardField, BoardPost
from app.models.user import User
from app.schemas.board import ChoiceRemapRequest, FieldCreate, FieldOption, FieldUpdate
from app.schemas.rich_body import SAFE_IMAGE_URL
from app.services import site_cache

MAX_FIELDS = 20
STATUS_PUBLISHED = "PUBLISHED"
TEXT_MAX = 200
TEXTAREA_MAX = 5000
IMAGE_URL_MAX = 500
EMAIL_MAX = 254
LINK_URL_MAX = 500
SHOW_IN_LIST_KEY = "show_in_list"
RATING_MIN = 1
RATING_MAX = 5
CHOICE_TYPES = ("SELECT", "MULTI_SELECT")
AUTO_KEY_PREFIX = "field_"
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_PHONE = re.compile(r"^\+?[0-9][0-9\- ()]{5,18}[0-9]$")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# 공개 화면에서 링크가 되므로 http(s) 만 받는다 (javascript: 차단)
_LINK_URL = re.compile(r"^https?://[^\s/]+\S*$", re.IGNORECASE)

# 글의 기본 칸 · 시스템 값과 헷갈리는 이름 (D-07)
RESERVED_KEYS = frozenset(
    {
        "id",
        "title",
        "body",
        "status",
        "author",
        "author_id",
        "is_pinned",
        "published_at",
        "created_at",
        "updated_at",
        "deleted_at",
        "tenant_id",
        "board_id",
        "custom_data",
    }
)

MSG_SYSTEM_BOARD = "기본 게시판에는 칸을 추가할 수 없습니다."
MSG_TOO_MANY = f"칸은 게시판당 {MAX_FIELDS}개까지 만들 수 있습니다."
MSG_KEY_TAKEN = "이미 쓴 적 있는 칸 이름입니다. 다른 이름을 입력해주세요."
MSG_KEY_RESERVED = "시스템에서 쓰는 이름이라 쓸 수 없습니다."
MSG_TYPE_IN_USE = "이 칸에 값이 있는 글이 있어 유형을 바꿀 수 없습니다."
MSG_OPTION_IN_USE = (
    "글에서 쓰고 있는 선택지는 지울 수 없습니다. 이름은 바꿀 수 있습니다."
)
MSG_NEED_OPTIONS = "선택지를 하나 이상 입력해주세요."
MSG_NOT_CHOICE = "선택지가 있는 칸만 값을 옮길 수 있습니다."
MSG_REMAP_SAME = "같은 선택지로는 옮길 수 없습니다."
MSG_REMAP_REQUIRED = "필수 칸은 값을 비울 수 없습니다. 옮길 선택지를 골라 주세요."
MSG_MIN_MAX = "최솟값은 최댓값보다 클 수 없습니다."
MSG_ORDER_MISMATCH = "칸 목록이 바뀌었습니다. 화면을 새로 고쳐 주세요."
MSG_UNKNOWN_FIELD = "없는 칸입니다. 화면을 새로 고쳐 주세요."
MSG_REQUIRED = "필수 칸입니다."
MSG_TEXT_TOO_LONG = "글자 수가 너무 많습니다."
MSG_INVALID_TEXT = "글자를 입력해주세요."
MSG_INVALID_NUMBER = "올바른 숫자가 아닙니다."
MSG_INVALID_DATE = "올바른 날짜가 아닙니다."
MSG_INVALID_OPTION = "선택할 수 없는 값입니다."
MSG_INVALID_BOOLEAN = "참 또는 거짓만 입력할 수 있습니다."
MSG_INVALID_RATING = f"{RATING_MIN}부터 {RATING_MAX} 사이의 정수를 입력해주세요."
MSG_INVALID_IMAGE = "사진 주소가 올바르지 않습니다."
MSG_INVALID_PHONE = "올바른 연락처가 아닙니다."
MSG_INVALID_EMAIL = "올바른 이메일 주소가 아닙니다."
MSG_INVALID_URL = "http:// 또는 https:// 로 시작하는 주소를 입력해주세요."
MSG_REQUIRED_WITH_MEMBER_WRITE = (
    "회원 글쓰기를 켠 게시판에는 필수 칸을 둘 수 없습니다. 권한 탭에서 먼저 꺼 주세요."
)
MSG_REQUIRED_IN_BULK = "필수 칸이 비어 있어 공개할 수 없는 글이 있습니다: {title}"


def _conflict(message: str, field: str | None = None) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "CONFLICT", "message": message, "field": field},
    )


def _invalid(message: str, field: str | None = None) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": "VALIDATION_ERROR", "message": message, "field": field},
    )


def _value_error(key: str, message: str) -> HTTPException:
    return _invalid(message, f"custom_data.{key}")


# ── 값 검사 ───────────────────────────────────────────────────────────────


def _is_empty(value: Any) -> bool:
    return value is None or value == "" or value == []


def _clean_text(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        raise ValueError(MSG_INVALID_TEXT)
    text = value.strip()
    if len(text) > limit:
        raise ValueError(MSG_TEXT_TOO_LONG)
    return text


def _clean_number(value: Any, options: dict[str, Any]) -> int | float:
    # bool 은 int 의 하위 타입이고, inf · nan 은 JSON 으로 저장되지 않는다
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise ValueError(MSG_INVALID_NUMBER)
    if value != value or value in (float("inf"), float("-inf")):
        raise ValueError(MSG_INVALID_NUMBER)
    low, high = options.get("min"), options.get("max")
    if low is not None and value < low:
        raise ValueError(f"{low} 이상이어야 합니다.")
    if high is not None and value > high:
        raise ValueError(f"{high} 이하여야 합니다.")
    return value


def _clean_date(value: Any) -> str:
    if not isinstance(value, str) or not _DATE.match(value):
        raise ValueError(MSG_INVALID_DATE)
    try:
        date.fromisoformat(value)
    except ValueError as e:
        raise ValueError(MSG_INVALID_DATE) from e
    return value


def _choice_values(options: dict[str, Any]) -> set[str]:
    return {choice["value"] for choice in options.get("choices", [])}


def _clean_select(value: Any, options: dict[str, Any]) -> str:
    if not isinstance(value, str) or value not in _choice_values(options):
        raise ValueError(MSG_INVALID_OPTION)
    return value


def _clean_multi(value: Any, options: dict[str, Any]) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(MSG_INVALID_OPTION)
    allowed = _choice_values(options)
    picked: list[str] = []
    for item in value:
        if not isinstance(item, str) or item not in allowed:
            raise ValueError(MSG_INVALID_OPTION)
        if item not in picked:
            picked.append(item)
    return picked


def _clean_rating(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(MSG_INVALID_RATING)
    if not RATING_MIN <= value <= RATING_MAX:
        raise ValueError(MSG_INVALID_RATING)
    return value


def _clean_image(value: Any) -> str:
    if (
        not isinstance(value, str)
        or len(value) > IMAGE_URL_MAX
        or not SAFE_IMAGE_URL.match(value)
    ):
        raise ValueError(MSG_INVALID_IMAGE)
    return value


def _clean_pattern(value: Any, pattern: re.Pattern[str], limit: int, msg: str) -> str:
    if not isinstance(value, str):
        raise ValueError(msg)
    text = value.strip()
    if len(text) > limit or not pattern.match(text):
        raise ValueError(msg)
    return text


def _clean_boolean(value: Any) -> bool:
    if not isinstance(value, bool):
        raise ValueError(MSG_INVALID_BOOLEAN)
    return value


def clean_value(field_type: str, options: dict[str, Any], value: Any) -> Any:
    """타입에 맞는 값으로 돌려준다 — 틀리면 ValueError(사용자 메시지)."""
    if field_type == "TEXT":
        return _clean_text(value, TEXT_MAX)
    if field_type == "TEXTAREA":
        return _clean_text(value, TEXTAREA_MAX)
    if field_type == "NUMBER":
        return _clean_number(value, options)
    if field_type == "DATE":
        return _clean_date(value)
    if field_type == "SELECT":
        return _clean_select(value, options)
    if field_type == "MULTI_SELECT":
        return _clean_multi(value, options)
    if field_type == "BOOLEAN":
        return _clean_boolean(value)
    if field_type == "RATING":
        return _clean_rating(value)
    if field_type == "IMAGE":
        return _clean_image(value)
    if field_type == "PHONE":
        return _clean_pattern(value, _PHONE, 20, MSG_INVALID_PHONE)
    if field_type == "EMAIL":
        return _clean_pattern(value, _EMAIL, EMAIL_MAX, MSG_INVALID_EMAIL)
    if field_type == "URL":
        return _clean_pattern(value, _LINK_URL, LINK_URL_MAX, MSG_INVALID_URL)
    raise ValueError(MSG_INVALID_OPTION)


def _merge_values(
    fields: list[BoardField], stored: dict[str, Any], incoming: dict[str, Any]
) -> dict[str, Any]:
    by_key = {f.field_key: f for f in fields}
    merged = dict(stored)
    for key, value in incoming.items():
        field = by_key.get(key)
        if field is None:
            raise _value_error(key, MSG_UNKNOWN_FIELD)
        cleaned = None
        if not _is_empty(value):
            try:
                cleaned = clean_value(field.field_type, field.field_options, value)
            except ValueError as e:
                raise _value_error(key, str(e)) from e
        if _is_empty(cleaned):
            merged.pop(key, None)
        else:
            merged[key] = cleaned
    return merged


def _missing_required(
    fields: list[BoardField],
    values: dict[str, Any],
    stored: dict[str, Any],
    first: bool,
) -> BoardField | None:
    """비어 있으면 안 되는 필수 칸 — first 는 한 번도 공개한 적 없는 글."""
    for field in fields:
        if not field.is_required or field.field_key in values:
            continue
        if first or field.field_key in stored:
            return field
    return None


async def resolve_custom_data(
    db: AsyncSession,
    board_id: UUID,
    post: BoardPost | None,
    incoming: dict[str, Any] | None,
    target_status: str,
) -> dict[str, Any]:
    """저장할 custom_data — 글을 바꾸기 전에 불러 틀리면 아무것도 바꾸지 않는다."""
    fields = await list_fields(db, board_id)
    stored = dict(post.custom_data or {}) if post else {}
    merged = _merge_values(fields, stored, incoming or {})
    if post is None:
        for field in fields:
            sent = field.field_key in (incoming or {})
            if not sent and field.default_value is not None:
                merged[field.field_key] = field.default_value
    if target_status == STATUS_PUBLISHED:
        first = post is None or post.published_at is None
        missing = _missing_required(fields, merged, stored, first)
        if missing is not None:
            raise _value_error(missing.field_key, MSG_REQUIRED)
    return merged


def _public_value(field: BoardField, value: Any) -> Any:
    """내부 선택지 값 → 이름. 정의에서 사라진 선택지는 보여 주지 않는다."""
    labels = {
        choice["value"]: choice["label"]
        for choice in (field.field_options or {}).get("choices", [])
    }
    if field.field_type == "SELECT":
        return labels.get(value)
    if field.field_type == "MULTI_SELECT" and isinstance(value, list):
        return [labels[v] for v in value if v in labels]
    return value


def field_values(fields: list[BoardField], values: dict[str, Any]) -> list[dict]:
    """공개 화면의 칸 값 — 숨긴 칸 · 빈 칸은 나가지 않는다."""
    shown = []
    for field in fields:
        if not field.is_visible or field.field_key not in values:
            continue
        value = _public_value(field, values[field.field_key])
        if _is_empty(value):
            continue
        shown.append(
            {
                "key": field.field_key,
                "label": field.label,
                "field_type": field.field_type,
                "value": value,
            }
        )
    return shown


async def public_fields(db: AsyncSession, post: BoardPost) -> list[dict[str, Any]]:
    """글 상세에 보여 줄 칸 — 삭제한 칸도 나가지 않는다."""
    values = post.custom_data or {}
    if not values:
        return []
    return field_values(await list_fields(db, post.board_id), values)


async def list_display_fields(db: AsyncSession, board: Board) -> list[BoardField]:
    """공개 목록에 보여 줄 칸 — 글 목록에 표시로 고른 칸."""
    fields = await list_fields(db, board.id)
    return [f for f in fields if (f.field_options or {}).get(SHOW_IN_LIST_KEY)]


async def ensure_publishable(
    db: AsyncSession, rows: list[tuple[BoardPost, Board]]
) -> None:
    """일괄 공개 — 낱개 공개와 같은 필수 칸 규칙. 하나라도 걸리면 전체 취소."""
    by_board: dict[UUID, list[BoardField]] = {}
    for post, board in rows:
        if board.id not in by_board:
            by_board[board.id] = await list_fields(db, board.id)
        values = post.custom_data or {}
        first = post.published_at is None
        if _missing_required(by_board[board.id], values, values, first):
            raise _invalid(MSG_REQUIRED_IN_BULK.format(title=post.title))


# ── 필드 정의 ─────────────────────────────────────────────────────────────


async def list_fields(
    db: AsyncSession, board_id: UUID, *, deleted: bool = False
) -> list[BoardField]:
    result = await db.execute(
        select(BoardField)
        .where(
            BoardField.board_id == board_id,
            BoardField.deleted_at.is_not(None)
            if deleted
            else BoardField.deleted_at.is_(None),
        )
        .order_by(BoardField.display_order, BoardField.created_at, BoardField.id)
    )
    return list(result.scalars().all())


async def get_field(
    db: AsyncSession, board_id: UUID, field_id: UUID
) -> BoardField | None:
    result = await db.execute(
        select(BoardField).where(
            BoardField.id == field_id, BoardField.board_id == board_id
        )
    )
    return result.scalar_one_or_none()


async def _used_keys(db: AsyncSession, board_id: UUID) -> set[str]:
    result = await db.execute(
        select(BoardField.field_key).where(BoardField.board_id == board_id)
    )
    return set(result.scalars().all())


def _next_auto_key(used: set[str]) -> str:
    number = 1
    while f"{AUTO_KEY_PREFIX}{number}" in used:
        number += 1
    return f"{AUTO_KEY_PREFIX}{number}"


def _build_options(
    field_type: str,
    choices: list[FieldOption] | list[dict[str, str]] | None,
    low: float | None,
    high: float | None,
) -> dict[str, Any]:
    """타입에 맞는 설정만 남긴다."""
    if field_type in CHOICE_TYPES:
        if not choices:
            raise _invalid(MSG_NEED_OPTIONS, "options")
        return {
            "choices": [
                c.model_dump() if isinstance(c, FieldOption) else dict(c)
                for c in choices
            ]
        }
    if field_type == "NUMBER":
        if low is not None and high is not None and low > high:
            raise _invalid(MSG_MIN_MAX, "min")
        return {k: v for k, v in (("min", low), ("max", high)) if v is not None}
    return {}


def _clean_default(field_type: str, options: dict[str, Any], value: Any) -> Any:
    if _is_empty(value):
        return None
    try:
        return clean_value(field_type, options, value)
    except ValueError as e:
        raise _invalid(str(e), "default_value") from e


async def _has_values(db: AsyncSession, board_id: UUID, key: str) -> bool:
    """이 칸에 값이 있는 글이 있는지 — 휴지통 글도 센다 (복원할 수 있으므로)."""
    result = await db.execute(
        select(BoardPost.id)
        .where(BoardPost.board_id == board_id, BoardPost.custom_data.has_key(key))
        .limit(1)
    )
    return result.first() is not None


async def value_counts(db: AsyncSession, board_id: UUID) -> dict[str, int]:
    """칸마다 값이 있는 글 수 — 휴지통 글도 센다."""
    fields = await db.execute(
        select(BoardField.field_key).where(BoardField.board_id == board_id)
    )
    keys = list(fields.scalars().all())
    if not keys:
        return {}
    result = await db.execute(
        select(
            *(
                func.count().filter(BoardPost.custom_data.has_key(key)).label(key)
                for key in keys
            )
        ).where(BoardPost.board_id == board_id)
    )
    row = result.one()
    return {key: int(row[i]) for i, key in enumerate(keys)}


async def _option_in_use(
    db: AsyncSession, board_id: UUID, field: BoardField, value: str
) -> bool:
    needle: Any = [value] if field.field_type == "MULTI_SELECT" else value
    result = await db.execute(
        select(BoardPost.id)
        .where(
            BoardPost.board_id == board_id,
            BoardPost.custom_data.contains({field.field_key: needle}),
        )
        .limit(1)
    )
    return result.first() is not None


async def choice_counts(
    db: AsyncSession, board_id: UUID, fields: list[BoardField]
) -> dict[UUID, dict[str, int]]:
    """선택지 칸마다 {선택지 값: 그 값을 쓰는 글 수} — 휴지통 글도 센다 (T-180)."""
    columns = []
    for field in fields:
        if field.field_type not in CHOICE_TYPES:
            continue
        for value in _choice_values(field.field_options):
            needle: Any = [value] if field.field_type == "MULTI_SELECT" else value
            columns.append(
                (
                    field.id,
                    value,
                    func.count().filter(
                        BoardPost.custom_data.contains({field.field_key: needle})
                    ),
                )
            )
    if not columns:
        return {}
    row = (
        await db.execute(
            select(*(column for _, _, column in columns)).where(
                BoardPost.board_id == board_id
            )
        )
    ).one()
    counts: dict[UUID, dict[str, int]] = {}
    for i, (field_id, value, _) in enumerate(columns):
        counts.setdefault(field_id, {})[value] = int(row[i])
    return counts


def _remapped(field: BoardField, value: Any, src: str, dst: str | None) -> Any:
    """글 한 개의 칸 값을 옮긴 결과 — None 이면 값을 지운다."""
    if field.field_type == "SELECT":
        return dst if value == src else value
    items = [dst if item == src else item for item in value or []]
    kept = list(dict.fromkeys(item for item in items if item is not None))
    return kept or None


async def remap_choice(
    db: AsyncSession,
    board: Board,
    field: BoardField,
    data: ChoiceRemapRequest,
    actor: User,
) -> int:
    """쓰고 있는 선택지를 다른 선택지로 옮긴다 (T-180, 기획서 8.4) — 옮긴 글 수.

    휴지통 글도 옮긴다. 다중 선택은 겹치는 값을 하나로 합친다.
    글 값 변경과 감사 기록을 한 번에 커밋한다 — 하나라도 실패하면 모두 취소.
    """
    if field.field_type not in CHOICE_TYPES:
        raise _invalid(MSG_NOT_CHOICE, "field_type")
    values = _choice_values(field.field_options)
    src, dst = data.source, data.target
    if src not in values:
        raise _invalid(MSG_INVALID_OPTION, "source")
    if dst is not None and dst not in values:
        raise _invalid(MSG_INVALID_OPTION, "target")
    if src == dst:
        raise _invalid(MSG_REMAP_SAME, "target")
    if dst is None and field.is_required:
        raise _conflict(MSG_REMAP_REQUIRED, "target")
    needle: Any = [src] if field.field_type == "MULTI_SELECT" else src
    result = await db.execute(
        select(BoardPost)
        .where(
            BoardPost.board_id == board.id,
            BoardPost.tenant_id == board.tenant_id,
            BoardPost.custom_data.contains({field.field_key: needle}),
        )
        .order_by(BoardPost.id)
        .with_for_update()
    )
    posts = list(result.scalars())
    for post in posts:
        data_ = dict(post.custom_data or {})
        value = _remapped(field, data_.get(field.field_key), src, dst)
        if value is None:
            data_.pop(field.field_key, None)
        else:
            data_[field.field_key] = value
        # JSONB 는 새 dict 를 넣어야 바뀐 것으로 본다
        post.custom_data = data_
    # log_action 이 같은 세션의 글 변경과 감사 기록을 함께 커밋한다
    await log_action(
        db,
        actor,
        "BOARD_FIELD_CHOICE_REMAPPED",
        "board_field",
        field.id,
        before={"source": src},
        after={
            "board_id": str(board.id),
            "field_key": field.field_key,
            "target": dst,
            "moved_posts": len(posts),
        },
        tenant_id=board.tenant_id,
    )
    await site_cache.purge_site(db, board.tenant_id)
    return len(posts)


async def _commit_field(db: AsyncSession, board: Board) -> None:
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise _conflict(MSG_KEY_TAKEN, "field_key") from e
    await site_cache.purge_site(db, board.tenant_id)


async def _active_count(db: AsyncSession, board_id: UUID) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(BoardField)
        .where(BoardField.board_id == board_id, BoardField.deleted_at.is_(None))
    )
    return int(result.scalar_one())


async def _ensure_room(db: AsyncSession, board_id: UUID) -> None:
    if await _active_count(db, board_id) >= MAX_FIELDS:
        raise _conflict(MSG_TOO_MANY)


def _ensure_required_allowed(board: Board, is_required: bool | None) -> None:
    """회원 글쓰기 폼에는 추가 칸이 없어 필수 칸을 채울 수 없다 (T-150-B)."""
    write = (board.settings or {}).get("permissions", {}).get("write")
    if is_required and write == "MEMBER":
        raise _conflict(MSG_REQUIRED_WITH_MEMBER_WRITE, "is_required")


async def create_field(db: AsyncSession, board: Board, data: FieldCreate) -> BoardField:
    if board.system_key is not None:
        raise _conflict(MSG_SYSTEM_BOARD)
    _ensure_required_allowed(board, data.is_required)
    await _ensure_room(db, board.id)
    used = await _used_keys(db, board.id)
    if data.field_key in RESERVED_KEYS:
        raise _invalid(MSG_KEY_RESERVED, "field_key")
    if data.field_key in used:
        raise _conflict(MSG_KEY_TAKEN, "field_key")
    options = _build_options(data.field_type, data.options, data.min, data.max)
    if data.show_in_list:
        options[SHOW_IN_LIST_KEY] = True
    last_order = await db.execute(
        select(func.coalesce(func.max(BoardField.display_order), -1)).where(
            BoardField.board_id == board.id
        )
    )
    field = BoardField(
        tenant_id=board.tenant_id,
        board_id=board.id,
        field_key=data.field_key or _next_auto_key(used),
        label=data.label,
        field_type=data.field_type,
        is_required=data.is_required,
        is_visible=data.is_visible,
        help_text=data.help_text,
        placeholder=data.placeholder,
        default_value=_clean_default(data.field_type, options, data.default_value),
        field_options=options,
        display_order=int(last_order.scalar_one()) + 1,
    )
    db.add(field)
    await _commit_field(db, board)
    await db.refresh(field)
    return field


async def _check_options_kept(
    db: AsyncSession, field: BoardField, new_options: dict[str, Any]
) -> None:
    removed = _choice_values(field.field_options) - _choice_values(new_options)
    for value in removed:
        if await _option_in_use(db, field.board_id, field, value):
            raise _conflict(MSG_OPTION_IN_USE, "options")


async def update_field(
    db: AsyncSession, board: Board, field: BoardField, data: FieldUpdate
) -> BoardField:
    sent = data.model_fields_set
    if not field.is_required:
        _ensure_required_allowed(board, data.is_required)
    field_type = data.field_type or field.field_type
    if field_type != field.field_type and await _has_values(
        db, board.id, field.field_key
    ):
        raise _conflict(MSG_TYPE_IN_USE, "field_type")
    current = field.field_options or {}
    options = _build_options(
        field_type,
        data.options if "options" in sent else current.get("choices"),
        data.min if "min" in sent else current.get("min"),
        data.max if "max" in sent else current.get("max"),
    )
    if field_type == field.field_type and field_type in CHOICE_TYPES:
        await _check_options_kept(db, field, options)
    show_in_list = (
        data.show_in_list
        if data.show_in_list is not None
        else current.get(SHOW_IN_LIST_KEY)
    )
    if show_in_list:
        options[SHOW_IN_LIST_KEY] = True
    default = data.default_value if "default_value" in sent else field.default_value
    field.default_value = _clean_default(field_type, options, default)
    field.field_type = field_type
    field.field_options = options
    for name in ("label", "is_required", "is_visible", "help_text", "placeholder"):
        value = getattr(data, name)
        if name in sent and value is not None:
            setattr(field, name, value)
    await _commit_field(db, board)
    await db.refresh(field)
    return field


async def delete_field(db: AsyncSession, board: Board, field: BoardField) -> None:
    """소프트 삭제 — 글의 값은 그대로 둔다 (AC-05)."""
    field.deleted_at = datetime.now(UTC)
    await _commit_field(db, board)
    await db.refresh(field)


async def restore_field(
    db: AsyncSession, board: Board, field: BoardField
) -> BoardField:
    await _ensure_room(db, board.id)
    field.deleted_at = None
    await _commit_field(db, board)
    await db.refresh(field)
    return field


async def reorder_fields(
    db: AsyncSession, board: Board, field_ids: list[UUID]
) -> list[BoardField]:
    fields = await list_fields(db, board.id)
    if len(field_ids) != len(fields) or {f.id for f in fields} != set(field_ids):
        raise _invalid(MSG_ORDER_MISMATCH, "field_ids")
    rank = {field_id: i for i, field_id in enumerate(field_ids)}
    for field in fields:
        field.display_order = rank[field.id]
    await _commit_field(db, board)
    return await list_fields(db, board.id)


def copies_of(fields: list[BoardField], board_id: UUID) -> list[BoardField]:
    """게시판 복제용 필드 복사본 (D-02). 값 없는 새 게시판이라 그대로 복사한다."""
    return [
        BoardField(
            id=uuid4(),
            tenant_id=field.tenant_id,
            board_id=board_id,
            field_key=field.field_key,
            label=field.label,
            field_type=field.field_type,
            is_required=field.is_required,
            is_visible=field.is_visible,
            help_text=field.help_text,
            placeholder=field.placeholder,
            default_value=field.default_value,
            field_options=dict(field.field_options or {}),
            display_order=field.display_order,
        )
        for field in fields
    ]
