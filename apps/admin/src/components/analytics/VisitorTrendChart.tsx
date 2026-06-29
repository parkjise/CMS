import dayjs from 'dayjs'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  RANGE_OPTIONS,
  type AnalyticsPoint,
  type RangeOption,
} from '@/hooks/useAnalytics'

interface VisitorTrendChartProps {
  data: AnalyticsPoint[] | undefined
  isLoading: boolean
  range: RangeOption
  maxDays: number
  onRangeChange: (range: RangeOption) => void
}

export function VisitorTrendChart({
  data,
  isLoading,
  range,
  maxDays,
  onRangeChange,
}: VisitorTrendChartProps) {
  const formatted = (data ?? []).map((p) => ({
    ...p,
    label: dayjs(p.date).format('MM/DD'),
  }))

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">방문자 추이</h2>
        <div className="flex gap-1" role="group" aria-label="기간 선택">
          {RANGE_OPTIONS.map((opt) => {
            const locked = opt > maxDays
            return (
              <button
                key={opt}
                type="button"
                disabled={locked}
                title={locked ? '상위 플랜에서 제공됩니다.' : undefined}
                aria-pressed={range === opt}
                onClick={() => onRangeChange(opt)}
                className={[
                  'rounded-md px-2.5 py-1 text-xs font-medium transition',
                  range === opt
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  locked ? 'cursor-not-allowed opacity-40' : '',
                ].join(' ')}
              >
                {opt}일
              </button>
            )
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="h-72 animate-pulse rounded-lg bg-slate-100" />
      ) : formatted.length === 0 ? (
        <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
          표시할 방문 데이터가 없습니다.
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formatted}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="page_views"
                name="페이지뷰"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="unique_visitors"
                name="순방문자"
                stroke="#16a34a"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
