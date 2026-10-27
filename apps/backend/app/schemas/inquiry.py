import re
import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

_PHONE_RE = re.compile(r"^01[016789]-?\d{3,4}-?\d{4}$")
# 업종 폼 칸은 최대 5개 — 넉넉히 두되 큰 payload 는 막는다
DETAIL_MAX_KEYS = 20


class InquiryAttachmentResponse(BaseModel):
    id: uuid.UUID
    file_url: str
    file_name: str
    file_size: int

    model_config = {"from_attributes": True}


class InquiryCreate(BaseModel):
    inquiry_type: str = "GENERAL"
    name: str = Field(..., max_length=100)
    phone: str = Field(..., max_length=20)
    email: EmailStr | None = None
    message: str = Field(..., min_length=10, max_length=1000)
    recaptcha_token: str | None = None
    # 온라인 예약 (T-123) — inquiry_type=RESERVATION 과 함께 사용
    subject: str | None = Field(None, max_length=200)
    reserved_date: date | None = None
    reserved_time: str | None = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    # 업종별 추가 항목 (T-051-A) — 칸 검사는 services/inquiry_fields.clean_detail
    detail: dict[str, Any] | None = None

    @field_validator("detail")
    @classmethod
    def limit_detail_size(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        if v is not None and len(v) > DETAIL_MAX_KEYS:
            raise ValueError("추가 항목이 너무 많습니다.")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not _PHONE_RE.match(v):
            raise ValueError("올바른 휴대폰 번호 형식이 아닙니다.")
        return v


class InquiryResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    inquiry_type: str
    name: str
    phone: str
    email: str | None
    message: str
    status: str
    is_read: bool
    admin_memo: str | None
    subject: str | None = None
    is_board: bool = False
    is_secret: bool = False
    answer: str | None = None
    answered_at: datetime | None = None
    reserved_date: date | None = None
    reserved_time: str | None = None
    detail: dict[str, Any] = {}
    # 관리자 상세 표시용 — 업종 칸 이름 · 선택지 이름으로 바꾼 값 (상세 조회에서만 채움)
    detail_items: list["InquiryDetailItem"] = []
    attachments: list[InquiryAttachmentResponse] = []
    created_at: datetime
    updated_at: datetime
    # 방문자 회원 연동 (T-115) — 회원 문의면 회원 정보, 회원 예약이면 예약 상태
    member_id: uuid.UUID | None = None
    member: "InquiryMemberInfo | None" = None
    reservation: "InquiryReservationInfo | None" = None

    model_config = {"from_attributes": True}


class InquiryDetailItem(BaseModel):
    label: str
    value: str


class InquiryMemberInfo(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    phone: str | None
    created_at: datetime
    # 탈퇴 등으로 비활성
    is_active: bool


class InquiryReservationInfo(BaseModel):
    id: uuid.UUID
    reservation_type: str
    status: str
    reserved_at: datetime | None
    detail: dict
    # 관리자가 지금 바꿀 수 있는 상태 (대기 → 확정/취소, 확정 → 완료/취소)
    next_statuses: list[str]


class ReservationStatusUpdate(BaseModel):
    status: Literal["CONFIRMED", "COMPLETED", "CANCELLED"]


class InquiryListItem(BaseModel):
    id: uuid.UUID
    inquiry_type: str
    name: str
    phone: str
    email: str | None
    status: str
    is_read: bool
    admin_memo: str | None
    subject: str | None = None
    is_board: bool = False
    answered_at: datetime | None = None
    reserved_date: date | None = None
    reserved_time: str | None = None
    created_at: datetime
    # 회원 문의 배지 (T-115)
    member_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}


class InquiryListResponse(BaseModel):
    total: int
    page: int
    limit: int
    items: list[InquiryListItem]


class InquiryUpdate(BaseModel):
    status: str | None = None
    is_read: bool | None = None
    admin_memo: str | None = None
    # 상담 게시판 답변 (빈 문자열이면 답변 삭제) — T-123
    answer: str | None = Field(None, max_length=5000)


InquiryResponse.model_rebuild()
