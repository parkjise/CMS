import uuid
from typing import Literal

from pydantic import BaseModel, Field


class BatchChangeItem(BaseModel):
    section_id: uuid.UUID
    field: str = Field(..., min_length=1, max_length=100)
    value: str | None = None
    # 'rich' = 미니 툴바 서식이 들어간 HTML (서버가 허용 태그만 남김 — T-065-A)
    format: Literal["plain", "rich"] = "plain"


class BatchSaveRequest(BaseModel):
    changes: list[BatchChangeItem] = Field(..., min_length=1, max_length=50)


class BatchSaveResponse(BaseModel):
    saved_count: int
    failed_count: int
    cache_purged: bool
