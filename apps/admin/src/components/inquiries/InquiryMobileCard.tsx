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
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50"
      onClick={onSelect}
    >
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {item.is_read ? (
            <MailOpen className="h-4 w-4 flex-shrink-0 text-slate-300" />
          ) : (
            <Mail className="h-4 w-4 flex-shrink-0 text-blue-500" />
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
          className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-700"
          aria-label="상태 변경"
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
