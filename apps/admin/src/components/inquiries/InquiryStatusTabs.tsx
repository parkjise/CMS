import type { InquiryStatus } from '@/hooks/useInquiries'
import { STATUS_OPTIONS } from './StatusBadge'

interface InquiryStatusTabsProps {
  /** 상태 조건만 뺀 건수 — 없으면(불러오는 중) 숫자를 숨긴다 */
  counts?: Partial<Record<InquiryStatus, number>>
  value?: InquiryStatus
  onChange: (status: InquiryStatus | undefined) => void
}

/** 처리 상태별 건수 탭 (T-202, AD-04) — 고르면 그 상태만 */
export function InquiryStatusTabs({ counts, value, onChange }: InquiryStatusTabsProps) {
  const total = counts ? Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0) : null
  const tabs = [
    { key: undefined, label: '전체', count: total },
    ...STATUS_OPTIONS.map((o) => ({
      key: o.value,
      label: o.label,
      count: counts?.[o.value] ?? null,
    })),
  ]
  return (
    <div
      className="flex flex-wrap gap-1 border-b border-slate-200"
      role="group"
      aria-label="처리 상태"
    >
      {tabs.map((tab) => {
        const active = tab.key === value
        return (
          <button
            key={tab.label}
            type="button"
            aria-pressed={active}
            aria-label={tab.count === null ? tab.label : `${tab.label} ${tab.count}건`}
            onClick={() => onChange(tab.key)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
              active
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
            {tab.count !== null && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs ${
                  active ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.count.toLocaleString()}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
