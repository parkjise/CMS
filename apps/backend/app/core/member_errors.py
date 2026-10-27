"""T-108 방문자 회원 API 에러 (기획서 16.0 · 5.1 공통 에러 형식).

방문자 API 전용 에러(MemberAuthError) · 문구. 응답 형식은 모든 API 공통
`{"success": false, "error": {code, message, field, details}}` (app/core/errors.py).
"""

import re
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.errors import validation_exception_handler
from app.schemas.common import ApiError

# ── 사용자 노출 메시지 (기획서 16.3 · 16.4) ─────────────────────────────────
EMAIL_TAKEN = "이미 사용 중인 이메일입니다"
PHONE_NOT_VERIFIED = "휴대폰 인증을 완료해주세요"
INVALID_CREDENTIALS = "이메일 또는 비밀번호를 확인해주세요"
ACCOUNT_INACTIVE = "사용이 중단된 계정입니다. 고객센터에 문의해주세요"
ACCOUNT_LOCKED = "30분 후에 다시 시도해주세요"
UNAUTHORIZED = "로그인이 필요합니다"
FORBIDDEN = "접근 권한이 없습니다"
TENANT_NOT_FOUND = "사이트를 찾을 수 없습니다"
VALIDATION_ERROR = "입력값을 확인해주세요"
INVALID_EMAIL = "올바른 이메일 형식이 아닙니다"
REQUIRED_FIELD = "필수 입력 항목입니다"
# 휴대폰 인증 · 계정 찾기 · 비밀번호 재설정 (기획서 16.5 · 16.6, T-109)
PHONE_SEND_LIMIT = "오늘 인증번호 요청 한도(5회)를 넘었습니다. 내일 다시 시도해주세요"
RESEND_WAIT = "잠시 후 다시 요청해주세요"
SMS_SEND_FAILED = "인증번호 발송에 실패했습니다. 잠시 후 다시 시도해주세요"
VERIFICATION_NOT_FOUND = "인증 요청을 찾을 수 없습니다. 인증번호를 다시 요청해주세요"
INVALID_CODE = "인증번호가 일치하지 않습니다"
CODE_EXPIRED = "인증번호가 만료되었습니다. 다시 요청해주세요"
CODE_ATTEMPTS_EXCEEDED = "인증 시도 횟수를 초과했습니다. 인증번호를 다시 요청해주세요"
ACCOUNT_NOT_FOUND = "입력하신 정보와 일치하는 계정을 찾을 수 없습니다."
TOKEN_EXPIRED = "유효하지 않거나 만료된 링크입니다."
# 소셜 로그인 (기획서 16.4 · 16.7, T-110)
FEATURE_DISABLED = "이 기능은 현재 비활성화되어 있습니다."
INVALID_STATE = "로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해주세요"
SOCIAL_AUTH_FAILED = "소셜 로그인에 실패했습니다. 잠시 후 다시 시도해주세요"
SOCIAL_EMAIL_EXISTS = (
    "이미 이메일로 가입된 계정입니다. 로그인 후 마이페이지에서 연결해주세요"
)
SOCIAL_ALREADY_LINKED = "이미 다른 회원에 연결된 소셜 계정입니다"
SOCIAL_PROVIDER_LINKED = (
    "이미 연결된 계정이 있습니다. 연결을 해제한 뒤 다시 시도해주세요"
)
SOCIAL_NOT_LINKED = "연결되지 않은 소셜 계정입니다"
LAST_LOGIN_METHOD = (
    "다른 로그인 방법이 없어 연결을 해제할 수 없습니다. 비밀번호를 먼저 설정해주세요"
)
SIGNUP_EXPIRED = "가입 시간이 만료되었습니다. 소셜 로그인을 다시 시도해주세요"
EMAIL_REQUIRED = "이메일을 입력해주세요"
# 마이페이지 · 탈퇴 (기획서 16.7 · 16.8, T-111)
WRONG_PASSWORD = "비밀번호가 일치하지 않습니다"
CURRENT_PASSWORD_REQUIRED = "현재 비밀번호를 입력해주세요"
RESERVATION_NOT_FOUND = "예약을 찾을 수 없습니다"
RESERVATION_NOT_CANCELLABLE = "취소할 수 없는 예약입니다"
INQUIRY_NOT_FOUND = "문의를 찾을 수 없습니다"
ACTIVE_RESERVATION_EXISTS = (
    "진행 중인 예약이 있어 탈퇴할 수 없습니다. 예약을 먼저 취소해주세요"
)

_MEMBER_PATH = re.compile(r"^/api/public/[^/]+/(auth|members)(/|$)")


class MemberAuthError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        field: str | None = None,
        details: list[Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.field = field
        self.details = details
        self.headers = headers


async def member_auth_error_handler(
    _request: Request, exc: MemberAuthError
) -> JSONResponse:
    body = ApiError.of(exc.code, exc.message, exc.field, exc.details)
    return JSONResponse(
        body.model_dump(), status_code=exc.status_code, headers=exc.headers
    )


def _korean_message(error: dict[str, Any], loc: list[str]) -> str:
    """스키마의 한국어 ValueError 는 그대로, Pydantic 기본(영문) 메시지는 바꾼다."""
    msg = str(error.get("msg", ""))
    if error.get("type") == "missing":
        return REQUIRED_FIELD
    if loc and loc[-1] == "email":
        return INVALID_EMAIL
    # 스키마 field/model validator 의 ValueError (한국어 메시지)
    if error.get("type") == "value_error" and msg.startswith("Value error, "):
        return msg.removeprefix("Value error, ")
    return VALIDATION_ERROR


async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """입력 검증 실패 → 400 VALIDATION_ERROR (방문자 API 는 기존 상세 형식 유지)."""
    if not _MEMBER_PATH.match(request.url.path):
        return await validation_exception_handler(request, exc)
    errors = exc.errors()
    first = errors[0] if errors else {}
    loc = [str(p) for p in first.get("loc", ()) if p not in ("body", "query")]
    message = _korean_message(first, loc)
    details = [
        {"field": ".".join(str(p) for p in e.get("loc", ())[1:]), "message": e["msg"]}
        for e in errors
    ]
    body = ApiError.of(
        "VALIDATION_ERROR", message, ".".join(loc) or None, details=details
    )
    return JSONResponse(body.model_dump(), status_code=400)
