"""값이 있는 칸의 유형 바꾸기 (T-182, 게시판 모듈 기획서 8.4).

미리보기와 실행이 같은 계산을 쓴다 — 미리보기에서 본 결과 그대로 바뀐다.

변환 규칙:
- 선택지 ↔ 선택지는 선택지를 그대로 쓴다. 여러 개 → 하나는 하나만 고른 글만
- 숫자 ↔ 별점은 숫자로 바로, 별점은 1~5 정수만
- 그 밖에는 값을 글자로 바꾼 뒤(선택지는 이름, 예/아니오는 "예"/"아니오")
  새 유형으로 읽는다
- 글 → 선택지는 서로 다른 값으로 선택지를 만든다(여러 개 고르기는 쉼표로 나눔, 50개까지)
- 사진 칸으로는 바꿀 수 없다. 기본값도 함께 바꾸고, 안 되면 비운다
- 변환 안 되는 글: 중단(아무것도 안 바꿈) 또는 그 값만 비우기(필수 칸은 불가)
- 휴지통 글도 바꾼다. 글 변경 · 칸 변경 · 감사 기록을 한 번에 커밋한다
"""

import re
from dataclasses import dataclass
from dataclasses import field as dc_field
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.models.board import Board, BoardField, BoardPost
from app.models.user import User
from app.services import site_cache
from app.services.board_field import (
    CHOICE_TYPES,
    RATING_MAX,
    RATING_MIN,
    SHOW_IN_LIST_KEY,
    clean_value,
)

MAX_AUTO_CHOICES = 50
CHOICE_LABEL_MAX = 100
SAMPLE_SIZE = 5
FAILURE_LIST_SIZE = 20
TRUE_WORDS = frozenset({"예", "네", "yes", "y", "true", "1", "o"})
FALSE_WORDS = frozenset({"아니오", "아니요", "no", "n", "false", "0", "x"})
_DATE_LOOSE = re.compile(r"^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$")

MSG_SAME_TYPE = "지금과 같은 유형입니다."
MSG_TO_IMAGE = "사진 칸으로는 바꿀 수 없습니다."
MSG_FROM_IMAGE = "사진 칸은 짧은 글 · 긴 글 · 링크로만 바꿀 수 있습니다."
MSG_TOO_MANY_CHOICES = (
    f"서로 다른 값이 {MAX_AUTO_CHOICES}개를 넘어 선택지를 만들 수 없습니다."
)
MSG_HAS_FAILURES = (
    "바꿀 수 없는 글이 {count}개 있습니다. "
    "그 글을 고치거나 '그 값만 비우기'를 골라 주세요."
)
MSG_REQUIRED_CLEAR = (
    "필수 칸은 값을 비울 수 없습니다. 바꿀 수 없는 글을 먼저 고쳐 주세요."
)
MSG_MANY_PICKED = "2개 이상 고른 글은 '하나 고르기'로 바꿀 수 없습니다."
MSG_NOT_BOOLEAN = "예 / 아니오로 읽을 수 없는 값입니다."
MSG_NOT_RATING = f"{RATING_MIN}~{RATING_MAX} 사이의 정수만 별점이 됩니다."
MSG_NOT_NUMBER = "숫자로 읽을 수 없는 값입니다."
MSG_LABEL_TOO_LONG = f"선택지 이름은 {CHOICE_LABEL_MAX}자까지입니다."

TEXT_TYPES = ("TEXT", "TEXTAREA")
NUMBER_TYPES = ("NUMBER", "RATING")
FROM_IMAGE_TYPES = ("TEXT", "TEXTAREA", "URL")


def _invalid(message: str, field: str | None = None) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": "VALIDATION_ERROR", "message": message, "field": field},
    )


def _conflict(message: str, field: str | None = None) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "CONFLICT", "message": message, "field": field},
    )


def _labels(options: dict[str, Any]) -> dict[str, str]:
    return {c["value"]: c["label"] for c in options.get("choices", [])}


def _number_text(value: int | float) -> str:
    return str(int(value)) if float(value).is_integer() else str(value)


def as_text(field_type: str, options: dict[str, Any], value: Any) -> str:
    """값을 사람이 읽는 글자로 — 미리보기 · 글자 칸으로 바꿀 때."""
    if value is None:
        return ""
    if field_type == "SELECT":
        return _labels(options).get(value, str(value))
    if field_type == "MULTI_SELECT" and isinstance(value, list):
        labels = _labels(options)
        return ", ".join(labels.get(v, str(v)) for v in value)
    if field_type == "BOOLEAN" and isinstance(value, bool):
        return "예" if value else "아니오"
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, int | float):
        return _number_text(value)
    return str(value)


def _from_text(target: str, text: str, label_to_value: dict[str, str]) -> Any:
    """글자를 새 유형의 값으로 — 형식 검사는 clean_value 가 마저 한다."""
    text = text.strip()
    if target in TEXT_TYPES or target in ("PHONE", "EMAIL", "URL", "IMAGE"):
        return text
    if target == "NUMBER":
        try:
            number = float(text.replace(",", ""))
        except ValueError as e:
            raise ValueError(MSG_NOT_NUMBER) from e
        return int(number) if number.is_integer() else number
    if target == "RATING":
        try:
            number = float(text)
        except ValueError as e:
            raise ValueError(MSG_NOT_RATING) from e
        if not number.is_integer():
            raise ValueError(MSG_NOT_RATING)
        return int(number)
    if target == "DATE":
        match = _DATE_LOOSE.match(text)
        if not match:
            return text
        y, m, d = match.groups()
        return f"{y}-{int(m):02d}-{int(d):02d}"
    if target == "BOOLEAN":
        word = text.lower()
        if word in TRUE_WORDS:
            return True
        if word in FALSE_WORDS:
            return False
        raise ValueError(MSG_NOT_BOOLEAN)
    if target == "SELECT":
        return label_to_value.get(text, text)
    if target == "MULTI_SELECT":
        parts = [p.strip() for p in text.split(",") if p.strip()]
        return [label_to_value.get(p, p) for p in parts]
    return text


def _auto_choices(
    source: BoardField, target: str, values: list[Any]
) -> list[dict[str, str]]:
    """글 → 선택지: 서로 다른 값(여러 개 고르기는 쉼표로 나눔)으로 선택지를 만든다."""
    options = source.field_options or {}
    labels: list[str] = []
    for value in values:
        text = as_text(source.field_type, options, value).strip()
        parts = (
            [p.strip() for p in text.split(",")] if target == "MULTI_SELECT" else [text]
        )
        for part in parts:
            if part and part not in labels:
                labels.append(part)
    if len(labels) > MAX_AUTO_CHOICES:
        raise _conflict(MSG_TOO_MANY_CHOICES, "field_type")
    return [
        {"value": f"opt_{i}", "label": label[:CHOICE_LABEL_MAX]}
        for i, label in enumerate(labels, start=1)
    ]


def _new_options(source: BoardField, target: str, values: list[Any]) -> dict[str, Any]:
    current = source.field_options or {}
    if target in CHOICE_TYPES:
        if source.field_type in CHOICE_TYPES:
            options: dict[str, Any] = {"choices": list(current.get("choices", []))}
        else:
            options = {"choices": _auto_choices(source, target, values)}
    else:
        # 숫자 범위는 새로 정한다 — 옛 값이 범위 밖으로 막히지 않게
        options = {}
    if current.get(SHOW_IN_LIST_KEY):
        options[SHOW_IN_LIST_KEY] = True
    return options


def convert_one(
    source: BoardField, target: str, options: dict[str, Any], value: Any
) -> Any:
    """값 하나를 새 유형으로 — 안 되면 ValueError(이유)."""
    old = source.field_type
    if old in CHOICE_TYPES and target in CHOICE_TYPES:
        if target == "MULTI_SELECT":
            converted: Any = [value] if isinstance(value, str) else value
        else:
            if isinstance(value, list) and len(value) > 1:
                raise ValueError(MSG_MANY_PICKED)
            converted = value[0] if isinstance(value, list) else value
    elif old in NUMBER_TYPES and target in NUMBER_TYPES:
        if target == "RATING" and (
            not float(value).is_integer() or not RATING_MIN <= value <= RATING_MAX
        ):
            raise ValueError(MSG_NOT_RATING)
        converted = int(value) if target == "RATING" else value
    else:
        label_to_value = {c["label"]: c["value"] for c in options.get("choices", [])}
        text = as_text(old, source.field_options or {}, value)
        if target == "SELECT" and len(text.strip()) > CHOICE_LABEL_MAX:
            raise ValueError(MSG_LABEL_TOO_LONG)
        converted = _from_text(target, text, label_to_value)
    return clean_value(target, options, converted)


@dataclass
class Plan:
    """미리보기 · 실행이 같이 쓰는 계산 결과."""

    target: str
    options: dict[str, Any]
    total: int = 0
    converted: dict[Any, Any] = dc_field(default_factory=dict)
    failures: list[tuple[BoardPost, str]] = dc_field(default_factory=list)
    posts: list[BoardPost] = dc_field(default_factory=list)
    default_value: Any = None


def _check_target(source: BoardField, target: str) -> None:
    if target == source.field_type:
        raise _invalid(MSG_SAME_TYPE, "field_type")
    if target == "IMAGE":
        raise _invalid(MSG_TO_IMAGE, "field_type")
    if source.field_type == "IMAGE" and target not in FROM_IMAGE_TYPES:
        raise _invalid(MSG_FROM_IMAGE, "field_type")


async def _plan(
    db: AsyncSession, board: Board, source: BoardField, target: str, lock: bool
) -> Plan:
    _check_target(source, target)
    key = source.field_key
    query = (
        select(BoardPost)
        .where(
            BoardPost.board_id == board.id,
            BoardPost.tenant_id == board.tenant_id,
            BoardPost.custom_data.has_key(key),
        )
        .order_by(BoardPost.created_at, BoardPost.id)
    )
    if lock:
        query = query.with_for_update()
    posts = list((await db.execute(query)).scalars())
    values = [post.custom_data[key] for post in posts]
    options = _new_options(source, target, values)
    plan = Plan(target=target, options=options, total=len(posts), posts=posts)
    for post in posts:
        try:
            plan.converted[post.id] = convert_one(
                source, target, options, post.custom_data[key]
            )
        except ValueError as e:
            plan.failures.append((post, str(e)))
    if source.default_value is not None:
        try:
            plan.default_value = convert_one(
                source, target, options, source.default_value
            )
        except ValueError:
            plan.default_value = None
    return plan


async def preview(
    db: AsyncSession, board: Board, source: BoardField, target: str
) -> dict[str, Any]:
    """바꾸기 전에 결과를 보여 준다 — 아무것도 저장하지 않는다."""
    plan = await _plan(db, board, source, target, lock=False)
    old_options = source.field_options or {}
    samples = [
        {
            "post_id": post.id,
            "title": post.title,
            "before": as_text(
                source.field_type, old_options, post.custom_data[source.field_key]
            ),
            "after": as_text(target, plan.options, plan.converted[post.id]),
        }
        for post in plan.posts
        if post.id in plan.converted
    ][:SAMPLE_SIZE]
    failures = [
        {
            "post_id": post.id,
            "title": post.title,
            "before": as_text(
                source.field_type, old_options, post.custom_data[source.field_key]
            ),
            "reason": reason,
        }
        for post, reason in plan.failures[:FAILURE_LIST_SIZE]
    ]
    return {
        "field_type": target,
        "total": plan.total,
        "convertible": len(plan.converted),
        "failed": len(plan.failures),
        "samples": samples,
        "failures": failures,
        "choices": plan.options.get("choices", []) if target in CHOICE_TYPES else [],
        "default_value_kept": source.default_value is None
        or plan.default_value is not None,
    }


async def convert(
    db: AsyncSession,
    board: Board,
    source: BoardField,
    target: str,
    clear_failed: bool,
    actor: User,
) -> dict[str, int]:
    """유형을 바꾸고 글 값을 함께 바꾼다 — 바꾼 글 수 · 비운 글 수."""
    old_type = source.field_type
    plan = await _plan(db, board, source, target, lock=True)
    if plan.failures and not clear_failed:
        raise _conflict(MSG_HAS_FAILURES.format(count=len(plan.failures)), "field_type")
    if plan.failures and source.is_required:
        raise _conflict(MSG_REQUIRED_CLEAR, "clear_failed")
    key = source.field_key
    for post in plan.posts:
        data = dict(post.custom_data or {})
        if post.id in plan.converted:
            data[key] = plan.converted[post.id]
        else:
            data.pop(key, None)
        # JSONB 는 새 dict 를 넣어야 바뀐 것으로 본다
        post.custom_data = data
    source.field_type = target
    source.field_options = plan.options
    source.default_value = plan.default_value
    result = {"converted": len(plan.converted), "cleared": len(plan.failures)}
    # log_action 이 같은 세션의 글 · 칸 변경과 감사 기록을 함께 커밋한다
    await log_action(
        db,
        actor,
        "BOARD_FIELD_TYPE_CONVERTED",
        "board_field",
        source.id,
        before={"field_type": old_type},
        after={
            "board_id": str(board.id),
            "field_key": key,
            "field_type": target,
            **result,
        },
        tenant_id=board.tenant_id,
    )
    await site_cache.purge_site(db, board.tenant_id)
    await db.refresh(source)
    return result
