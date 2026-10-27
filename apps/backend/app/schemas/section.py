import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SectionSettingResponse(BaseModel):
    id: uuid.UUID
    field_key: str
    field_value: str | None
    value_type: str
    # 템플릿 샘플 값 그대로인지 (관리자 '샘플' 배지 — 기획서 11.8)
    is_sample: bool = False

    model_config = {"from_attributes": True}


class SectionResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    section_type: str
    label: str
    display_order: int
    is_active: bool
    page_key: str = "home"
    settings: list[SectionSettingResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SectionSettingUpdate(BaseModel):
    field_key: str
    field_value: str | None = None
    value_type: str = "STRING"


class SectionUpdate(BaseModel):
    label: str | None = Field(None, max_length=100)
    is_active: bool | None = None
    settings: list[SectionSettingUpdate] | None = None


class SectionCreate(BaseModel):
    """섹션 추가 (T-037-A) — 종류는 GET /sections/limits 의 addable_types 중 하나"""

    section_type: str = Field(..., min_length=1, max_length=50)
    label: str | None = Field(None, max_length=100)


class AddableSectionType(BaseModel):
    section_type: str
    label: str


class SectionLimitsResponse(BaseModel):
    """요금제 섹션 수 한도 — 관리자 화면은 요금제를 직접 판단하지 않는다"""

    plan_type: str
    count: int
    limit: int | None
    can_add: bool
    can_delete: bool
    reason: str | None
    addable_types: list[AddableSectionType]


class SectionOrderItem(BaseModel):
    id: uuid.UUID
    display_order: int


class SectionOrderUpdate(BaseModel):
    sections: list[SectionOrderItem]


class BatchSaveChange(BaseModel):
    field: str
    value: str


class BatchSaveSection(BaseModel):
    section_id: uuid.UUID
    changes: list[BatchSaveChange]


class BatchSaveRequest(BaseModel):
    sections: list[BatchSaveSection]
