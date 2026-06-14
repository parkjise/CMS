import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight, Mail, MailOpen } from 'lucide-react'
import { Button, toast } from '@cms/ui'
import {
  type InquiryFilters,
  type InquiryListItem,
  type InquiryListResponse,
  type InquiryStatus,
  useUpdateInquiry,
} from '@/hooks/useInquiries'
import { InquiryMobileCard } from './InquiryMobileCard'
import { STATUS_OPTIONS, TYPE_LABELS } from './StatusBadge'

interface InquiryTableProps {
  data?: InquiryListResponse
  isLoading: boolean
  filters: InquiryFilters
  onFiltersChange: (f: InquiryFilters) => void
  onSelect: (id: string) => void
}

export function InquiryTable({
  data,
  isLoading,
  filters,
  onFiltersChange,
  onSelect,
}: InquiryTableProps) {
  const updateMutation = useUpdateInquiry()

  const handleStatusChange = (item: InquiryListItem, next: InquiryStatus) => {
    if (item.status === next) return
    updateMutation.mutate(
      { id: item.id, payload: { status: next } },
      {
        onError: () => toast.error('상태 변경에 실패했습니다.'),
      }
    )
  }

  const page = filters.page ?? 1
  const limit = filters.limit ?? 20
  const total = data?.total ?? 0
  const totalPages = total === 0 ? 1 : Math.ceil(total / limit)

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* 모바일 카드 (<md) */}
      <div className="space-y-3 p-3 md:hidden">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-50"
            />
          ))}

        {!isLoading && (data?.items.length ?? 0) === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            조회된 문의가 없습니다.
          </p>
        )}

        {!isLoading &&
          data?.items.map((item) => (
            <InquiryMobileCard
              key={item.id}
              item={item}
              onSelect={() => onSelect(item.id)}
              onStatusChange={(next) => handleStatusChange(item, next)}
            />
          ))}
      </div>

      {/* 데스크톱 테이블 (≥md) */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">문의 목록 테이블</caption>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th scope="col" className="w-10 px-3 py-2.5">
                <span className="sr-only">읽음 여부</span>
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                이름
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                유형
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                연락처
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                상태
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                접수일시
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-3 py-3">
                    <div className="h-8 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))}

            {!isLoading && (data?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center text-sm text-slate-500">
                  조회된 문의가 없습니다.
                </td>
              </tr>
            )}

            {!isLoading &&
              data?.items.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer hover:bg-slate-50 focus-within:bg-slate-50"
                  onClick={() => onSelect(item.id)}
                >
                  <td className="px-3 py-3">
                    {item.is_read ? (
                      <>
                        <MailOpen
                          className="h-4 w-4 text-slate-400"
                          aria-hidden="true"
                        />
                        <span className="sr-only">읽음</span>
                      </>
                    ) : (
                      <>
                        <Mail
                          className="h-4 w-4 text-blue-500"
                          aria-hidden="true"
                        />
                        <span className="sr-only">미확인</span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3 font-medium text-slate-900">
                    {item.name}
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {TYPE_LABELS[item.inquiry_type] ?? item.inquiry_type}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{item.phone}</td>
                  <td
                    className="px-3 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <select
                      value={item.status}
                      onChange={(e) =>
                        handleStatusChange(item, e.target.value as InquiryStatus)
                      }
                      aria-label={`${item.name}님 문의 상태 변경`}
                      className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-700"
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-slate-500">
                    {dayjs(item.created_at).format('YYYY-MM-DD HH:mm')}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
        <span>
          총 <strong className="text-slate-700">{total.toLocaleString()}</strong>건
          · {page} / {totalPages} 페이지
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => onFiltersChange({ ...filters, page: page - 1 })}
            aria-label="이전 페이지"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            이전
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onFiltersChange({ ...filters, page: page + 1 })}
            aria-label="다음 페이지"
          >
            다음
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
