"""온라인 상담 게시판 서비스 (기획서 11.9, T-123).

- 상담 글은 문의(inquiries)에 is_board=True 로 저장 → 관리자 AD-04 에서 같이 관리·답변
- 공개 목록: 제목 · 가린 이름 · 비밀글 여부 · 답변 여부 · 등록일 (스팸 처리 글 제외)
- 비밀글 상세는 작성자 비밀번호(bcrypt)를 확인한 뒤에만 내용·답변을 돌려준다
"""

import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.core.security import hash_password, verify_password
from app.models.inquiry import Inquiry
from app.schemas.inquiry_board import (
    BoardListItem,
    BoardListResponse,
    BoardPostCreate,
    BoardPostDetail,
)

BOARD_TYPE = "CONSULT"
MAX_PAGE_SIZE = 50


def mask_name(name: str) -> str:
    """홍길동 → 홍**, 김철 → 김* (첫 글자만 보이게)."""
    name = (name or "").strip()
    if not name:
        return "*"
    return name[0] + "*" * max(len(name) - 1, 1)


def _visible(tenant_id: uuid.UUID):
    return (
        Inquiry.tenant_id == tenant_id,
        Inquiry.is_board.is_(True),
        Inquiry.deleted_at.is_(None),
        Inquiry.status != "SPAM",
    )


async def list_posts(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    page: int = 1,
    size: int = 10,
    q: str | None = None,
) -> BoardListResponse:
    size = max(1, min(size, MAX_PAGE_SIZE))
    page = max(1, page)
    conditions = list(_visible(tenant_id))
    keyword = (q or "").strip()
    if keyword:
        conditions.append(Inquiry.subject.ilike(f"%{keyword}%"))

    total = (
        await db.execute(select(func.count()).select_from(Inquiry).where(*conditions))
    ).scalar_one()
    rows = (
        await db.execute(
            select(Inquiry)
            .where(*conditions)
            .order_by(Inquiry.created_at.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
    ).scalars()
    offset = (page - 1) * size
    items = [
        BoardListItem(
            id=row.id,
            no=total - offset - i,
            subject=row.subject or "(제목 없음)",
            author=mask_name(row.name),
            is_secret=row.is_secret,
            answered=bool(row.answer),
            created_at=row.created_at,
        )
        for i, row in enumerate(rows)
    ]
    return BoardListResponse(total=total, page=page, size=size, items=items)


async def _neighbor(
    db: AsyncSession, tenant_id: uuid.UUID, post: Inquiry, newer: bool
) -> uuid.UUID | None:
    column = Inquiry.created_at
    stmt = select(Inquiry.id).where(
        *_visible(tenant_id),
        column > post.created_at if newer else column < post.created_at,
    )
    stmt = stmt.order_by(column.asc() if newer else column.desc()).limit(1)
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_post(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    post_id: uuid.UUID,
    password: str | None = None,
) -> BoardPostDetail | None:
    """상세. 비밀글이면 password 가 맞을 때만 내용·답변을 담는다.

    password 를 줬는데 틀리면 ValueError — 엔드포인트에서 403.
    """
    post = (
        await db.execute(
            select(Inquiry).where(Inquiry.id == post_id, *_visible(tenant_id))
        )
    ).scalar_one_or_none()
    if post is None:
        return None

    unlocked = not post.is_secret
    if post.is_secret and password is not None:
        if not post.password_hash or not verify_password(password, post.password_hash):
            raise ValueError("WRONG_PASSWORD")
        unlocked = True

    detail = BoardPostDetail(
        id=post.id,
        subject=post.subject or "(제목 없음)",
        author=mask_name(post.name),
        is_secret=post.is_secret,
        answered=bool(post.answer),
        created_at=post.created_at,
        locked=not unlocked,
        prev_id=await _neighbor(db, tenant_id, post, newer=False),
        next_id=await _neighbor(db, tenant_id, post, newer=True),
    )
    if unlocked:
        detail.message = post.message
        detail.answer = post.answer
        detail.answered_at = post.answered_at
    return detail


async def create_post(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    data: BoardPostCreate,
    member_id: uuid.UUID | None = None,
) -> Inquiry:
    now = datetime.now(UTC)
    post = Inquiry(
        tenant_id=tenant_id,
        inquiry_type=BOARD_TYPE,
        name=data.name.strip(),
        phone=data.phone,
        subject=data.subject.strip(),
        message=data.message,
        is_board=True,
        is_secret=data.is_secret,
        password_hash=hash_password(data.password),
        # 로그인한 방문자 글은 마이페이지 문의 내역에 표시 (T-111)
        member_id=member_id,
        status="PENDING",
        is_read=False,
        created_at=now,
        updated_at=now,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)

    # 관리자 실시간 알림 · 알림톡 (문의 접수와 동일 — 실패해도 등록은 성공)
    try:
        redis = await get_redis()
        await redis.publish(
            f"inquiry:new:{tenant_id}",
            json.dumps(
                {
                    "type": "new_inquiry",
                    "id": str(post.id),
                    "name": post.name,
                    "inquiry_type": BOARD_TYPE,
                }
            ),
        )
    except Exception:  # noqa: BLE001
        pass
    try:
        from app.workers.notification import send_inquiry_alert

        send_inquiry_alert.delay(str(tenant_id), str(post.id))
    except Exception:  # noqa: BLE001
        pass
    return post
