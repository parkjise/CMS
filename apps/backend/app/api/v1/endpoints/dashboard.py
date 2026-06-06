from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_with_rls
from app.models.analytics import SiteAnalytics
from app.models.inquiry import Inquiry
from app.models.user import User
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _today() -> date:
    return datetime.now(UTC).date()


def _week_start() -> date:
    today = _today()
    return today - timedelta(days=today.weekday())


# ── Stats ─────────────────────────────────────────────────────────────────────


@router.get("/stats", response_model=ApiResponse[dict])
async def get_stats(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    today = _today()
    week_start = _week_start()
    tid = current_user.tenant_id

    today_row = await db.execute(
        select(SiteAnalytics).where(
            SiteAnalytics.tenant_id == tid,
            SiteAnalytics.date == today,
        )
    )
    today_analytics = today_row.scalar_one_or_none()

    week_result = await db.execute(
        select(
            func.sum(SiteAnalytics.page_views),
            func.sum(SiteAnalytics.unique_visitors),
        ).where(
            SiteAnalytics.tenant_id == tid,
            SiteAnalytics.date >= week_start,
        )
    )
    week_views, week_visitors = week_result.one()

    new_inquiries = await db.execute(
        select(func.count()).where(
            Inquiry.tenant_id == tid,
            Inquiry.deleted_at.is_(None),
            func.date(Inquiry.created_at) == today,
        )
    )
    pending_inquiries = await db.execute(
        select(func.count()).where(
            Inquiry.tenant_id == tid,
            Inquiry.deleted_at.is_(None),
            Inquiry.status == "PENDING",
        )
    )

    return ApiResponse.ok(
        {
            "today_page_views": today_analytics.page_views if today_analytics else 0,
            "today_unique_visitors": (
                today_analytics.unique_visitors if today_analytics else 0
            ),
            "week_page_views": int(week_views or 0),
            "week_unique_visitors": int(week_visitors or 0),
            "new_inquiries_today": new_inquiries.scalar_one(),
            "pending_inquiries": pending_inquiries.scalar_one(),
        }
    )


# ── Chart ─────────────────────────────────────────────────────────────────────


@router.get("/chart", response_model=ApiResponse[list[dict]])
async def get_chart(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    today = _today()
    since = today - timedelta(days=6)
    tid = current_user.tenant_id

    result = await db.execute(
        select(SiteAnalytics)
        .where(SiteAnalytics.tenant_id == tid, SiteAnalytics.date >= since)
        .order_by(SiteAnalytics.date)
    )
    rows = {r.date: r for r in result.scalars().all()}

    chart = []
    for i in range(7):
        day = since + timedelta(days=i)
        row = rows.get(day)
        chart.append(
            {
                "date": day.isoformat(),
                "page_views": row.page_views if row else 0,
                "unique_visitors": row.unique_visitors if row else 0,
            }
        )

    return ApiResponse.ok(chart)


# ── Recent Inquiries ───────────────────────────────────────────────────────────


@router.get("/recent-inquiries", response_model=ApiResponse[list[dict]])
async def get_recent_inquiries(
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Inquiry)
        .where(
            Inquiry.tenant_id == current_user.tenant_id,
            Inquiry.deleted_at.is_(None),
            Inquiry.is_read == False,  # noqa: E712
        )
        .order_by(Inquiry.created_at.desc())
        .limit(5)
    )
    inquiries = result.scalars().all()

    return ApiResponse.ok(
        [
            {
                "id": str(inq.id),
                "name": inq.name,
                "inquiry_type": inq.inquiry_type,
                "status": inq.status,
                "created_at": inq.created_at.isoformat() if inq.created_at else None,
            }
            for inq in inquiries
        ]
    )
