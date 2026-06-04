import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SectionSettingResponse(BaseModel):
    id: uuid.UUID
    field_key: str
    field_value: str | None
    value_type: str

    model_config = {"from_attributes": True}


class SectionResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    section_type: str
    label: str
    display_order: int
    is_active: bool
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
