import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react'
import { Button, toast } from '@cms/ui'
import { type Report, useCreateReport, useReport, useReports } from '@/hooks/useReports'
import { pickErrorMessage } from '@/lib/errorMessages'
import { fixLink, periodLabel } from '@/lib/reportLinks'

/** AI 월간 리포트 (기획서 13.2 기능 3 · 13.4, T-073-A) */
export function ReportsPage() {
  const list = useReports()
  const create = useCreateReport()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 처음엔 가장 최근 리포트
  useEffect(() => {
    if (!selectedId && list.data?.reports.length) setSelectedId(list.data.reports[0].id)
  }, [list.data, selectedId])

  const report = useReport(selectedId)
  const quota = list.data?.quota

  const handleCreate = () =>
    create.mutate(undefined, {
      onSuccess: (r) => {
        setSelectedId(r.id)
        toast.success('리포트를 만들었습니다.')
      },
      onError: (err) => toast.error(pickErrorMessage(err, '리포트를 만들지 못했습니다.')),
    })

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Sparkles className="h-6 w-6 text-violet-600" aria-hidden="true" />
            월간 리포트
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            매달 1일 지난달 홈페이지 · 방문 · 문의를 분석해 잘 되는 점과 손볼 점을 알려 드려요.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button onClick={handleCreate} disabled={create.isPending || quota?.remaining === 0}>
            {create.isPending ? '분석 중…' : '지금 분석하기'}
          </Button>
          {quota && (
            <span className="text-xs text-slate-500">
              이번 달 {quota.used} / {quota.limit}회 사용 (자동 리포트 포함)
            </span>
          )}
        </div>
      </div>

      {list.isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
      ) : list.isError ? (
        <p className="text-sm text-rose-600">{pickErrorMessage(list.error, '리포트를 불러오지 못했습니다.')}</p>
      ) : !list.data?.reports.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
          아직 리포트가 없어요. 다음 달 1일에 자동으로 만들어지고, [지금 분석하기]로 바로 볼 수도 있어요.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <nav aria-label="지난 리포트" className="space-y-1">
            {list.data.reports.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                aria-current={r.id === selectedId ? 'true' : undefined}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                  r.id === selectedId ? 'bg-blue-50 font-semibold text-blue-700' : 'hover:bg-slate-50'
                }`}
              >
                <span>
                  {periodLabel(r.period)}
                  {r.kind === 'MANUAL' && <span className="ml-1 text-xs text-slate-400">(직접)</span>}
                </span>
                <span className="text-xs text-amber-600">손볼 점 {r.improvement_count}</span>
              </button>
            ))}
          </nav>
          {report.data ? <ReportView report={report.data} /> : <div className="h-64 animate-pulse rounded-xl bg-slate-100" />}
        </div>
      )}
    </div>
  )
}

const change = (now: number, prev: number) => {
  if (!prev) return null
  const diff = now - prev
  return `${diff >= 0 ? '+' : ''}${diff} (지난달 ${prev})`
}

function ReportView({ report }: { report: Report }) {
  const m = report.metrics
  return (
    <article className="space-y-5" aria-label={`${periodLabel(report.period)} 리포트`}>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
          <span>{periodLabel(report.period)}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5">
            {report.source === 'ai' ? 'AI 분석' : '기본 점검'}
          </span>
        </div>
        <p className="text-sm text-slate-800">{report.summary}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="방문자" value={`${m.visitors}명`} sub={change(m.visitors, m.prev_visitors)} />
          <Metric label="문의" value={`${m.inquiries}건`} sub={change(m.inquiries, m.prev_inquiries)} />
          <Metric label="페이지뷰" value={`${m.page_views}`} />
          <Metric
            label="모바일 비율"
            value={m.mobile_ratio === null ? '—' : `${Math.round(m.mobile_ratio * 100)}%`}
          />
        </dl>
      </section>

      <section className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> 잘 되고 있는 점
        </h2>
        {report.strengths.length === 0 ? (
          <p className="text-sm text-slate-500">아직 눈에 띄는 강점을 찾지 못했어요.</p>
        ) : (
          <ul className="space-y-2">
            {report.strengths.map((s) => (
              <li key={s.code} className="text-sm">
                <span className="font-medium text-slate-900">{s.title}</span>
                <span className="ml-2 text-slate-600">{s.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-amber-100 bg-amber-50/40 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" /> 손보면 좋은 점
        </h2>
        {report.improvements.length === 0 ? (
          <p className="text-sm text-slate-500">지금은 고칠 점이 없어요. 👍</p>
        ) : (
          <ul className="space-y-3">
            {report.improvements.map((item) => {
              const link = fixLink(item)
              return (
                <li key={item.code} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{item.title}</p>
                    <p className="text-slate-600">{item.detail}</p>
                  </div>
                  {link && (
                    <Link to={link.to} className="shrink-0 text-xs font-medium text-blue-600 hover:underline">
                      {link.label} →
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </article>
  )
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-lg font-semibold text-slate-900">{value}</dd>
      {sub && <dd className="text-xs text-slate-500">{sub}</dd>}
    </div>
  )
}
