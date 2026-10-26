'use client'

import { useState } from 'react'
import { describeReservation } from '@/hooks/member/useMypage'
import type { MemberReservation } from '@/lib/memberAccount'
import { StatusBadge } from './StatusBadge'

interface ReservationCardProps {
  reservation: MemberReservation
  onCancel: (id: string) => void
  cancelling: boolean
}

/** 예약 카드 — 공통 화면 (업종별 내용: describeReservation) */
const ReservationCard = ({ reservation, onCancel, cancelling }: ReservationCardProps) => {
  const [confirming, setConfirming] = useState(false)
  const view = describeReservation(reservation)
  const strong = 'font-semibold text-[color:var(--color-text-primary)]'
  const muted = 'text-sm text-[color:var(--color-text-secondary)]'
  return (
    <li className="space-y-2 rounded-[var(--border-radius-card)] border border-[color:var(--color-border)] p-4" data-testid="reservation-card">
      <StatusBadge status={reservation.status} />
      {view.title && <p className={strong}>{view.title}</p>}
      {view.when && <p className={strong}>{view.when}</p>}
      {view.meta && <p className={muted}>{view.meta}</p>}
      {view.amount && <p className={muted}>{view.amount}</p>}
      {view.cancellable && (
        <div className="flex justify-end gap-2 pt-1">
          {confirming ? (
            <>
              <span className="self-center text-xs text-[color:var(--color-text-muted)]">예약을 취소할까요?</span>
              <button type="button" className="rounded-md px-3 py-1.5 text-xs text-[color:var(--color-text-secondary)]" onClick={() => setConfirming(false)}>
                아니요
              </button>
              <button
                type="button"
                className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                disabled={cancelling}
                onClick={() => onCancel(reservation.id)}
              >
                취소하기
              </button>
            </>
          ) : (
            <button
              type="button"
              className="rounded-md border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text-secondary)]"
              onClick={() => setConfirming(true)}
            >
              예약 취소
            </button>
          )}
        </div>
      )}
    </li>
  )
}

export default ReservationCard
