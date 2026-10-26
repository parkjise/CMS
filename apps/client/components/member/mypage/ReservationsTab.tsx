'use client'

import { useState } from 'react'
import { useCancelReservation, useReservations } from '@/hooks/member/useMemberAccount'
import type { ReservationStatus } from '@/lib/memberAccount'
import { FormError, inputClass } from '../fields'
import ReservationCard from './ReservationCard'
import { STATUS_LABELS } from './StatusBadge'

const MONTH_OPTIONS = [
  { value: 3, label: '최근 3개월' },
  { value: 6, label: '최근 6개월' },
  { value: 12, label: '최근 1년' },
  { value: 0, label: '전체 기간' },
]

/** 내 예약 탭 (기획서 16.7) */
const ReservationsTab = ({ slug }: { slug: string }) => {
  const [status, setStatus] = useState<ReservationStatus | null>(null)
  const [months, setMonths] = useState<number>(3)
  const reservations = useReservations(slug, status, months || null)
  const cancel = useCancelReservation(slug)

  const items = reservations.data?.items ?? []
  return (
    <section aria-labelledby="tab-reservations" className="space-y-4">
      <div className="flex gap-2">
        <select
          aria-label="예약 상태"
          className={inputClass}
          value={status ?? ''}
          onChange={(e) => setStatus((e.target.value || null) as ReservationStatus | null)}
        >
          <option value="">전체</option>
          {(Object.keys(STATUS_LABELS) as ReservationStatus[]).map((key) => (
            <option key={key} value={key}>
              {STATUS_LABELS[key]}
            </option>
          ))}
        </select>
        <select
          aria-label="조회 기간"
          className={inputClass}
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
        >
          {MONTH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <FormError message={cancel.error?.message ?? reservations.error?.message} />
      {reservations.isLoading ? (
        <p className="text-sm text-[color:var(--color-text-muted)]">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">예약 내역이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((reservation) => (
            <ReservationCard
              key={reservation.id}
              reservation={reservation}
              cancelling={cancel.isPending}
              onCancel={(id) => cancel.mutate(id)}
            />
          ))}
        </ul>
      )}
      <p className="text-xs text-[color:var(--color-text-subtle)]">
        예약 상태: 🟡 대기중 🟢 확정 🔵 완료 🔴 취소
      </p>
    </section>
  )
}

export default ReservationsTab
