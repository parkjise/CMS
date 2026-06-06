import uuid

from pydantic import BaseModel, Field


class BatchChangeItem(BaseModel):
    section_id: uuid.UUID
    field: str = Field(..., min_length=1, max_length=100)
    value: str | None = None


class BatchSaveRequest(BaseModel):
    changes: list[BatchChangeItem] = Field(..., min_length=1, max_length=50)


class BatchSaveResponse(BaseModel):
    saved_count: int
    failed_count: int
    cache_purged: bool
