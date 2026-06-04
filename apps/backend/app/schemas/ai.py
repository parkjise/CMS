from pydantic import BaseModel, Field


class CopySuggestRequest(BaseModel):
    section_type: str
    current_text: str = ""
    tone: str = "professional"  # professional | friendly | casual
    keywords: list[str] = []


class CopySuggestResponse(BaseModel):
    suggestions: list[str]
    tokens_used: int


class ChatEditRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)
    context: dict = {}


class ChatEditResponse(BaseModel):
    reply: str
    applied_changes: list[dict] = []
    tokens_used: int
