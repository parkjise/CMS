import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useMonitoring } from '@/hooks/useMonitoring'

export function MonitoringPage() {
  const { data, isLoading, isError } = useMonitoring()

  return (
    <div className="p-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">모니터링</h1>
        <p className="mt-1 text-sm text-slate-500">
          AI 비용 · 알림톡 · 큐 · 에러 (비용은 추정치)
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-400">불러오는 중…</p>}
      {isError && (
        <p className="text-sm text-red-500">모니터링 데이터를 불러오지 못했습니다.</p>
      )}

      {data && (
        <div className="space-y-6">
          {/* 요약 카드 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">이번달 알림톡</p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {data.kakao.this_month_count.toLocaleString()}건
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                추정 비용 {data.kakao.estimated_cost_krw.toLocaleString()}원
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">AI 누적 토큰(6개월)</p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {data.ai_cost.total_tokens.toLocaleString()}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                추정 ${data.ai_cost.estimated_cost_usd}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">Celery 큐</p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                대기 {data.queue.pending}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                워커 {data.queue.workers}대
              </p>
            </div>
          </div>

          {/* AI 비용 월별 차트 */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              AI 비용 월별 (추정 USD)
            </h2>
            <div className="h-56" data-testid="ai-cost-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.ai_cost.monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} width={48} />
                  <Tooltip
                    formatter={(v: number) => [`$${v}`, '추정 비용']}
                  />
                  <Bar dataKey="cost_usd" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* 에러 목록 */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">서버 에러</h2>
            {!data.errors.sentry_configured ? (
              <p className="text-sm text-slate-400">
                Sentry가 아직 연동되지 않았습니다. 연동 후 최근 에러가 표시됩니다.
              </p>
            ) : data.errors.items.length === 0 ? (
              <p className="text-sm text-slate-400">최근 에러가 없습니다.</p>
            ) : (
              <ul className="space-y-1 text-sm text-slate-600">
                {data.errors.items.map((e, i) => (
                  <li key={i} className="flex justify-between">
                    <span className="truncate">{e.message}</span>
                    <span className="text-slate-400">{e.count}회</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
