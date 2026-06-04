import uuid
from datetime import datetime

from pydantic import BaseModel


class UploadResponse(BaseModel):
    id: uuid.UUID
    file_name: str
    file_url: str
    file_size: int
    mime_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PresignedUrlResponse(BaseModel):
    upload_url: str
    file_url: str
    expires_in: int
