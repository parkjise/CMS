"""AI 문구 추천 서비스.

- suggest_copy: 플랜별 월 사용량 체크 → LangChain(GPT-4o-mini) 호출
  → JSON 파싱(재시도 1회) → ai_usage_log 기록 → 추천 문구 반환.

LLM 호출은 `_call_model` 로 분리해 테스트에서 모킹할 수 있도록 한다.
"""

import json
import re
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.ai import AiUsageLog
from app.models.tenant import Tenant
from app.schemas.ai import (
    CopySuggestRequest,
    CopySuggestResponse,
    CopyUsageInfo,
)
from app.services.ai_prompts import (
    PROMPT_VERSION,
    build_copy_messages,
    field_max_length,
)

MODEL_NAME = "gpt-4o-mini"
ACTION_COPY_SUGGEST = "COPY_SUGGEST"
MAX_PARSE_RETRIES = 1  # 파싱 실패 시 1회 재시도

# 플랜별 월 문구 추천 한도 (None = 무제한). 기획서 13.4 참조.
MONTHLY_LIMITS: dict[str, int | None] = {
    "FREE": 5,
    "BASIC": 20,
    "STANDARD": 100,
    "PREMIUM": None,
}
_DEFAULT_LIMIT = 20

_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def monthly_limit(plan_type: str) -> int | None:
    return MONTHLY_LIMITS.get(plan_type.upper(), _DEFAULT_LIMIT)


def _month_start() -> datetime:
    now = datetime.now(UTC)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _strip_code_fence(text: str) -> str:
    cleaned = text.strip()
    cleaned = _CODE_FENCE_RE.sub("", cleaned).strip()
    return cleaned


def parse_suggestions(content: str, count: int) -> list[str]:
    """LLM 응답에서 문구 리스트를 추출한다. 실패 시 ValueError."""
    cleaned = _strip_code_fence(content)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError("AI 응답을 JSON으로 파싱할 수 없습니다.") from exc

    if isinstance(parsed, dict):
        # {"suggestions": [...]} 형태 허용
        parsed = parsed.get("suggestions", [])

    if not isinstance(parsed, list):
        raise ValueError("AI 응답이 배열 형식이 아닙니다.")

    suggestions = [str(item).strip() for item in parsed if str(item).strip()]
    if not suggestions:
        raise ValueError("AI 응답에서 유효한 문구를 찾을 수 없습니다.")

    return suggestions[:count]


def _get_llm():  # pragma: no cover - 외부 의존성(네트워크)이라 단위 테스트에서 모킹
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=MODEL_NAME,
        temperature=0.8,
        api_key=settings.openai_api_key or "test-key",
    )


async def _call_model(messages: list) -> tuple[str, int]:  # pragma: no cover
    """LLM 호출 → (content, tokens_used). 테스트에서 monkeypatch 대상."""
    llm = _get_llm()
    result = await llm.ainvoke(messages)
    content = result.content if isinstance(result.content, str) else str(result.content)
    tokens = 0
    usage = getattr(result, "usage_metadata", None)
    if isinstance(usage, dict):
        tokens = int(usage.get("total_tokens", 0) or 0)
    return content, tokens


async def generate_suggestions(
    request: CopySuggestRequest,
    *,
    template_type: str,
    business_name: str,
) -> tuple[list[str], int]:
    """프롬프트 구성 → LLM 호출 → 파싱(재시도 1회). 실패 시 HTTP 502."""
    messages = build_copy_messages(
        template_type=template_type,
        business_name=business_name,
        keywords=request.tenant_context.keywords,
        tone=request.tone,
        current_value=request.current_value,
        count=request.count,
        max_length=field_max_length(request.field),
    )

    last_error: Exception | None = None
    for _ in range(MAX_PARSE_RETRIES + 1):
        content, tokens = await _call_model(messages)
        try:
            return parse_suggestions(content, request.count), tokens
        except ValueError as exc:
            last_error = exc

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="AI 문구 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
    ) from last_error


async def _get_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> Tenant:
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="테넌트를 찾을 수 없습니다.",
        )
    return tenant


async def monthly_usage(
    db: AsyncSession, tenant_id: uuid.UUID, action_type: str
) -> int:
    stmt = (
        select(func.count())
        .select_from(AiUsageLog)
        .where(
            AiUsageLog.tenant_id == tenant_id,
            AiUsageLog.action_type == action_type,
            AiUsageLog.created_at >= _month_start(),
        )
    )
    return int((await db.execute(stmt)).scalar_one())


async def suggest_copy(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    request: CopySuggestRequest,
) -> CopySuggestResponse:
    tenant = await _get_tenant(db, tenant_id)

    limit = monthly_limit(tenant.plan_type)
    used = await monthly_usage(db, tenant_id, ACTION_COPY_SUGGEST)
    if limit is not None and used >= limit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="이번 달 AI 문구 추천 사용 한도를 초과했습니다.",
        )

    # 요청 컨텍스트가 비어 있으면 테넌트 실제 정보로 채운다
    business_name = request.tenant_context.business_name or tenant.name
    template_type = request.tenant_context.template_type or tenant.template_type

    suggestions, tokens = await generate_suggestions(
        request,
        template_type=template_type,
        business_name=business_name,
    )

    db.add(
        AiUsageLog(
            tenant_id=tenant_id,
            user_id=user_id,
            action_type=ACTION_COPY_SUGGEST,
            tokens_used=tokens,
        )
    )
    await db.commit()

    new_used = used + 1
    remaining = None if limit is None else max(limit - new_used, 0)
    return CopySuggestResponse(
        suggestions=suggestions,
        tokens_used=tokens,
        usage=CopyUsageInfo(used=new_used, limit=limit, remaining=remaining),
        prompt_version=PROMPT_VERSION,
    )
