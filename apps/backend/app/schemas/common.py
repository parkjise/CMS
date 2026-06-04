from datetime import UTC, datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, field_serializer

T = TypeVar("T")


class Meta(BaseModel):
    timestamp: str
    version: str = "1.0"

    @classmethod
    def now(cls) -> "Meta":
        return cls(timestamp=datetime.now(UTC).isoformat())


class ApiResponse(BaseModel, Generic[T]):
    success: bool = True
    data: T
    meta: Meta = None  # type: ignore[assignment]

    def model_post_init(self, __context: object) -> None:
        if self.meta is None:
            self.meta = Meta.now()

    @classmethod
    def ok(cls, data: T) -> "ApiResponse[T]":
        return cls(data=data, meta=Meta.now())


class ErrorDetail(BaseModel):
    code: str
    message: str
    field: str | None = None
    details: list | None = None


class ApiError(BaseModel):
    success: bool = False
    error: ErrorDetail

    @classmethod
    def of(
        cls,
        code: str,
        message: str,
        field: str | None = None,
        details: list | None = None,
    ) -> "ApiError":
        return cls(error=ErrorDetail(code=code, message=message, field=field, details=details))


class PaginationMeta(BaseModel):
    total: int
    page: int
    size: int
    has_next: bool


class PaginatedResponse(BaseModel, Generic[T]):
    success: bool = True
    data: list[T]
    pagination: PaginationMeta
    meta: Meta = None  # type: ignore[assignment]

    def model_post_init(self, __context: object) -> None:
        if self.meta is None:
            self.meta = Meta.now()
