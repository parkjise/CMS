import type { ReferrerItem } from '@/hooks/useAnalytics'

interface TopReferrersProps {
  data: ReferrerItem[] | undefined
  isLoading: boolean
}

export const REFERRER_LABELS: Record<string, string> = {
  naver: '네이버',
  google: '구글',
  instagram: '인스타그램',
  facebook: '페이스북',
  youtube: '유튜브',
  kakao: '카카오',
  daum: '다음',
  direct: '직접 유입',
  other: '기타',
}

export function TopReferrers({ data, isLoading }: TopReferrersProps) {
  const items = data ?? []
  const total = items.reduce((sum, i) => sum + i.count, 0)

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-slate-900">
        상위 유입 경로
      </h2>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          유입 경로 데이터가 없습니다.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const pct = total > 0 ? Math.round((item.count / total) * 100) : 0
            return (
              <li key={item.source}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">
                    {REFERRER_LABELS[item.source] ?? item.source}
                  </span>
                  <span className="text-slate-500">
                    {item.count.toLocaleString()} ({pct}%)
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
