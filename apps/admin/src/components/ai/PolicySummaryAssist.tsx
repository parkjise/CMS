import { useMemo, useState } from 'react'
import { Sparkles, TriangleAlert } from 'lucide-react'
import { Button } from '@cms/ui'
import { AiDrawer } from '@/components/ai/AiDrawer'
import { useAiAssist, useAiAssistEnabled } from '@/hooks/useAiAssist'
import type { PolicyKind } from '@/hooks/usePolicies'
import { AI_SITE_ASSIST, toSummaryLine } from '@/lib/aiAssist'
import { pickErrorMessage } from '@/lib/errorMessages'
import { lineDiff } from '@/lib/lineDiff'

interface PolicySummaryAssistProps {
  kind: PolicyKind
  /** 지금 공개본(없으면 기본 문안) — 바뀐 줄을 세는 기준 */
  before: string
  /** 편집 중인 본문 */
  after: string
  currentSummary: string
  maxLength: number
  onApply: (summary: string) => void
}

/** '변경 내용 요약' 옆 [✨ 바뀐 곳으로 요약] + 결과 서랍 (기획서 A-4, T-234-A) */
export function PolicySummaryAssist({
  kind,
  before,
  after,
  currentSummary,
  maxLength,
  onApply,
}: PolicySummaryAssistProps) {
  const enabled = useAiAssistEnabled(AI_SITE_ASSIST)
  const assist = useAiAssist('policy_summary')
  const [open, setOpen] = useState(false)
  const changed = useMemo(() => {
    if (!open) return { added: 0, removed: 0 }
    const lines = lineDiff(before, after)
    return {
      added: lines.filter((line) => line.kind === 'added').length,
      removed: lines.filter((line) => line.kind === 'removed').length,
    }
  }, [open, before, after])
  if (!enabled) return null

  const unchanged = before === after
  const result = assist.data?.result
  const generate = () => assist.mutate({ kind, body: after })

  return (
    <>
      <button
        type="button"
        disabled={unchanged}
        title={unchanged ? '공개본과 바뀐 곳이 없어요.' : undefined}
        onClick={() => {
          // 열 때마다 새로 — 지난 요약이 지금 본문과 어긋나지 않게
          assist.reset()
          setOpen(true)
        }}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        바뀐 곳으로 요약
      </button>
      <AiDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="AI 로 변경 내용 요약"
        usage={assist.data?.usage}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              닫기
            </Button>
            {result && (
              <Button
                type="button"
                variant="secondary"
                loading={assist.isPending}
                onClick={generate}
              >
                다시 만들기
              </Button>
            )}
            {result ? (
              <Button
                type="button"
                disabled={!result.summary.trim()}
                onClick={() => {
                  onApply(toSummaryLine(result.summary, maxLength))
                  setOpen(false)
                }}
              >
                요약 칸에 채우기
              </Button>
            ) : (
              <Button type="button" loading={assist.isPending} onClick={generate}>
                요약 만들기
              </Button>
            )}
          </>
        }
      >
        <p
          className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
          role="note"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          법적 효력이 있는 문서예요. 요약이 실제 변경과 맞는지 확인해 주세요.
        </p>
        <p className="text-sm text-slate-600" role="status">
          더한 줄 {changed.added}개 · 뺀 줄 {changed.removed}개를 보고 요약해요. 약관 전체는 보내지
          않아요.
        </p>

        {assist.isPending && <div className="h-24 animate-pulse rounded-lg bg-slate-100" />}
        {assist.isError && (
          <p className="text-sm text-rose-600" role="alert">
            {pickErrorMessage(
              assist.error,
              'AI 가 알맞은 답을 주지 못했어요. 잠시 뒤 다시 시도해 주세요.'
            )}
          </p>
        )}
        {result && !assist.isPending && (
          <section aria-label="AI 요약">
            <h3 className="mb-2 text-sm font-medium text-slate-700">요약</h3>
            <p className="whitespace-pre-line rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
              {result.summary}
            </p>
            {currentSummary.trim() && (
              <p className="mt-2 text-xs text-slate-400">
                지금: {currentSummary.trim()} — 채우면 바뀌어요.
              </p>
            )}
          </section>
        )}
      </AiDrawer>
    </>
  )
}
