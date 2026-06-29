import { useState } from 'react'
import { MobileRatioDonut } from '@/components/analytics/MobileRatioDonut'
import { TopReferrers } from '@/components/analytics/TopReferrers'
import { VisitorTrendChart } from '@/components/analytics/VisitorTrendChart'
import { type RangeOption, useAnalytics } from '@/hooks/useAnalytics'

export function AnalyticsPage() {
  const [range, setRange] = useState<RangeOption>(7)
  const { data, isLoading } = useAnalytics(range)

  const maxDays = data?.max_days ?? 7

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">방문자 분석</h1>
        <p className="mt-1 text-sm text-slate-500">
          방문자 추이와 유입 경로를 확인하세요. 데이터 보관 기간은 플랜에 따라
          다릅니다.
        </p>
      </div>

      <VisitorTrendChart
        data={data?.series}
        isLoading={isLoading}
        range={range}
        maxDays={maxDays}
        onRangeChange={setRange}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MobileRatioDonut data={data?.mobile_ratio} isLoading={isLoading} />
        <TopReferrers data={data?.top_referrers} isLoading={isLoading} />
      </div>
    </div>
  )
}
