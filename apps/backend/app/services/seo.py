import re
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.board import Board, BoardPost
from app.models.seo import SeoSetting
from app.models.tenant import Tenant
from app.schemas.seo import (
    AeoBoard,
    AeoItem,
    AeoResponse,
    AeoUpdate,
    AiCrawler,
    GeoResponse,
    GeoSettings,
    SeoLimitsResponse,
    SeoSettingsUpdate,
)
from app.services import board as board_service
from app.services import site_cache

_META_TITLE_MAX = 60
_META_DESC_MAX = 160

# 대표 키워드 (T-040-A, 기획서 4 AD-05 · 2 요금제 표 "고급 (키워드 + 사이트맵)")
KEYWORDS_MAX = 5
KEYWORD_MAX_LENGTH = 30
KEYWORD_PLANS = frozenset({"STANDARD", "PREMIUM"})
_CANONICAL_URL = re.compile(r"^https://[^\s<>\"'`]+$")
KEYWORDS_PLAN_MESSAGE = "대표 키워드는 STANDARD 이상 요금제에서 저장할 수 있습니다."


def keywords_allowed(plan_type: str | None) -> bool:
    return (plan_type or "").upper() in KEYWORD_PLANS


def normalize_keywords(raw: list[str]) -> list[str]:
    """공백 정리, 빈 값 · 중복(대소문자 무시) 제거. 한도를 넘으면 ValueError."""
    result: list[str] = []
    seen: set[str] = set()
    for item in raw:
        word = " ".join(str(item).split())
        if not word or word.lower() in seen:
            continue
        if len(word) > KEYWORD_MAX_LENGTH:
            raise ValueError(f"키워드는 {KEYWORD_MAX_LENGTH}자 이하여야 합니다.")
        seen.add(word.lower())
        result.append(word)
    if len(result) > KEYWORDS_MAX:
        raise ValueError(f"키워드는 최대 {KEYWORDS_MAX}개까지 넣을 수 있습니다.")
    return result


async def get_limits(db: AsyncSession, tenant_id: UUID) -> SeoLimitsResponse:
    tenant = await db.get(Tenant, tenant_id)
    return SeoLimitsResponse(
        keywords_allowed=keywords_allowed(tenant.plan_type if tenant else None),
        keywords_max=KEYWORDS_MAX,
        keyword_max_length=KEYWORD_MAX_LENGTH,
    )


def _clean_canonical_url(value: str | None) -> str | None:
    """대표 주소 — https 주소만, 빈 값은 지우기 (T-129)."""
    url = (value or "").strip()
    if not url:
        return None
    if not _CANONICAL_URL.match(url):
        raise ValueError("대표 주소는 https:// 로 시작하는 주소여야 합니다.")
    return url


def _validate(data: SeoSettingsUpdate) -> None:
    if data.meta_title is not None and len(data.meta_title) > _META_TITLE_MAX:
        raise ValueError(f"페이지 제목은 {_META_TITLE_MAX}자 이하여야 합니다.")
    desc_len = len(data.meta_description) if data.meta_description else 0
    if desc_len > _META_DESC_MAX:
        raise ValueError(f"메타 설명은 {_META_DESC_MAX}자 이하여야 합니다.")


async def get_seo_settings(db: AsyncSession) -> SeoSetting | None:
    result = await db.execute(select(SeoSetting))
    return result.scalar_one_or_none()


async def update_seo_settings(
    db: AsyncSession,
    tenant_id: UUID,
    data: SeoSettingsUpdate,
) -> SeoSetting:
    _validate(data)
    data.canonical_url = _clean_canonical_url(data.canonical_url)

    result = await db.execute(select(SeoSetting))
    setting = result.scalar_one_or_none()

    keywords: list[str] | None = None
    if data.keywords is not None:
        keywords = normalize_keywords(data.keywords)
        current = list(setting.keywords or []) if setting else []
        # 요금제를 내려도 저장된 키워드는 그대로 쓰고, 바꾸는 것만 막는다
        if keywords != current:
            tenant = await db.get(Tenant, tenant_id)
            if not keywords_allowed(tenant.plan_type if tenant else None):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=KEYWORDS_PLAN_MESSAGE,
                )

    update_fields = [
        "meta_title",
        "meta_description",
        "og_image_url",
        "robots_txt",
        "google_analytics_id",
        "naver_site_verification",
        "google_site_verification",
        "og_title",
        "og_description",
        "canonical_url",
    ]
    # 보낸 칸만 바꾼다 — null 은 지우기 (보내지 않은 칸은 그대로)
    sent = [f for f in update_fields if f in data.model_fields_set]

    if setting:
        for field in sent:
            setattr(setting, field, getattr(data, field))
        if data.robots is not None:
            setting.robots = data.robots
        if keywords is not None:
            setting.keywords = keywords
        setting.updated_at = datetime.now(UTC)
    else:
        setting = SeoSetting(
            tenant_id=tenant_id,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            keywords=keywords or [],
            robots=data.robots or "index,follow",
            **{f: getattr(data, f) for f in sent},
        )
        db.add(setting)

    await db.commit()
    # SNS 링크 · SEO 메타는 공개 사이트 응답에 들어간다 — 캐시 비우기 (T-066-A)
    await site_cache.purge_site(db, tenant_id)
    db.expire_all()
    result = await db.execute(select(SeoSetting))
    return result.scalar_one()


async def sitemap_url(db: AsyncSession, tenant_slug: str) -> str | None:
    """홈페이지가 만드는 사이트맵 주소 (T-225)

    페이지 · 게시판 · 글 목록은 홈페이지만 안다.
    """
    result = await db.execute(
        select(Tenant.id).where(Tenant.slug == tenant_slug, Tenant.is_active == True)  # noqa: E712
    )
    if result.scalar_one_or_none() is None:
        return None

    from app.core.config import settings as app_settings

    return f"{app_settings.client_base_url}/{tenant_slug}/sitemap.xml"


# ── AEO · GEO (T-221, 사이트 관리 SM-05 · SM-06) ─────────────────────────────

FAQ_TYPE = "FAQ"
MSG_NOT_FAQ_BOARD = "FAQ 게시판만 구조화 데이터를 만들 수 있습니다."
MSG_UNKNOWN_CRAWLER = "등록되지 않은 크롤러입니다."
# 운영 시점의 각 회사 안내에 맞춰 고치는 관리 목록 — User-agent 이름 그대로
AI_CRAWLERS: dict[str, str] = {
    "GPTBot": "OpenAI 모델 학습",
    "OAI-SearchBot": "ChatGPT 검색",
    "ClaudeBot": "Anthropic 모델 학습",
    "Claude-SearchBot": "Claude 검색",
    "PerplexityBot": "Perplexity 검색",
    "Google-Extended": "Google Gemini 학습",
    "Applebot-Extended": "Apple AI 학습",
    "CCBot": "Common Crawl 수집",
}
_INLINE = {"text", "hardBreak"}


def _validation_error(message: str, field: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": "VALIDATION_ERROR", "message": message, "field": field},
    )


def _rich_text(node: dict[str, Any]) -> str:
    if node.get("type") == "text":
        return str(node.get("text", ""))
    if node.get("type") == "hardBreak":
        return "\n"
    children = [c for c in node.get("content") or [] if isinstance(c, dict)]
    inline = all(c.get("type") in _INLINE for c in children)
    return ("" if inline else "\n").join(_rich_text(c) for c in children)


def body_text(nodes: list[dict[str, Any]]) -> str:
    """글 본문 → 글자만 — 이전 블록(p · ul)과 새 편집기 본문 모두."""
    parts: list[str] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        if node.get("type") == "p":
            parts.append(str(node.get("text", "")).replace("**", ""))
        elif node.get("type") == "ul":
            parts.extend(str(item) for item in node.get("items") or [])
        elif node.get("type") != "image":
            parts.append(_rich_text(node))
    lines = (line.strip() for part in parts for line in part.split("\n"))
    return "\n".join(line for line in lines if line)


def faq_board_ids(setting: SeoSetting | None) -> set[str]:
    """FAQ 구조화 데이터를 만드는 게시판 — 홈페이지 응답에 표시한다."""
    aeo = (setting.aeo if setting else None) or {}
    return {str(i) for i in aeo.get("faq_board_ids", [])}


def _post_note(post: BoardPost, answer: str, now: datetime) -> str | None:
    """구조화 데이터에서 빠지는 까닭 — 없으면 None."""
    if post.status != board_service.STATUS_PUBLISHED:
        return "공개 전 글"
    if post.published_at is not None and post.published_at > now:
        return "예약 글"
    if post.is_secret:
        return "비밀글"
    if not answer:
        return "답변 없음"
    return None


async def get_aeo(db: AsyncSession) -> AeoResponse:
    setting = await get_seo_settings(db)
    boards = (
        await db.execute(
            select(Board)
            .where(Board.board_type == FAQ_TYPE, Board.deleted_at.is_(None))
            .order_by(Board.created_at, Board.id)
        )
    ).scalars()
    now = datetime.now(UTC)
    result: list[AeoBoard] = []
    for board in boards:
        items: list[AeoItem] = []
        for post in await board_service.faq_posts(db, board):
            answer = body_text(post.body or [])
            note = _post_note(post, answer, now)
            items.append(
                AeoItem(
                    post_id=post.id,
                    question=post.title,
                    answer=answer,
                    public=note is None,
                    note=note,
                )
            )
        result.append(
            AeoBoard(
                id=board.id,
                name=board.name,
                slug=board.slug,
                active=board.status == "ACTIVE",
                member_only=board_service.is_member_only(board),
                items=items,
            )
        )
    ids = faq_board_ids(setting)
    return AeoResponse(
        faq_board_ids=[b.id for b in result if str(b.id) in ids],
        boards=result,
    )


async def _setting_for_write(db: AsyncSession, tenant_id: UUID) -> SeoSetting:
    setting = await get_seo_settings(db)
    if setting is None:
        now = datetime.now(UTC)
        setting = SeoSetting(
            tenant_id=tenant_id,
            created_at=now,
            updated_at=now,
            keywords=[],
            robots="index,follow",
        )
        db.add(setting)
    return setting


async def update_aeo(db: AsyncSession, tenant_id: UUID, data: AeoUpdate) -> AeoResponse:
    ids = list(dict.fromkeys(data.faq_board_ids))
    if ids:
        found = set(
            (
                await db.execute(
                    select(Board.id).where(
                        Board.id.in_(ids),
                        Board.board_type == FAQ_TYPE,
                        Board.deleted_at.is_(None),
                    )
                )
            ).scalars()
        )
        if len(found) != len(ids):
            raise _validation_error(MSG_NOT_FAQ_BOARD, "faq_board_ids")
    setting = await _setting_for_write(db, tenant_id)
    setting.aeo = {"faq_board_ids": [str(i) for i in ids]}
    setting.updated_at = datetime.now(UTC)
    await db.commit()
    await site_cache.purge_site(db, tenant_id)
    db.expire_all()
    return await get_aeo(db)


def _geo_response(setting: SeoSetting | None) -> GeoResponse:
    return GeoResponse(
        settings=GeoSettings.model_validate((setting.geo if setting else None) or {}),
        crawlers=[AiCrawler(name=k, label=v) for k, v in AI_CRAWLERS.items()],
    )


async def get_geo(db: AsyncSession) -> GeoResponse:
    return _geo_response(await get_seo_settings(db))


async def update_geo(
    db: AsyncSession, tenant_id: UUID, data: GeoSettings
) -> GeoResponse:
    unknown = set(data.crawlers) - set(AI_CRAWLERS)
    if unknown:
        raise _validation_error(MSG_UNKNOWN_CRAWLER, "crawlers")
    # 기존 유지는 저장하지 않는다 — robots.txt 에 아무것도 더하지 않는 값
    data.crawlers = {k: v for k, v in data.crawlers.items() if v != "keep"}
    setting = await _setting_for_write(db, tenant_id)
    setting.geo = data.model_dump(mode="json")
    setting.updated_at = datetime.now(UTC)
    await db.commit()
    await site_cache.purge_site(db, tenant_id)
    db.expire_all()
    return _geo_response(await get_seo_settings(db))
