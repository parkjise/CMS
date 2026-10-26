import type { ReservationStatus } from '@/lib/memberAccount'

const STYLES: Record<ReservationStatus, { label: string; className: string }> = {
  PENDING: { label: '대기중', className: 'bg-amber-100 text-amber-800' },
  CONFIRMED: { label: '예약 확정', className: 'bg-emerald-100 text-emerald-800' },
  COMPLETED: { label: '완료', className: 'bg-sky-100 text-sky-800' },
  CANCELLED: { label: '취소', className: 'bg-rose-100 text-rose-700' },
}

/** 예약 상태 배지 4종 — 🟡 대기중 🟢 확정 🔵 완료 🔴 취소 (기획서 16.7) */
export const StatusBadge = ({ status }: { status: ReservationStatus }) => (
  <span
    data-status={status}
    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status].className}`}
  >
    {STYLES[status].label}
  </span>
)

/** 문의 답변 배지 */
export const AnswerBadge = ({ answered }: { answered: boolean }) => (
  <span
    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
      answered ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
    }`}
  >
    {answered ? '답변 완료' : '답변 대기'}
  </span>
)

export { RESERVATION_STATUS_LABELS as STATUS_LABELS } from '@/hooks/member/useMypage'
