import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from '@cms/ui'
import { useRevenue } from '@/hooks/useRevenue'
import {
  useBillingOverview,
  useManualCharge,
  type PastDueTenant,
} from '@/hooks/useBillingOverview'

const PLAN_COLORS: Record<string, string> = {
  FREE: '#94a3b8',
  BASIC: '#0ea5e9',
  STANDARD: '#6366f1',
  PREMIUM: '#f59e0b',
}

function money(won: number): string {
  if (won >= 10_000) return `${(won / 10_000).toLocaleString()}만원`
  return `${won.toLocaleString()}원`
}

export function BillingOverviewPage() {
  const { data, isLoading, isError } = useBillingOverview()
  const { data: revenue } = useRevenue(6)
  const charge = useManualCharge()

  const handleCharge = async (t: PastDueTenant) => {
    const res = await charge.mutateAsync(t.tenant_id)
    if (res.status === 'SUCCESS') toast.success(`${t.name} 결제가 완료되었습니다.`)
    else toast.error(`${t.name} 결제가 실패했습니다.`)
  }

  return (
    <div className="p-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">결제 현황</h1>
        <p className="mt-1 text-sm text-slate-500">MRR · 연체 · 해지 · 수동 결제 (SA-06)</p>
      </div>

      {isLoading && <p className="text-sm text-slate-400">불러오는 중…</p>}
      {isError && (
        <p className="text-sm text-red-500">결제 현황을 불러오지 못했습니다.</p>
      )}

      {data && (
        <div className="space-y-6">
          {/* 통계 카드 */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: '이번달 MRR', value: money(data.mrr) },
              { label: '연체', value: `${data.past_due_count}건`, color: 'text-red-600' },
              { label: '해지', value: `${data.cancelled_count}건`, color: 'text-amber-600' },
              { label: '신규(이번달)', value: `${data.new_this_month}건`, color: 'text-emerald-600' },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">{c.label}</p>
                <p className={`mt-1 text-xl font-bold ${c.color ?? 'text-slate-900'}`}>
                  {c.value}
                </p>
              </div>
            ))}
          </div>

          {/* 차트 */}
          {revenue && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="mb-3 text-sm font-semibold text-slate-900">MRR 추이</h2>
                <div className="h-48" data-testid="mrr-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenue.mrr_trend}>
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        width={44}
                        tickFormatter={(v: number) => `${Math.round(v / 10000)}만`}
                      />
                      <Tooltip formatter={(v: number) => [money(v), 'MRR']} />
                      <Line
                        type="monotone"
                        dataKey="mrr"
                        stroke="#4f46e5"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="mb-3 text-sm font-semibold text-slate-900">플랜별 분포</h2>
                <div className="h-48" data-testid="plan-donut">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={revenue.plan_distribution}
                        dataKey="count"
                        nameKey="plan"
                        innerRadius={45}
                        outerRadius={72}
                      >
                        {revenue.plan_distribution.map((p) => (
                          <Cell key={p.plan} fill={PLAN_COLORS[p.plan] ?? '#94a3b8'} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>
          )}

          {/* 연체 테넌트 */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">연체 테넌트</h2>
            <ul className="divide-y divide-slate-100">
              {data.past_due_tenants.map((t) => (
                <li
                  key={t.subscription_id}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <span className="text-slate-700">
                    {t.name}{' '}
                    <span className="text-xs text-slate-400">
                      ({t.plan_type} · {t.amount.toLocaleString()}원)
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCharge(t)}
                    className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                  >
                    수동 결제
                  </button>
                </li>
              ))}
              {data.past_due_tenants.length === 0 && (
                <li className="py-2.5 text-sm text-slate-400">연체 테넌트가 없습니다.</li>
              )}
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}
