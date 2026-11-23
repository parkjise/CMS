import { useState } from 'react'
import { Sparkles, TriangleAlert } from 'lucide-react'
import { Button } from '@cms/ui'
import { AiDrawer } from '@/components/ai/AiDrawer'
import { useAiAssist, useAiAssistEnabled } from '@/hooks/useAiAssist'
import {
  type AssistKind,
  type AssistResults,
  type AssistTone,
  TONES,
  hasNumber,
} from '@/lib/aiAssist'
import { pickErrorMessage } from '@/lib/errorMessages'

type Value = string | string[]

export interface FillField<K extends AssistKind> {
  key: keyof AssistResults[K] & string
  label: string
  /** 지금 폼의 값 — 비어 있으면 처음부터 골라 둔다 */
  current: Value
}

interface AiFillAssistProps<K extends AssistKind> {
  kind: K
  flag: string
  buttonLabel: string
  title: string
  fields: FillField<K>[]
  /** 고른 칸만 넘긴다 — 폼에 채우면 저장 막대가 켜지고, 저장은 관리자가 */
  onApply: (values: Partial<AssistResults[K]>) => void
}

const isEmpty = (value: Value) => (Array.isArray(value) ? value.length === 0 : value.trim() === '')
const show = (value: Value) => (Array.isArray(value) ? value.join(', ') : value)

/** [✨ …로 채우기] 버튼 + 결과 서랍 — SEO · GEO 문구 (기획서 A-1, T-231-A) */
export function AiFillAssist<K extends AssistKind>({
  kind,
  flag,
  buttonLabel,
  title,
  fields,
  onApply,
}: AiFillAssistProps<K>) {
  const enabled = useAiAssistEnabled(flag)
  const assist = useAiAssist(kind)
  const [open, setOpen] = useState(false)
  const [tone, setTone] = useState<AssistTone>('trust')
  const [picked, setPicked] = useState<string[]>([])
  if (!enabled) return null

  const result = assist.data?.result as Record<string, Value> | undefined

  const generate = () =>
    assist.mutate(tone, {
      // 지금 값이 있는 칸은 덮어쓰지 않게 처음엔 고르지 않는다
      onSuccess: () =>
        setPicked(fields.filter((field) => isEmpty(field.current)).map((field) => field.key)),
    })

  const apply = () => {
    if (!result) return
    onApply(
      Object.fromEntries(picked.map((key) => [key, result[key]])) as Partial<AssistResults[K]>
    )
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          // 열 때마다 새로 — 지난 결과의 고른 칸이 지금 값과 어긋나지 않게
          assist.reset()
          setPicked([])
          setOpen(true)
        }}
      >
        <Sparkles className="mr-1.5 h-4 w-4 text-violet-600" aria-hidden />
        {buttonLabel}
      </Button>
      <AiDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={title}
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
              <Button type="button" disabled={picked.length === 0} onClick={apply}>
                고른 {picked.length}개 적용
              </Button>
            ) : (
              <Button type="button" loading={assist.isPending} onClick={generate}>
                만들기
              </Button>
            )}
          </>
        }
      >
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">말투</legend>
          <div className="flex flex-wrap gap-2">
            {TONES.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-violet-500 ${
                  tone === option.value
                    ? 'border-violet-600 bg-violet-50 text-violet-800'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name={`ai-tone-${kind}`}
                  className="sr-only"
                  checked={tone === option.value}
                  onChange={() => setTone(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-slate-500">
          사이트 기본정보와 지금 설정을 바탕으로 만들어요. 사이트 정보에 없는 수치 · 수상 · 자격은
          넣지 않아요.
        </p>

        {assist.isPending && <div className="h-40 animate-pulse rounded-lg bg-slate-100" />}
        {assist.isError && (
          <p className="text-sm text-rose-600" role="alert">
            {pickErrorMessage(
              assist.error,
              'AI 가 알맞은 답을 주지 못했어요. 잠시 뒤 다시 시도해 주세요.'
            )}
          </p>
        )}
        {result && !assist.isPending && (
          <ul className="space-y-3" aria-label="AI 결과">
            {fields.map((field) => {
              const value = result[field.key] ?? ''
              const checked = picked.includes(field.key)
              return (
                <li key={field.key} className="rounded-lg border border-slate-200 p-3">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={(e) =>
                        setPicked((keys) =>
                          e.target.checked
                            ? [...keys, field.key]
                            : keys.filter((key) => key !== field.key)
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800">
                        {field.label}
                      </span>
                      <span className="mt-1 block whitespace-pre-wrap break-words text-sm text-slate-700">
                        {show(value)}
                      </span>
                      {!isEmpty(field.current) && (
                        <span className="mt-1 block text-xs text-slate-400">
                          지금: {show(field.current)}
                        </span>
                      )}
                      {hasNumber(show(value)) && (
                        <span className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                          <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                          숫자가 사실인지 확인해 주세요.
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </AiDrawer>
    </>
  )
}
