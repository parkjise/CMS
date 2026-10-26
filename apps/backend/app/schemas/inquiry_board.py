"""온라인 상담 게시판 공개 스키마 (기획서 11.9, T-123).

공개 응답에는 연락처·이메일·관리자 메모를 절대 담지 않는다. 작성자 이름은 가린다.
"""

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

_PHONE_RE = re.compile(r"^01[016789]-?\d{3,4}-?\d{4}$|^0\d{1,2}-?\d{3,4}-?\d{4}$")


class BoardPostCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=4, max_length=50)
    phone: str = Field(..., max_length=20)
    subject: str = Field(..., min_length=1, max_length=60)
    message: str = Field(..., min_length=10, max_length=2000)
    is_secret: bool = True
    recaptcha_token: str | None = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not _PHONE_RE.match(v):
            raise ValueError("올바른 연락처 형식이 아닙니다.")
        return v


class BoardUnlockRequest(BaseModel):
    password: str = Field(..., min_length=1, max_length=50)


class BoardListItem(BaseModel):
    id: uuid.UUID
    no: int
    subject: str
    author: str
    is_secret: bool
    answered: bool
    created_at: datetime


class BoardListResponse(BaseModel):
    total: int
    page: int
    size: int
    items: list[BoardListItem]


class BoardPostDetail(BaseModel):
    id: uuid.UUID
    subject: str
    author: str
    is_secret: bool
    answered: bool
    created_at: datetime
    # 비밀글이고 아직 확인 전이면 locked=True, 내용·답변은 비움
    locked: bool = False
    message: str | None = None
    answer: str | None = None
    answered_at: datetime | None = None
    prev_id: uuid.UUID | None = None
    next_id: uuid.UUID | None = None
