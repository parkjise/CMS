import { Suspense } from 'react'
import { ChartFallback } from '@/components/charts/ChartFallback'
import { RatioPiePlot } from '@/components/charts/lazyCharts'
import type { MobileRatio } from '@/hooks/useAnalytics'

interface MobileRatioDonutProps {
  data: MobileRatio | undefined
  isLoading: boolean
}

const COLORS = { mobile: '#6366f1', desktop: '#94a3b8' }

export function MobileRatioDonut({ data, isLoading }: MobileRatioDonutProps) {
  const total = data?.total ?? 0
  const mobilePct = total > 0 ? Math.round(((data?.mobile ?? 0) / total) * 100) : 0

  const chartData = [
    { name: '모바일', value: data?.mobile ?? 0, color: COLORS.mobile },
    { name: '데스크톱', value: data?.desktop ?? 0, color: COLORS.desktop },
  ]

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-slate-900">
        모바일 비율
      </h2>
      {isLoading ? (
        <div className="h-56 animate-pulse rounded-lg bg-slate-100" />
      ) : total === 0 ? (
        <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
          데이터가 없습니다.
        </div>
      ) : (
        <div className="relative h-56">
          <Suspense fallback={<ChartFallback />}>
            <RatioPiePlot data={chartData} />
          </Suspense>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-slate-900">
              {mobilePct}%
            </span>
            <span className="text-xs text-slate-500">모바일</span>
          </div>
        </div>
      )}
    </section>
  )
}
