import dayjs from 'dayjs'
import { Suspense } from 'react'
import { ChartFallback } from '@/components/charts/ChartFallback'
import { VisitorLinePlot } from '@/components/charts/lazyCharts'
import type { ChartPoint } from '@/hooks/useDashboard'

interface VisitorChartProps {
  data: ChartPoint[] | undefined
  isLoading: boolean
}

export function VisitorChart({ data, isLoading }: VisitorChartProps) {
  if (isLoading) {
    return (
      <div className="h-72 animate-pulse rounded-lg bg-slate-100" />
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
        지난 7일간 방문 데이터가 없습니다.
      </div>
    )
  }

  const formatted = data.map((p) => ({
    ...p,
    label: dayjs(p.date).format('MM/DD'),
  }))

  return (
    <div className="h-72">
      <Suspense fallback={<ChartFallback />}>
        <VisitorLinePlot data={formatted} />
      </Suspense>
    </div>
  )
}
