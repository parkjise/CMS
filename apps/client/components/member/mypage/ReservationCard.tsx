'use client'

import { useState } from 'react'
import type { MemberReservation } from '@/lib/memberAccount'
import { addDays, formatDate, formatTime, formatWon } from '@/lib/memberFormat'
import { StatusBadge } from './StatusBadge'

interface ReservationCardProps {
  reservation: MemberReservation
  onCancel: (id: string) => void
  cancelling: boolean
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const VISIT_TYPES: Record<string, string> = { FIRST: '초진', REVISIT: '재진' }

const isCancellable = (r: MemberReservation) =>
  (r.status === 'PENDING' || r.status === 'CONFIRMED') &&
  (r.reserved_at === null || new Date(r.reserved_at).getTime() > Date.now())

/** 업종별 예약 내용 (기획서 16.7 — 병원: 일시 · 진료과 · 초진/재진, 펜션: 기간 · 객실 · 인원 · 금액) */
const Body = ({ reservation: r }: { reservation: MemberReservation }) => {
  const d = r.detail
  if (r.reservation_type === 'LODGING') {
    const nights = num(d.nights)
    const guests = num(d.guests)
    const amount = num(d.amount)
    const facts = [nights && `${nights}박`, text(d.room), guests && `성인 ${guests}명`].filter(Boolean)
    return (
      <>
        {r.reserved_at && (
          <p className="font-semibold text-[color:var(--color-text-primary)]">
            {formatDate(r.reserved_at)}
            {nights ? ` ~ ${formatDate(addDays(r.reserved_at, nights)).slice(5)}` : ''}
          </p>
        )}
        {facts.length > 0 && <p className="text-sm text-[color:var(--color-text-secondary)]">{facts.join(' · ')}</p>}
        {amount !== null && (
          <p className="text-sm text-[color:var(--color-text-secondary)]">결제 금액: {formatWon(amount)}</p>
        )}
      </>
    )
  }
  const when = r.reserved_at && (
    <p className="font-semibold text-[color:var(--color-text-primary)]">
      {formatDate(r.reserved_at)} {formatTime(r.reserved_at)}
    </p>
  )
  if (r.reservation_type === 'MEDICAL') {
    const visit = text(d.visit_type)
    const facts = [text(d.department), visit && (VISIT_TYPES[visit] ?? visit)].filter(Boolean)
    return (
      <>
        {when}
        {facts.length > 0 && <p className="text-sm text-[color:var(--color-text-secondary)]">{facts.join(' · ')}</p>}
        {facts.length === 0 && text(d.subject) && (
          <p className="text-sm text-[color:var(--color-text-secondary)]">{text(d.subject)}</p>
        )}
      </>
    )
  }
  return (
    <>
      {text(d.subject) && <p className="font-semibold text-[color:var(--color-text-primary)]">{text(d.subject)}</p>}
      {when}
    </>
  )
}

const ReservationCard = ({ reservation, onCancel, cancelling }: ReservationCardProps) => {
  const [confirming, setConfirming] = useState(false)
  return (
    <li className="space-y-2 rounded-[var(--border-radius-card)] border border-[color:var(--color-border)] p-4" data-testid="reservation-card">
      <StatusBadge status={reservation.status} />
      <Body reservation={reservation} />
      {isCancellable(reservation) && (
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
