import re
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

_PHONE_RE = re.compile(r"^01[016789]-?\d{3,4}-?\d{4}$")


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
    attachments: list[InquiryAttachmentResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InquiryListItem(BaseModel):
    id: uuid.UUID
    inquiry_type: str
    name: str
    phone: str
    email: str | None
    status: str
    is_read: bool
    admin_memo: str | None
    created_at: datetime

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
