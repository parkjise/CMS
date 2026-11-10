from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

MAX_TABLE_COLUMNS = 20

ColumnId = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
ColumnSize = Literal["narrow", "normal", "wide"]


class PostTableLayout(BaseModel):
    """게시판 글 표의 개인 열 설정 (T-172 · T-181) — 칸 ID 순서 · 크기만."""

    model_config = ConfigDict(extra="forbid")

    order: list[ColumnId] = Field(default_factory=list, max_length=MAX_TABLE_COLUMNS)
    sizes: dict[ColumnId, ColumnSize] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check(self) -> "PostTableLayout":
        if len(set(self.order)) != len(self.order):
            raise ValueError("열 순서에 같은 칸이 두 번 있습니다.")
        if len(self.sizes) > MAX_TABLE_COLUMNS:
            raise ValueError(f"열 크기는 {MAX_TABLE_COLUMNS}개까지 저장할 수 있습니다.")
        return self


class PostTableLayoutResponse(PostTableLayout):
    model_config = ConfigDict(extra="ignore")

    updated_at: datetime
