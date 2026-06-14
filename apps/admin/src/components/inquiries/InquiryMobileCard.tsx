import dayjs from 'dayjs'
import { Mail, MailOpen } from 'lucide-react'
import type { InquiryListItem, InquiryStatus } from '@/hooks/useInquiries'
import { STATUS_OPTIONS, StatusBadge, TYPE_LABELS } from './StatusBadge'

interface InquiryMobileCardProps {
  item: InquiryListItem
  onSelect: () => void
  onStatusChange: (next: InquiryStatus) => void
}

export function InquiryMobileCard({
  item,
  onSelect,
  onStatusChange,
}: InquiryMobileCardProps) {
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`${item.name}님 문의 상세 보기`}
      className="cursor-pointer rounded-lg border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {item.is_read ? (
            <>
              <MailOpen
                className="h-4 w-4 flex-shrink-0 text-slate-400"
                aria-hidden="true"
              />
              <span className="sr-only">읽음</span>
            </>
          ) : (
            <>
              <Mail
                className="h-4 w-4 flex-shrink-0 text-blue-500"
                aria-hidden="true"
              />
              <span className="sr-only">미확인</span>
            </>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {item.name}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {TYPE_LABELS[item.inquiry_type] ?? item.inquiry_type} ·{' '}
              {item.phone}
            </p>
          </div>
        </div>
        <StatusBadge status={item.status} />
      </header>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs">
        <span className="text-slate-500">
          {dayjs(item.created_at).format('YYYY-MM-DD HH:mm')}
        </span>
        <select
          value={item.status}
          onChange={(e) => onStatusChange(e.target.value as InquiryStatus)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-700"
          aria-label={`${item.name}님 문의 상태 변경`}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </article>
  )
}
