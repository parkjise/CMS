import type { InquiryStatus } from '@/hooks/useInquiries'

const STATUS_META: Record<InquiryStatus, { label: string; cls: string }> = {
  PENDING: {
    label: '대기',
    cls: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  IN_PROGRESS: {
    label: '처리중',
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  DONE: {
    label: '완료',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  SPAM: {
    label: '스팸',
    cls: 'bg-slate-100 text-slate-500 border-slate-200',
  },
}

interface StatusBadgeProps {
  status: InquiryStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const meta = STATUS_META[status]
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${meta.cls}`}
    >
      {meta.label}
    </span>
  )
}

export const STATUS_OPTIONS: { value: InquiryStatus; label: string }[] = [
  { value: 'PENDING', label: '대기' },
  { value: 'IN_PROGRESS', label: '처리중' },
  { value: 'DONE', label: '완료' },
  { value: 'SPAM', label: '스팸' },
]

export const TYPE_LABELS: Record<string, string> = {
  GENERAL: '일반',
  CONSULT: '상담',
  RESERVATION: '예약',
  PARTNERSHIP: '제휴',
}
