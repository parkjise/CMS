import { Bot, Building2, MessageSquare, Wallet } from 'lucide-react'
import { useDashboard } from '@/hooks/useDashboard'
import { StatCard } from '@/components/dashboard/StatCard'
import { PlanDistribution } from '@/components/dashboard/PlanDistribution'
import { ExpiringTenants } from '@/components/dashboard/ExpiringTenants'
import { RecentTenants } from '@/components/dashboard/RecentTenants'
import { SystemStatus } from '@/components/dashboard/SystemStatus'

function formatMoney(won: number): string {
  if (won >= 10_000) return `${(won / 10_000).toLocaleString()}만원`
  return `${won.toLocaleString()}원`
}

export function DashboardPage() {
  const { data, isLoading, isError } = useDashboard()

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">운영 대시보드</h1>
          <p className="mt-1 text-sm text-slate-500">전체 테넌트 현황 · KPI (SA-01)</p>
        </div>
        {data && <SystemStatus system={data.system} />}
      </div>

      {isLoading && (
        <p className="text-sm text-slate-400" role="status">
          불러오는 중…
        </p>
      )}
      {isError && (
        <p className="text-sm text-red-500" role="alert">
          대시보드 데이터를 불러오지 못했습니다.
        </p>
      )}

      {data && (
        <div className="space-y-6">
          {/* KPI 카드 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="전체 테넌트"
              value={`${data.stats.total_tenants}개`}
              sub={`이번달 신규 +${data.stats.new_this_month}`}
              icon={Building2}
            />
            <StatCard
              label="이번달 MRR"
              value={formatMoney(data.stats.mrr)}
              sub={`활성 ${data.stats.active_tenants}개`}
              icon={Wallet}
            />
            <StatCard
              label="이번달 알림톡"
              value={`${data.stats.kakao_sent_this_month.toLocaleString()}건`}
              icon={MessageSquare}
            />
            <StatCard
              label="이번달 AI 사용"
              value={`${data.stats.ai_usage_this_month.toLocaleString()}건`}
              icon={Bot}
            />
          </div>

          {/* 플랜별 현황 + 만료 예정 */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <PlanDistribution
              distribution={data.plan_distribution}
              mrrTrend={data.mrr_trend}
            />
            <ExpiringTenants tenants={data.expiring_tenants} />
          </div>

          {/* 최근 신규 테넌트 */}
          <RecentTenants tenants={data.recent_tenants} />
        </div>
      )}
    </div>
  )
}
