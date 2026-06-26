"""AI 문구 추천 서비스.

- suggest_copy: 플랜별 월 사용량 체크 → LangChain(GPT-4o-mini) 호출
  → JSON 파싱(재시도 1회) → ai_usage_log 기록 → 추천 문구 반환.

LLM 호출은 `_call_model` 로 분리해 테스트에서 모킹할 수 있도록 한다.
"""

import json
import re
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import UTC, datetime

from fastapi import HTTPException, status
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.ai import AiUsageLog
from app.models.section import Section
from app.models.tenant import Tenant
from app.schemas.ai import (
    ChatEditRequest,
    CopySuggestRequest,
    CopySuggestResponse,
    CopyUsageInfo,
)
from app.services.ai_prompts import (
    PROMPT_VERSION,
    build_chat_system_prompt,
    build_copy_messages,
    field_max_length,
)

MODEL_NAME = "gpt-4o-mini"
ACTION_COPY_SUGGEST = "COPY_SUGGEST"
ACTION_CHAT_EDIT = "CHAT_EDIT"
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


# ───────────────────────── 대화형 편집 (chat-edit, SSE) ─────────────────────────

# 플랜별 월 대화형 편집 한도 (0 = 미지원, None = 무제한). 기획서 13.4 참조.
CHAT_MONTHLY_LIMITS: dict[str, int | None] = {
    "FREE": 0,
    "BASIC": 0,
    "STANDARD": 50,
    "PREMIUM": None,
}

_ALLOWED_ACTIONS = {"update_text", "update_theme", "change_template", "explain"}


def chat_monthly_limit(plan_type: str) -> int | None:
    return CHAT_MONTHLY_LIMITS.get(plan_type.upper(), 0)


def _iter_json_candidates(text: str) -> list[str]:
    """텍스트에서 JSON 후보 문자열을 추출한다.

    1) ```json ... ``` 코드 펜스 내부
    2) 펜스가 없을 경우 균형 잡힌 최상위 {...} / [...] 블록
    """
    candidates: list[str] = []

    fence_re = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)
    for match in fence_re.finditer(text):
        candidates.append(match.group(1).strip())

    if candidates:
        return candidates

    # 펜스가 없으면 균형 괄호 스캔
    depth = 0
    start = -1
    opener = ""
    pairs = {"{": "}", "[": "]"}
    for idx, ch in enumerate(text):
        if ch in pairs and depth == 0:
            depth = 1
            start = idx
            opener = ch
        elif depth > 0:
            if ch == opener:
                depth += 1
            elif ch == pairs[opener]:
                depth -= 1
                if depth == 0 and start >= 0:
                    candidates.append(text[start : idx + 1])
                    start = -1
    return candidates


def extract_actions(text: str) -> list[dict]:
    """AI 응답에서 액션 JSON 블록을 추출한다. 유효한 action 만 반환."""
    actions: list[dict] = []
    for candidate in _iter_json_candidates(text):
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        items = parsed if isinstance(parsed, list) else [parsed]
        for item in items:
            if isinstance(item, dict) and item.get("action") in _ALLOWED_ACTIONS:
                actions.append(item)
    return actions


async def build_site_context(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    """현재 테넌트의 사이트 상태(템플릿 + 섹션/필드)를 컨텍스트 dict로 구성."""
    tenant = await _get_tenant(db, tenant_id)

    stmt = (
        select(Section)
        .where(Section.tenant_id == tenant_id, Section.deleted_at.is_(None))
        .options(selectinload(Section.settings))
        .order_by(Section.display_order)
    )
    sections = (await db.execute(stmt)).scalars().all()

    return {
        "business_name": tenant.name,
        "template_type": tenant.template_type,
        "sections": [
            {
                "id": str(section.id),
                "section_type": section.section_type,
                "label": section.label,
                "is_active": section.is_active,
                "fields": {s.field_key: s.field_value for s in section.settings},
            }
            for section in sections
        ],
    }


def build_chat_messages(
    site_context: dict, request: ChatEditRequest
) -> list[BaseMessage]:
    context_json = json.dumps(site_context, ensure_ascii=False)
    messages: list[BaseMessage] = [
        SystemMessage(content=build_chat_system_prompt(context_json))
    ]
    for turn in request.conversation_history:
        if turn.role == "assistant":
            messages.append(AIMessage(content=turn.content))
        else:
            messages.append(HumanMessage(content=turn.content))
    messages.append(HumanMessage(content=request.message))
    return messages


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _get_chat_llm():  # pragma: no cover - 외부 의존성(네트워크)
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=MODEL_NAME,
        temperature=0.7,
        streaming=True,
        api_key=settings.openai_api_key or "test-key",
    )


async def _stream_model(messages: list) -> AsyncIterator[str]:  # pragma: no cover
    """LLM 토큰 스트림 → content 델타. 테스트에서 monkeypatch 대상."""
    llm = _get_chat_llm()
    async for chunk in llm.astream(messages):
        content = chunk.content
        if isinstance(content, str) and content:
            yield content


async def stream_chat_events(
    messages: list,
    on_complete: Callable[[str], Awaitable[None]] | None = None,
) -> AsyncIterator[str]:
    """LLM 델타를 SSE로 흘리고, 완료 시 액션 추출 + done 이벤트를 emit."""
    collected: list[str] = []
    try:
        async for delta in _stream_model(messages):
            collected.append(delta)
            yield _sse({"type": "delta", "content": delta})
    except Exception:  # noqa: BLE001 - 스트림 중 오류도 클라이언트에 알린다
        yield _sse({"type": "error", "message": "AI 응답 생성 중 오류가 발생했습니다."})
        return

    full_text = "".join(collected)
    yield _sse({"type": "actions", "actions": extract_actions(full_text)})
    yield _sse({"type": "done"})

    if on_complete is not None:
        await on_complete(full_text)


async def ensure_chat_quota(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    """대화형 편집 플랜/사용량 확인. 미지원→403, 한도초과→422."""
    tenant = await _get_tenant(db, tenant_id)
    limit = chat_monthly_limit(tenant.plan_type)
    if limit == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="대화형 편집은 STANDARD 이상 플랜에서 사용할 수 있습니다.",
        )
    used = await monthly_usage(db, tenant_id, ACTION_CHAT_EDIT)
    if limit is not None and used >= limit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="이번 달 대화형 편집 사용 한도를 초과했습니다.",
        )


async def chat_edit_stream(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    request: ChatEditRequest,
    site_context: dict,
) -> AsyncIterator[str]:
    messages = build_chat_messages(site_context, request)

    async def _log_usage(_full_text: str) -> None:
        db.add(
            AiUsageLog(
                tenant_id=tenant_id,
                user_id=user_id,
                action_type=ACTION_CHAT_EDIT,
                tokens_used=0,  # 스트리밍은 토큰 집계가 불확실하여 0으로 기록
            )
        )
        await db.commit()

    async for event in stream_chat_events(messages, on_complete=_log_usage):
        yield event
