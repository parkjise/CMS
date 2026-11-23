import { useState } from 'react'
import { Sparkles, TriangleAlert } from 'lucide-react'
import type { BoardType } from '@cms/types'
import { Button, Textarea } from '@cms/ui'
import { AiDrawer } from '@/components/ai/AiDrawer'
import { useAiAssist, useAiAssistEnabled } from '@/hooks/useAiAssist'
import {
  AI_BOARD_ASSIST,
  type BoardSuggestion,
  PURPOSE_MAX,
  type SuggestedField,
} from '@/lib/aiAssist'
import { boardTypeLabel } from '@/lib/boardLabels'
import { READ_OPTIONS, WRITE_OPTIONS } from '@/lib/boardPermissions'
import { sameName } from '@/lib/boardSuggestion'
import { fieldTypeLabel } from '@/lib/customFields'
import { pickErrorMessage } from '@/lib/errorMessages'

/** 관리자가 고른 것 — 유형은 막히지 않았으면 늘 적용 */
export interface BoardSuggestionPick {
  suggestion: BoardSuggestion
  /** 이름 · 설명 (만들기만) */
  basics: boolean
  /** 권한 · 운영 (만들기만) */
  access: boolean
  fields: SuggestedField[]
  categories: string[]
}

interface BoardSuggestAssistProps {
  /** new = 게시판 만들기 (유형 · 이름 · 권한까지), structure = 있는 게시판에 필드 · 카테고리만 */
  mode: 'new' | 'structure'
  buttonLabel: string
  title: string
  boardId?: string
  /** 목적 칸의 처음 값 — 게시판 설명 등 */
  defaultPurpose?: string
  /** 지금 이름 — 있으면 이름 · 설명은 처음엔 고르지 않는다 */
  currentName?: string
  /** 이미 있는 필드 · 카테고리 이름 — 같은 이름은 고를 수 없다 */
  existingFields?: string[]
  existingCategories?: string[]
  /** 이 사업체가 고를 수 없는 유형 (type-options) */
  blockedTypes?: Partial<Record<BoardType, string>>
  applyLabel: string
  /** 끝나면 서랍을 닫는다 — 실패를 던지면 열어 둔다 */
  onApply: (pick: BoardSuggestionPick) => void | Promise<unknown>
}

const optionLabel = (options: { value: string; label: string }[], value: string) =>
  options.find((o) => o.value === value)?.label ?? value

const ITEM = 'rounded-lg border border-slate-200 p-3'
const SECTION = 'mb-2 text-sm font-medium text-slate-700'

/** [✨ AI 로 구성 추천받기] · [✨ 필드 · 카테고리 추천] 버튼 + 결과 서랍 (기획서 A-2, T-232-A) */
export function BoardSuggestAssist({
  mode,
  buttonLabel,
  title,
  boardId,
  defaultPurpose = '',
  currentName = '',
  existingFields = [],
  existingCategories = [],
  blockedTypes = {},
  applyLabel,
  onApply,
}: BoardSuggestAssistProps) {
  const enabled = useAiAssistEnabled(AI_BOARD_ASSIST)
  const assist = useAiAssist('board')
  const [open, setOpen] = useState(false)
  const [purpose, setPurpose] = useState('')
  const [basics, setBasics] = useState(false)
  const [access, setAccess] = useState(false)
  const [fields, setFields] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [applying, setApplying] = useState(false)
  if (!enabled) return null

  const isNew = mode === 'new'
  const result = assist.data?.result
  const takenFields = new Set(existingFields.map(sameName))
  const takenCategories = new Set(existingCategories.map(sameName))
  const typeBlocked = result ? blockedTypes[result.board_type] : undefined

  const generate = () =>
    assist.mutate(
      { purpose: purpose.trim(), ...(boardId ? { board_id: boardId } : {}) },
      {
        // 이미 있는 이름은 고를 수 없고, 지금 이름이 있으면 덮어쓰지 않게 처음엔 고르지 않는다
        onSuccess: ({ result: next }) => {
          setBasics(!currentName.trim())
          setAccess(true)
          setFields(next.fields.map((f) => f.label).filter((l) => !takenFields.has(sameName(l))))
          setCategories(next.categories.filter((c) => !takenCategories.has(sameName(c))))
        },
      }
    )

  const picked = (basics ? 1 : 0) + (access ? 1 : 0) + fields.length + categories.length
  // 만들기는 유형만 받아도 적용할 수 있다
  const canApply = isNew ? Boolean(result) && (picked > 0 || !typeBlocked) : picked > 0

  const apply = async () => {
    if (!result) return
    setApplying(true)
    try {
      await onApply({
        suggestion: result,
        basics: isNew && basics,
        access: isNew && access,
        fields: result.fields.filter((f) => fields.includes(f.label)),
        categories: result.categories.filter((c) => categories.includes(c)),
      })
      setOpen(false)
    } catch {
      // 화면이 알린다 — 고른 것을 그대로 두고 다시 누를 수 있게
    } finally {
      setApplying(false)
    }
  }

  const toggle =
    (setter: (update: (list: string[]) => string[]) => void, key: string) => (checked: boolean) =>
      setter((list) => (checked ? [...list, key] : list.filter((item) => item !== key)))

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          // 열 때마다 새로 — 지난 결과가 지금 필드 · 이름과 어긋나지 않게
          assist.reset()
          setPurpose(defaultPurpose.slice(0, PURPOSE_MAX))
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
                disabled={!purpose.trim()}
                onClick={generate}
              >
                다시 만들기
              </Button>
            )}
            {result ? (
              <Button type="button" disabled={!canApply} loading={applying} onClick={apply}>
                {applyLabel}
              </Button>
            ) : (
              <Button
                type="button"
                loading={assist.isPending}
                disabled={!purpose.trim()}
                onClick={generate}
              >
                추천받기
              </Button>
            )}
          </>
        }
      >
        <Textarea
          label="어떤 게시판인가요?"
          rows={3}
          maxLength={PURPOSE_MAX}
          value={purpose}
          placeholder="예: 치료를 받은 분들이 후기를 남기는 게시판"
          helperText={`한두 문장이면 충분해요. 업종${isNew ? '과 이미 있는 게시판' : ''}도 함께 봐요. (${purpose.length}/${PURPOSE_MAX})`}
          onChange={(e) => setPurpose(e.target.value)}
        />

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
          <div className="space-y-4" aria-label="AI 추천">
            {isNew && (
              <section>
                <h3 className={SECTION}>유형 · 이름</h3>
                <div className={`${ITEM} space-y-2 text-sm`}>
                  <p className="text-slate-800">
                    {boardTypeLabel(result.board_type)}
                    {typeBlocked && (
                      <span className="mt-1 flex items-start gap-1 text-xs text-amber-700">
                        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        {typeBlocked} 유형은 그대로 둬요.
                      </span>
                    )}
                  </p>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={basics}
                      onChange={(e) => setBasics(e.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-800">{result.name}</span>
                      <span className="block text-slate-600">{result.description}</span>
                      {currentName.trim() && (
                        <span className="mt-1 block text-xs text-slate-400">
                          지금: {currentName.trim()}
                        </span>
                      )}
                    </span>
                  </label>
                </div>
              </section>
            )}

            <section>
              <h3 className={SECTION}>추가 필드 {result.fields.length}개</h3>
              {result.fields.length === 0 ? (
                <p className="text-xs text-slate-500">기본 필드(제목 · 본문 등)로 충분해요.</p>
              ) : (
                <ul className="space-y-2">
                  {result.fields.map((field) => {
                    const taken = takenFields.has(sameName(field.label))
                    return (
                      <li key={field.label} className={ITEM}>
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            disabled={taken}
                            checked={fields.includes(field.label)}
                            onChange={(e) => toggle(setFields, field.label)(e.target.checked)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium text-slate-800">{field.label}</span>{' '}
                            <span className="text-xs text-slate-500">
                              ({fieldTypeLabel(field.field_type)}
                              {field.choices.length > 0 && `: ${field.choices.join(' · ')}`})
                            </span>
                            {taken && (
                              <span className="block text-xs text-slate-400">
                                같은 이름의 필드가 있어 건너뛰어요.
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section>
              <h3 className={SECTION}>카테고리 {result.categories.length}개</h3>
              {result.categories.length === 0 ? (
                <p className="text-xs text-slate-500">카테고리 없이 시작해도 돼요.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {result.categories.map((name) => {
                    const taken = takenCategories.has(sameName(name))
                    return (
                      <li key={name}>
                        <label
                          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                            taken ? 'border-slate-100 text-slate-400' : 'border-slate-200'
                          }`}
                          title={taken ? '같은 이름의 카테고리가 있어 건너뛰어요.' : undefined}
                        >
                          <input
                            type="checkbox"
                            disabled={taken}
                            checked={categories.includes(name)}
                            onChange={(e) => toggle(setCategories, name)(e.target.checked)}
                          />
                          {name}
                          {taken && <span className="text-xs">(있음)</span>}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {isNew && (
              <section>
                <h3 className={SECTION}>권한 · 운영</h3>
                <label className={`${ITEM} flex items-start gap-2 text-sm`}>
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={access}
                    onChange={(e) => setAccess(e.target.checked)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-slate-800">
                      {[
                        `${optionLabel(READ_OPTIONS, result.permissions.read)} 읽기`,
                        `${optionLabel(WRITE_OPTIONS, result.permissions.write)} 글쓰기`,
                        ...(result.operation.allow_guest ? ['비회원 글쓰기'] : []),
                        ...(result.operation.allow_secret ? ['비밀글'] : []),
                        ...(result.operation.notify_new_post ? ['새 글 알림'] : []),
                      ].join(' / ')}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">{result.reason}</span>
                    <span className="mt-1 block text-xs text-slate-400">
                      만든 뒤 설정에서 바꿀 수 있어요.
                    </span>
                  </span>
                </label>
              </section>
            )}
          </div>
        )}
      </AiDrawer>
    </>
  )
}
