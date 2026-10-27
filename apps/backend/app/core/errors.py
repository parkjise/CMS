"""공통 에러 응답 형식 (CLAUDE.md 5 · 기획서 5.1).

모든 API 오류를 `{"success": false, "error": {code, message, field, details}}`
로 응답한다.
엔드포인트는 지금처럼 HTTPException 을 던지고, 여기 처리기가 형식을 바꾼다.

- detail 이 코드(`"NOT_FOUND"` 같은 대문자 · 밑줄)면 그 코드 + 한국어 기본 문구
- detail 이 문장이면 그 문장을 message 로, code 는 HTTP 상태로 정한다
- detail 이 {code, message, field} 객체면 그대로
- 입력 검증 실패는 400 VALIDATION_ERROR (첫 오류 필드 · 한국어 문구, 전체는 details)
- 요청 한도 초과(slowapi)는 429, 처리하지 못한 예외는 500 (내부 정보 노출 없이)
"""

import logging
import re
from http import HTTPStatus
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.common import ApiError

logger = logging.getLogger("app.errors")

# 에러 코드 → 사용자 노출 기본 문구 (detail 이 코드만 줄 때)
CODE_MESSAGES: dict[str, str] = {
    "VALIDATION_ERROR": "입력값을 확인해주세요",
    "UNAUTHORIZED": "로그인이 필요합니다",
    "FORBIDDEN": "접근 권한이 없습니다",
    "NOT_FOUND": "요청한 정보를 찾을 수 없습니다",
    "CONFLICT": "이미 존재하는 데이터입니다",
    "FILE_TOO_LARGE": "파일이 너무 큽니다 (최대 20MB)",
    "PLAN_LIMIT_EXCEEDED": "현재 요금제의 사용 한도를 초과했습니다",
    "RATE_LIMIT_EXCEEDED": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요",
    "INTERNAL_ERROR": "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요",
    "INVALID_IMAGE": "올바른 이미지 파일이 아닙니다",
    "UNSUPPORTED_FORMAT": "지원하지 않는 파일 형식입니다",
    "EMPTY_FILE": "빈 파일은 업로드할 수 없습니다",
    "INVALID_CONTEXT": "잘못된 업로드 위치입니다",
    "TOO_MANY_FILES": "한 번에 최대 10개까지 업로드할 수 있습니다",
    "NO_FILES": "파일을 첨부해주세요",
    "RECAPTCHA_REQUIRED": "보안 확인(reCAPTCHA)이 필요합니다",
    "RECAPTCHA_FAILED": "보안 확인(reCAPTCHA)에 실패했습니다. 다시 시도해주세요",
    "METHOD_NOT_ALLOWED": "허용되지 않은 요청입니다",
}

# HTTP 상태 → 에러 코드 (detail 이 문장일 때)
STATUS_CODES: dict[int, str] = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "FILE_TOO_LARGE",
    422: "PLAN_LIMIT_EXCEEDED",
    429: "RATE_LIMIT_EXCEEDED",
}

_CODE_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]*$")

# Pydantic 기본(영문) 검증 메시지 대신 쓸 문구
_REQUIRED_FIELD = "필수 입력 항목입니다"
_INVALID_EMAIL = "올바른 이메일 형식이 아닙니다"


def code_for_status(status_code: int) -> str:
    if status_code >= 500:
        return "INTERNAL_ERROR"
    return STATUS_CODES.get(status_code, "VALIDATION_ERROR")


def _is_default_phrase(status_code: int, detail: str) -> bool:
    """Starlette 기본 영문 문구("Not Found" 등) — 한국어 기본 문구로 바꾼다."""
    try:
        return detail == HTTPStatus(status_code).phrase
    except ValueError:
        return False


def to_error(status_code: int, detail: Any) -> ApiError:
    """HTTPException 의 detail → 공통 에러 본문."""
    if isinstance(detail, dict):
        code = str(detail.get("code") or code_for_status(status_code))
        message = str(detail.get("message") or CODE_MESSAGES.get(code, code))
        return ApiError.of(code, message, detail.get("field"), detail.get("details"))
    if isinstance(detail, str) and _CODE_PATTERN.match(detail):
        return ApiError.of(detail, CODE_MESSAGES.get(detail, detail))
    code = code_for_status(status_code)
    if (
        isinstance(detail, str)
        and detail
        and not _is_default_phrase(status_code, detail)
    ):
        return ApiError.of(code, detail)
    return ApiError.of(code, CODE_MESSAGES[code])


def _json(
    body: ApiError, status_code: int, headers: dict | None = None
) -> JSONResponse:
    return JSONResponse(body.model_dump(), status_code=status_code, headers=headers)


async def http_exception_handler(
    _request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    headers = getattr(exc, "headers", None)
    return _json(to_error(exc.status_code, exc.detail), exc.status_code, headers)


def validation_message(error: dict[str, Any]) -> str:
    """스키마의 한국어 ValueError 는 그대로, Pydantic 기본(영문) 메시지는 바꾼다."""
    msg = str(error.get("msg", ""))
    if error.get("type") == "missing":
        return _REQUIRED_FIELD
    loc = [str(p) for p in error.get("loc", ())]
    if loc and loc[-1] == "email":
        return _INVALID_EMAIL
    if error.get("type") == "value_error" and msg.startswith("Value error, "):
        return msg.removeprefix("Value error, ")
    return CODE_MESSAGES["VALIDATION_ERROR"]


def _field(error: dict[str, Any]) -> str | None:
    loc = [str(p) for p in error.get("loc", ()) if p not in ("body", "query", "path")]
    return ".".join(loc) or None


async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    errors = exc.errors()
    first = errors[0] if errors else {}
    details = [
        {"field": _field(e), "message": validation_message(e), "type": e.get("type")}
        for e in errors
    ]
    body = ApiError.of(
        "VALIDATION_ERROR", validation_message(first), _field(first), details
    )
    return _json(body, 400)


async def rate_limit_handler(_request: Request, exc: RateLimitExceeded) -> JSONResponse:
    body = ApiError.of(
        "RATE_LIMIT_EXCEEDED",
        CODE_MESSAGES["RATE_LIMIT_EXCEEDED"],
        details=[{"limit": str(exc.detail)}],
    )
    return _json(body, 429)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """처리하지 못한 예외 — 내부 정보 없이 500. 로그 · 오류 수집(Sentry)은 그대로."""
    logger.exception("처리하지 못한 예외: %s %s", request.method, request.url.path)
    try:
        import sentry_sdk

        sentry_sdk.capture_exception(exc)
    except Exception:  # noqa: BLE001 - 오류 수집 실패가 응답을 막으면 안 된다
        pass
    return _json(ApiError.of("INTERNAL_ERROR", CODE_MESSAGES["INTERNAL_ERROR"]), 500)
