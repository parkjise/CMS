"""T-107 테넌트 사이트 방문자 회원 모델 (기획서 섹션 16.9).

- SiteMember: 테넌트 홈페이지 방문자 회원 (관리자 계정 users 와 별개)
- MemberReservation: 회원 예약 내역 (업종별 항목은 detail JSONB)
- PhoneVerification: 휴대폰 인증 코드 (3분 · 5회 오입력 시 무효)
- MemberPasswordResetToken: 비밀번호 재설정 토큰 (SHA-256 해시 저장 · 30분 · 1회용)

네 테이블 모두 tenant_id 보유 → RLS 격리 대상.
이메일·소셜 계정 중복은 탈퇴(deleted_at) 회원을 제외한 부분 유니크 인덱스로 막는다
(오픈 이슈 #22 — 재가입 허용 기간은 서비스에서 판단).
"""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, SoftDeleteMixin, TimestampMixin


def _tenant_fk() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )


class SiteMember(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "site_members"
    __table_args__ = (
        Index(
            "uq_site_members_tenant_email",
            "tenant_id",
            "email",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "uq_site_members_tenant_social",
            "tenant_id",
            "social_provider",
            "social_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL AND social_id IS NOT NULL"),
        ),
        Index("idx_site_members_phone", "tenant_id", "phone"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = _tenant_fk()
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    # 소셜 가입 회원은 NULL
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # KAKAO, NAVER, NULL(이메일 가입)
    social_provider: Mapped[str | None] = mapped_column(String(20), nullable=True)
    social_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    marketing_agree: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    sms_agree: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    email_agree: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # 마이페이지 알림 설정 (16.7) — 예약 확정·취소 알림
    notify_reservation_confirmed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    notify_reservation_cancelled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 연속 로그인 실패 횟수 (5회 → locked_until 까지 잠금)
    failed_login_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 비밀번호 재설정·변경 시각 — 이전에 발급된 refresh 토큰 거부 (T-109)
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class MemberReservation(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "member_reservations"
    __table_args__ = (
        Index(
            "idx_member_reservations_member",
            "member_id",
            text("created_at DESC"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = _tenant_fk()
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("site_members.id"), nullable=False
    )
    inquiry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inquiries.id", ondelete="SET NULL"),
        nullable=True,
    )
    # MEDICAL(진료), LODGING(숙박), GENERAL(일반)
    reservation_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # PENDING, CONFIRMED, COMPLETED, CANCELLED
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PENDING", server_default="PENDING"
    )
    reserved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 업종별 항목 (진료과·초진/재진, 객실·인원·금액 등)
    detail: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )


class PhoneVerification(Base, TimestampMixin):
    __tablename__ = "phone_verifications"
    __table_args__ = (
        Index("idx_phone_verifications_lookup", "tenant_id", "phone", "purpose"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = _tenant_fk()
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    code: Mapped[str] = mapped_column(String(6), nullable=False)
    # REGISTER, FIND_EMAIL, RESET_PW
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)
    # 발급 후 3분
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 오입력 5회 초과 시 코드 무효화
    attempt_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    # 인증 완료 건을 가입 등에 사용한 시각 — 1회용 (T-108)
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class MemberPasswordResetToken(Base, TimestampMixin):
    __tablename__ = "member_password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = _tenant_fk()
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("site_members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # 원문 대신 SHA-256 해시 (DB 유출 시 재사용 방지)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    # 발급 후 30분
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # 1회용 — 사용 시각 기록
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
