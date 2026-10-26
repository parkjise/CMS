"""T-115 방문자 회원 기능 플래그 (기획서 16.0 · 16.2 · 14.3).

- SITE_MEMBER: 회원 기능 전체
  OFF 면 방문자 인증 · 마이페이지 API 403, 홈페이지 회원 메뉴 숨김
- MEMBER_RESERVATION: 마이페이지 내 예약 (업종 기본: 병원 · 펜션)
- MEMBER_SOCIAL_LOGIN: 카카오 · 네이버 로그인
하위 기능은 SITE_MEMBER 가 켜져 있을 때만 유효하다.
"""

from dataclasses import dataclass

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import member_errors as errors
from app.core.member_errors import MemberAuthError
from app.models.feature import Feature, TenantFeature
from app.models.tenant import Tenant

SITE_MEMBER = "SITE_MEMBER"
MEMBER_RESERVATION = "MEMBER_RESERVATION"
MEMBER_SOCIAL_LOGIN = "MEMBER_SOCIAL_LOGIN"
MEMBER_FEATURE_KEYS = (SITE_MEMBER, MEMBER_RESERVATION, MEMBER_SOCIAL_LOGIN)
# 예약 기능 기본 ON 업종 (기획서 16.2)
RESERVATION_INDUSTRIES = ("HOSPITAL", "PENSION")


@dataclass(frozen=True)
class MemberFlags:
    enabled: bool
    reservations: bool
    social_login: bool


async def flags_for(db: AsyncSession, tenant: Tenant) -> MemberFlags:
    """테넌트 회원 기능 상태.

    슈퍼 어드민이 켜고 끈 값(tenant_features 행)이 우선이고, 행이 없으면 업종 기본값.
    (마이그레이션 0024 · 테넌트 생성 시 행을 만들므로 실제로는 거의 항상 행이 있다)
    """
    rows = await db.execute(
        select(Feature.key, TenantFeature.is_enabled)
        .outerjoin(
            TenantFeature,
            and_(
                TenantFeature.feature_id == Feature.id,
                TenantFeature.tenant_id == tenant.id,
            ),
        )
        .where(Feature.key.in_(MEMBER_FEATURE_KEYS), Feature.is_active.is_(True))
    )
    explicit = {key: value for key, value in rows.all()}

    def on(key: str) -> bool:
        if key not in explicit:  # 기능 자체가 비활성 (슈퍼 어드민 마스터 OFF)
            return False
        value = explicit[key]
        if value is None:
            return bool(default_enabled_for(key, tenant.template_type))
        return bool(value)

    enabled = on(SITE_MEMBER)
    return MemberFlags(
        enabled=enabled,
        reservations=enabled and on(MEMBER_RESERVATION),
        social_login=enabled and on(MEMBER_SOCIAL_LOGIN),
    )


async def ensure(db: AsyncSession, tenant: Tenant, key: str) -> None:
    """기능이 꺼져 있으면 403 FEATURE_DISABLED."""
    flags = await flags_for(db, tenant)
    allowed = {
        SITE_MEMBER: flags.enabled,
        MEMBER_RESERVATION: flags.reservations,
        MEMBER_SOCIAL_LOGIN: flags.social_login,
    }[key]
    if not allowed:
        raise MemberAuthError(403, "FEATURE_DISABLED", errors.FEATURE_DISABLED)


def default_enabled_for(key: str, template_type: str) -> bool | None:
    """업종별 기본값 — 회원 기능이 아니면 None (feature.default_enabled 를 따름)."""
    if key == MEMBER_RESERVATION:
        return template_type in RESERVATION_INDUSTRIES
    if key in (SITE_MEMBER, MEMBER_SOCIAL_LOGIN):
        return True
    return None
