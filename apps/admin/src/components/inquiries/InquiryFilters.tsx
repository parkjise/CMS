import { Search, X } from 'lucide-react'
import { Button, Input } from '@cms/ui'
import type { InquiryFilters as InquiryFiltersValue } from '@/hooks/useInquiries'
import { STATUS_OPTIONS, TYPE_LABELS } from './StatusBadge'

interface InquiryFiltersProps {
  value: InquiryFiltersValue
  onChange: (v: InquiryFiltersValue) => void
}

export function InquiryFilters({ value, onChange }: InquiryFiltersProps) {
  const update = <K extends keyof InquiryFiltersValue>(
    key: K,
    next: InquiryFiltersValue[K]
  ) => onChange({ ...value, page: 1, [key]: next })

  const reset = () => onChange({ page: 1, limit: value.limit ?? 20 })

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={value.search ?? ''}
          onChange={(e) => update('search', e.target.value || undefined)}
          placeholder="이름·연락처·내용 검색"
          className="!pl-8"
        />
      </div>

      <select
        value={value.status ?? ''}
        onChange={(e) =>
          update(
            'status',
            (e.target.value || '') as InquiryFiltersValue['status']
          )
        }
        aria-label="상태 필터"
        className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
      >
        <option value="">전체 상태</option>
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        value={value.inquiry_type ?? ''}
        onChange={(e) =>
          update(
            'inquiry_type',
            (e.target.value || '') as InquiryFiltersValue['inquiry_type']
          )
        }
        aria-label="문의 유형 필터"
        className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
      >
        <option value="">전체 유형</option>
        {Object.entries(TYPE_LABELS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>

      <select
        value={value.is_read === undefined ? '' : value.is_read ? 'true' : 'false'}
        onChange={(e) => {
          const v = e.target.value
          update('is_read', v === '' ? undefined : v === 'true')
        }}
        aria-label="읽음 여부 필터"
        className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
      >
        <option value="">읽음/미읽음 전체</option>
        <option value="false">미확인만</option>
        <option value="true">확인됨</option>
      </select>

      <Button type="button" variant="ghost" size="sm" onClick={reset}>
        <X className="h-3.5 w-3.5" />
        초기화
      </Button>
    </div>
  )
}
