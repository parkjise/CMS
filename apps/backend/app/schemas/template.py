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

    model_config = {"from_attributes": True}


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
