import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { BodyNode } from '@cms/types'
import { Button } from '@cms/ui'
import { AiDrawer } from '@/components/ai/AiDrawer'
import { useAiAssist, useAiAssistEnabled } from '@/hooks/useAiAssist'
import { AI_SITE_ASSIST, type AssistTone, TONES } from '@/lib/aiAssist'
import { draftToNodes } from '@/lib/aiPostDraft'
import { pickErrorMessage } from '@/lib/errorMessages'
import { bodyToText } from '@/lib/richBody'

const TRIGGER =
  'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent'

interface ContentDraftState {
  typeId: string
  title: string
  summary: string
  body: BodyNode[]
}

const AiError = ({ error }: { error: unknown }) => (
  <p className="text-sm text-rose-600" role="alert">
    {pickErrorMessage(error, 'AI 가 알맞은 답을 주지 못했어요. 잠시 뒤 다시 시도해 주세요.')}
  </p>
)

interface ContentPolishAssistProps extends ContentDraftState {
  /** 고른 것만 — 저장은 그 화면의 버튼으로 */
  onApply: (picked: { summary?: string; body?: BodyNode[] }) => void
}

/** 요약 옆 [✨ 문장 다듬기] (T-259, 콘텐츠 관리 기획서 CM-02) — 요약 · 본문을 골라 채운다 */
export function ContentPolishAssist({ typeId, title, summary, body, onApply }: ContentPolishAssistProps) {
  const enabled = useAiAssistEnabled(AI_SITE_ASSIST)
  const assist = useAiAssist('content_polish')
  const [open, setOpen] = useState(false)
  const [tone, setTone] = useState<AssistTone>('trust')
  const [pickSummary, setPickSummary] = useState(true)
  const [pickBody, setPickBody] = useState(true)
  if (!enabled) return null

  const text = bodyToText(body)
  const empty = !title.trim() || !(summary.trim() || text)
  const result = assist.data?.result
  const generate = () =>
    assist.mutate(
      { tone, content_type_id: typeId, title, summary, text },
      {
        onSuccess: ({ result: r }) => {
          setPickSummary(Boolean(r.summary))
          setPickBody(r.body.length > 0)
        },
      }
    )

  return (
    <>
      <button
        type="button"
        className={TRIGGER}
        disabled={empty}
        title={empty ? '제목과 요약 또는 본문을 먼저 써 주세요.' : undefined}
        onClick={() => {
          assist.reset()
          setOpen(true)
        }}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        문장 다듬기
      </button>
      <AiDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="AI 로 문장 다듬기"
        usage={assist.data?.usage}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              닫기
            </Button>
            {result ? (
              <Button
                type="button"
                disabled={!(pickSummary || pickBody)}
                onClick={() => {
                  onApply({
                    ...(pickSummary && result.summary ? { summary: result.summary } : {}),
                    ...(pickBody && result.body.length ? { body: draftToNodes(result.body) } : {}),
                  })
                  setOpen(false)
                }}
              >
                고른 것 채우기
              </Button>
            ) : (
              <Button type="button" loading={assist.isPending} onClick={generate}>
                다듬기
              </Button>
            )}
          </>
        }
      >
        <fieldset className="flex flex-wrap gap-2 text-sm" aria-label="말투">
          {TONES.map((t) => (
            <label key={t.value} className="flex items-center gap-1">
              <input
                type="radio"
                name="content-polish-tone"
                checked={tone === t.value}
                onChange={() => setTone(t.value)}
              />
              {t.label}
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-slate-500">
          쓴 내용만 다듬어요. 없는 사실은 더하지 않지만, 숫자 · 일정은 꼭 다시 확인해 주세요.
        </p>
        {assist.isPending && <div className="h-24 animate-pulse rounded-lg bg-slate-100" />}
        {assist.isError && <AiError error={assist.error} />}
        {result && !assist.isPending && (
          <div className="space-y-4">
            {result.summary && (
              <section aria-label="다듬은 요약" className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={pickSummary} onChange={(e) => setPickSummary(e.target.checked)} />
                  요약 바꾸기
                </label>
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
                  {result.summary}
                </p>
                {summary.trim() && <p className="text-xs text-slate-400">지금: {summary.trim()}</p>}
              </section>
            )}
            {result.body.length > 0 && (
              <section aria-label="다듬은 본문" className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={pickBody} onChange={(e) => setPickBody(e.target.checked)} />
                  본문 바꾸기 (지금 본문은 이걸로 바뀌어요)
                </label>
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
                  {result.body.map((block, i) =>
                    block.type === 'p' ? (
                      <p key={i}>{block.text}</p>
                    ) : (
                      <ul key={i} className="list-disc pl-5">
                        {block.items.map((item, j) => (
                          <li key={j}>{item}</li>
                        ))}
                      </ul>
                    )
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </AiDrawer>
    </>
  )
}

interface ContentTagAssistProps extends ContentDraftState {
  tags: string[]
  onApply: (names: string[]) => void
}

/** 태그 옆 [✨ 태그 추천] (T-259, CM-05) — 있는 태그가 먼저, 고른 것만 더한다 */
export function ContentTagAssist({ typeId, title, summary, body, tags, onApply }: ContentTagAssistProps) {
  const enabled = useAiAssistEnabled(AI_SITE_ASSIST)
  const assist = useAiAssist('content_tags')
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  if (!enabled) return null

  const result = assist.data?.result
  const generate = () =>
    assist.mutate(
      { content_type_id: typeId, title, summary, text: bodyToText(body), tags },
      { onSuccess: ({ result: r }) => setPicked(r.tags.filter((t) => t.existing).map((t) => t.name)) }
    )

  return (
    <>
      <button
        type="button"
        className={TRIGGER}
        disabled={!title.trim()}
        title={!title.trim() ? '제목을 먼저 써 주세요.' : undefined}
        onClick={() => {
          assist.reset()
          setOpen(true)
        }}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        태그 추천
      </button>
      <AiDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="AI 로 태그 추천"
        usage={assist.data?.usage}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              닫기
            </Button>
            {result ? (
              <Button
                type="button"
                disabled={picked.length === 0}
                onClick={() => {
                  onApply(picked)
                  setOpen(false)
                }}
              >
                고른 태그 더하기
              </Button>
            ) : (
              <Button type="button" loading={assist.isPending} onClick={generate}>
                추천받기
              </Button>
            )}
          </>
        }
      >
        <p className="text-xs text-slate-500">
          이미 있는 태그를 먼저 추천해요. 새 태그는 저장할 때 만들어져요.
        </p>
        {assist.isPending && <div className="h-16 animate-pulse rounded-lg bg-slate-100" />}
        {assist.isError && <AiError error={assist.error} />}
        {result && !assist.isPending && (
          <ul className="space-y-1.5" aria-label="추천 태그">
            {result.tags.map((t) => (
              <li key={t.name}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={picked.includes(t.name)}
                    onChange={() =>
                      setPicked((p) => (p.includes(t.name) ? p.filter((x) => x !== t.name) : [...p, t.name]))
                    }
                  />
                  #{t.name}
                  <span className="text-xs text-slate-400">{t.existing ? '있는 태그' : '새 태그'}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </AiDrawer>
    </>
  )
}
