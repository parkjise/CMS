import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class GalleryItemResponse(BaseModel):
    id: uuid.UUID
    section_id: uuid.UUID
    image_url: str
    caption: str | None
    display_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class GalleryOrderItem(BaseModel):
    id: uuid.UUID
    display_order: int


class GalleryOrderUpdate(BaseModel):
    items: list[GalleryOrderItem] = Field(..., min_length=1)


class GalleryUploadResponse(BaseModel):
    uploaded_count: int
    failed_count: int
    items: list[GalleryItemResponse]
