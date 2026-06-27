import uuid
from datetime import datetime

from pydantic import BaseModel


class TemplateResponse(BaseModel):
    id: uuid.UUID
    template_type: str
    name: str
    description: str | None
    thumbnail_url: str | None
    css_variables: dict
    section_layouts: list
    is_active: bool
    min_plan: str

    model_config = {"from_attributes": True}


class TemplateListItem(TemplateResponse):
    """목록용: 현재 테넌트 플랜 기준 잠금 여부 포함."""

    locked: bool


class TemplateListResponse(BaseModel):
    templates: list[TemplateListItem]
    current_template_id: uuid.UUID | None


class TemplateApplyRequest(BaseModel):
    template_id: uuid.UUID


class TemplateCssOverrideUpdate(BaseModel):
    css_overrides: dict


class TenantTemplateOverrideResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    template_id: uuid.UUID
    css_overrides: dict
    applied_at: datetime
    template: TemplateResponse | None = None

    model_config = {"from_attributes": True}
