import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, toast } from '@cms/ui'
import { InquiryDetailModal } from '@/components/inquiries/InquiryDetailModal'
import { InquiryFilters } from '@/components/inquiries/InquiryFilters'
import { InquiryTable } from '@/components/inquiries/InquiryTable'
import {
  type InquiryFilters as InquiryFiltersValue,
  downloadInquiriesExcel,
  useInquiries,
} from '@/hooks/useInquiries'

const DEFAULT_FILTERS: InquiryFiltersValue = { page: 1, limit: 20 }

export function InquiriesPage() {
  const [filters, setFilters] = useState<InquiryFiltersValue>(DEFAULT_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const inquiriesQuery = useInquiries(filters)
  // 미처리 건수 별도 조회 (필터와 무관)
  const pendingQuery = useInquiries({ status: 'PENDING', page: 1, limit: 1 })
  const pendingCount = pendingQuery.data?.total ?? 0

  const [downloading, setDownloading] = useState(false)
  const handleExport = async () => {
    setDownloading(true)
    try {
      await downloadInquiriesExcel()
      toast.success('엑셀 파일을 내려받았습니다.')
    } catch {
      toast.error('엑셀 내보내기에 실패했습니다.')
    } finally {
      setDownloading(false)
    }
  }

  // 미처리 배지는 헤더에 표시
  const headerBadge = useMemo(() => {
    if (pendingCount === 0) return null
    return (
      <span className="ml-2 inline-flex items-center rounded-full bg-rose-500 px-2 py-0.5 text-xs font-medium text-white">
        미처리 {pendingCount.toLocaleString()}
      </span>
    )
  }, [pendingCount])

  return (
    <div className="space-y-5 p-6 md:p-8">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center text-2xl font-bold text-slate-900">
            문의 관리
            {headerBadge}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            문의를 검색·정렬하고 상태와 메모를 관리하세요.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={handleExport}
          disabled={downloading}
        >
          <Download className="h-3.5 w-3.5" />
          {downloading ? '내려받는 중...' : '엑셀 내보내기'}
        </Button>
      </div>

      {/* 필터 */}
      <InquiryFilters value={filters} onChange={setFilters} />

      {/* 테이블 */}
      <InquiryTable
        data={inquiriesQuery.data}
        isLoading={inquiriesQuery.isLoading}
        filters={filters}
        onFiltersChange={setFilters}
        onSelect={setSelectedId}
      />

      {/* 상세 모달 */}
      <InquiryDetailModal
        inquiryId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  )
}
