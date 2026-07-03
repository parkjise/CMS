import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MrrTrendPoint, PlanDistributionItem } from '@/hooks/useDashboard'

interface Props {
  distribution: PlanDistributionItem[]
  mrrTrend: MrrTrendPoint[]
}

const PLAN_COLORS: Record<string, string> = {
  FREE: 'bg-slate-400',
  BASIC: 'bg-sky-500',
  STANDARD: 'bg-indigo-500',
  PREMIUM: 'bg-amber-500',
}

export function PlanDistribution({ distribution, mrrTrend }: Props) {
  const total = distribution.reduce((acc, d) => acc + d.count, 0) || 1

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">플랜별 현황</h2>

      <ul className="mt-3 space-y-2">
        {distribution.map((d) => (
          <li key={d.plan} className="flex items-center gap-3 text-sm">
            <span className="w-20 font-medium text-slate-600">{d.plan}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full ${PLAN_COLORS[d.plan] ?? 'bg-slate-400'}`}
                style={{ width: `${(d.count / total) * 100}%` }}
              />
            </div>
            <span className="w-10 text-right tabular-nums text-slate-700">
              {d.count}개
            </span>
          </li>
        ))}
        {distribution.length === 0 && (
          <li className="text-sm text-slate-400">데이터 없음</li>
        )}
      </ul>

      <h3 className="mt-5 mb-2 text-xs font-semibold text-slate-500">MRR 추이</h3>
      <div className="h-40" data-testid="mrr-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mrrTrend} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              width={48}
              tickFormatter={(v: number) => `${Math.round(v / 10000)}만`}
            />
            <Tooltip
              formatter={(v: number) => [`${v.toLocaleString()}원`, 'MRR']}
            />
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
  )
}
