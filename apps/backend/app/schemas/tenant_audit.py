import uuid
from datetime import datetime

from pydantic import BaseModel


class TenantAuditItem(BaseModel):
    """사업체 변경 기록 한 줄 (T-186) — IP · 원본 값은 넣지 않는다."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    action: str
    target_type: str
    actor: str
    board_name: str | None
    target_name: str | None
    count: int | None
    created_at: datetime


class TenantAuditListResponse(BaseModel):
    items: list[TenantAuditItem]
    total: int
    page: int
    limit: int
