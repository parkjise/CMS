from pydantic import BaseModel, Field


class TenantContext(BaseModel):
    """AI 프롬프트에 주입할 테넌트 컨텍스트. 비어 있으면 서버가 테넌트 정보로 채운다."""

    template_type: str = ""
    business_name: str = ""
    keywords: list[str] = Field(default_factory=list)


class CopySuggestRequest(BaseModel):
    section_type: str
    field: str = "main_title"
    current_value: str = ""
    tenant_context: TenantContext = Field(default_factory=TenantContext)
    tone: str = "professional"  # professional | warm | energetic
    count: int = Field(default=3, ge=1, le=5)


class CopyUsageInfo(BaseModel):
    used: int
    limit: int | None  # None = 무제한
    remaining: int | None


class CopySuggestResponse(BaseModel):
    suggestions: list[str]
    tokens_used: int
    usage: CopyUsageInfo
    prompt_version: str


class ChatEditRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)
    context: dict = Field(default_factory=dict)


class ChatEditResponse(BaseModel):
    reply: str
    applied_changes: list[dict] = Field(default_factory=list)
    tokens_used: int
