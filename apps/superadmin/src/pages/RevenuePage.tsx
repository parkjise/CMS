import { useState } from 'react'
import {
  CartesianGrid,
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
import { superApi } from '@/lib/superApi'
import { useRevenue, type ExpiringTenant } from '@/hooks/useRevenue'

const PLAN_COLORS: Record<string, string> = {
  FREE: '#94a3b8',
  BASIC: '#0ea5e9',
  STANDARD: '#6366f1',
  PREMIUM: '#f59e0b',
}

const PERIODS: (3 | 6 | 12)[] = [3, 6, 12]

function formatMoney(won: number): string {
  if (won >= 10_000) return `${(won / 10_000).toLocaleString()}만원`
  return `${won.toLocaleString()}원`
}

async function sendRenewalNotice(t: ExpiringTenant) {
  await superApi.post('/v1/announcements', {
    title: '요금제 갱신 안내',
    content: `${t.name}님의 요금제가 ${t.days_left}일 후 만료됩니다. 갱신을 진행해 주세요.`,
    type: 'WARNING',
    target_type: 'SELECTIVE',
    target_tenants: [t.id],
    show_in_admin: true,
    send_kakao: false,
    send_email: false,
    publish_now: true,
  })
}

export function RevenuePage() {
  const [months, setMonths] = useState<3 | 6 | 12>(6)
  const { data, isLoading, isError } = useRevenue(months)

  const handleRenewal = async (t: ExpiringTenant) => {
    try {
      await sendRenewalNotice(t)
      toast.success(`${t.name}에 갱신 안내를 발송했습니다.`)
    } catch {
      toast.error('갱신 안내 발송에 실패했습니다.')
    }
  }

  const movementCards = data
    ? [
        { label: '신규', value: data.movement.new, color: 'text-emerald-600' },
        { label: '해지', value: data.movement.churned, color: 'text-rose-600' },
        { label: '업그레이드', value: data.movement.upgraded, color: 'text-indigo-600' },
        { label: '다운그레이드', value: data.movement.downgraded, color: 'text-amber-600' },
      ]
    : []

  return (
    <div className="p-8">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">수익 관리</h1>
          <p className="mt-1 text-sm text-slate-500">MRR · 플랜 분포 · 이동 현황</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 p-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setMonths(p)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${
                months === p ? 'bg-indigo-600 text-white' : 'text-slate-500'
              }`}
            >
              {p}개월
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-400">불러오는 중…</p>}
      {isError && (
        <p className="text-sm text-red-500">수익 데이터를 불러오지 못했습니다.</p>
      )}

      {data && (
        <div className="space-y-6">
          {/* 이동 현황 */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {movementCards.map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <p className="text-xs font-medium text-slate-500">{c.label}</p>
                <p className={`mt-1 text-2xl font-bold ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* MRR 추이 */}
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                MRR 추이 ({months}개월)
              </h2>
              <div className="h-56" data-testid="mrr-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.mrr_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      width={48}
                      tickFormatter={(v: number) => `${Math.round(v / 10000)}만`}
                    />
                    <Tooltip formatter={(v: number) => [formatMoney(v), 'MRR']} />
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

            {/* 플랜별 도넛 */}
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                플랜별 테넌트 수
              </h2>
              <div className="h-56" data-testid="plan-donut">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.plan_distribution}
                      dataKey="count"
                      nameKey="plan"
                      innerRadius={50}
                      outerRadius={80}
                    >
                      {data.plan_distribution.map((p) => (
                        <Cell key={p.plan} fill={PLAN_COLORS[p.plan] ?? '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                {data.plan_distribution.map((p) => (
                  <li key={p.plan} className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: PLAN_COLORS[p.plan] ?? '#94a3b8' }}
                    />
                    {p.plan} {p.count}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* 만료 예정 + 갱신 알림 */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">만료 예정 테넌트</h2>
            <ul className="divide-y divide-slate-100">
              {data.expiring_tenants.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-slate-700">
                    {t.name}{' '}
                    <span className="text-xs text-slate-400">({t.plan_type})</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        t.days_left <= 3
                          ? 'text-xs text-red-600'
                          : 'text-xs text-amber-600'
                      }
                    >
                      {t.days_left}일 후 만료
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRenewal(t)}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
                    >
                      갱신 알림
                    </button>
                  </div>
                </li>
              ))}
              {data.expiring_tenants.length === 0 && (
                <li className="py-2.5 text-sm text-slate-400">
                  만료 예정 테넌트가 없습니다.
                </li>
              )}
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}
