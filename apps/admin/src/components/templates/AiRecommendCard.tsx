import { RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@cms/ui'
import {
  type TemplateItem,
  useRefreshRecommendations,
  useTemplateRecommendations,
} from '@/hooks/useTemplates'
import { pickErrorMessage } from '@/lib/errorMessages'

interface AiRecommendCardProps {
  /** 기능 플래그 AI_TEMPLATE_RECOMMEND (요금제 판단은 서버 · 플래그가 한다) */
  enabled: boolean
  /** 추천 id → 적용 · 미리보기에 쓸 템플릿 (업종 필터와 상관없는 전체 목록) */
  templates: TemplateItem[]
  currentId: string | null
  onApply: (template: TemplateItem) => void
  onPreview: (template: TemplateItem) => void
}

/** 추천 카드 · 불러오는 중 자리 높이 — 같아야 화면이 밀리지 않는다 */
const CARD_MIN_H = 'min-h-[8.5rem]'

/** AI 템플릿 추천 3개 + 이유 (기획서 13.4, T-070-A) */
export function AiRecommendCard({
  enabled,
  templates,
  currentId,
  onApply,
  onPreview,
}: AiRecommendCardProps) {
  const query = useTemplateRecommendations(enabled)
  const refresh = useRefreshRecommendations()

  if (!enabled) {
    return (
      <section
        aria-label="AI 템플릿 추천"
        className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500"
      >
        <Sparkles className="h-4 w-4 text-slate-400" aria-hidden="true" />
        AI 템플릿 추천은 STANDARD 이상 요금제에서 쓸 수 있어요.
      </section>
    )
  }

  const byId = new Map(templates.map((t) => [t.id, t]))
  const recs = (query.data?.recommendations ?? []).filter((r) => r.template_id !== currentId)
  const busy = query.isLoading || refresh.isPending

  return (
    <section
      aria-label="AI 템플릿 추천"
      className="space-y-3 rounded-xl border border-violet-100 bg-violet-50/50 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Sparkles className="h-4 w-4 text-violet-600" aria-hidden="true" />
          AI 추천 템플릿
          {query.data && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
              {query.data.source === 'ai' ? 'AI 분석' : '기본 추천 (업종 기준)'}
            </span>
          )}
        </h2>
        <Button
          type="button"
          variant="ghost"
          onClick={() => refresh.mutate()}
          disabled={busy}
        >
          <RefreshCw className={`mr-1 h-4 w-4 ${refresh.isPending ? 'animate-spin' : ''}`} />
          다시 추천
        </Button>
      </div>

      {busy && !query.data ? (
        // 결과 카드 3개와 같은 자리를 미리 잡아 아래 목록이 밀리지 않게 (T-043-A)
        <div role="status" aria-label="추천 고르는 중">
          <p className="sr-only">업종과 홈페이지 내용을 보고 어울리는 템플릿을 고르는 중…</p>
          <div className="grid gap-3 md:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`${CARD_MIN_H} animate-pulse rounded-lg border border-slate-200 bg-white p-3`}
              >
                <div className="h-4 w-2/3 rounded bg-slate-100" />
                <div className="mt-2 h-3 w-full rounded bg-slate-100" />
                <div className="mt-1 h-3 w-4/5 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      ) : query.isError || refresh.isError ? (
        <p className="text-sm text-rose-600" role="alert">
          {pickErrorMessage(query.error ?? refresh.error, '추천을 불러오지 못했습니다.')}
        </p>
      ) : recs.length === 0 ? (
        <p className="text-sm text-slate-500">지금 추천할 다른 템플릿이 없습니다.</p>
      ) : (
        <ol className="grid gap-3 md:grid-cols-3">
          {recs.map((rec, i) => {
            const template = byId.get(rec.template_id)
            return (
              <li
                key={rec.template_id}
                className={`${CARD_MIN_H} flex flex-col justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {i + 1}. {rec.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">{rec.reason}</p>
                </div>
                {template && (
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => onPreview(template)}>
                      미리보기
                    </Button>
                    <Button type="button" onClick={() => onApply(template)}>
                      적용
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
