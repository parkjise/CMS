import dayjs from 'dayjs'
import { ChevronRight, MessageCircle } from 'lucide-react'
import { Link } from 'react-router'
import type { RecentInquiry } from '@/hooks/useDashboard'

interface RecentInquiryListProps {
  inquiries: RecentInquiry[] | undefined
  isLoading: boolean
}

const inquiryTypeLabels: Record<string, string> = {
  GENERAL: '일반 문의',
  CONSULT: '상담',
  RESERVATION: '예약',
  PARTNERSHIP: '제휴',
}

export function RecentInquiryList({ inquiries, isLoading }: RecentInquiryListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-slate-100" />
        ))}
      </div>
    )
  }

  if (!inquiries || inquiries.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center rounded-md border border-dashed border-slate-200 text-sm text-slate-400">
        <MessageCircle className="mb-2 h-6 w-6 text-slate-300" />
        미확인 문의가 없습니다.
      </div>
    )
  }

  return (
    <ul className="divide-y divide-slate-100">
      {inquiries.map((inq) => (
        <li key={inq.id}>
          <Link
            to="/admin/inquiries"
            className="flex items-center justify-between gap-3 py-3 transition hover:bg-slate-50"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <MessageCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium text-slate-900">
                    {inq.name}
                  </span>
                  <span className="flex-shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    {inquiryTypeLabels[inq.inquiry_type] ?? inq.inquiry_type}
                  </span>
                </div>
                {inq.created_at && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {dayjs(inq.created_at).format('YYYY-MM-DD HH:mm')}
                  </p>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
