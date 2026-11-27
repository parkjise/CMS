import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { FieldOption } from '@cms/types'
import { Button, Input, Toggle, toast } from '@cms/ui'
import {
  type ContentFieldInput,
  type ContentFieldType,
  type ContentType,
  useSaveContentFields,
} from '@/hooks/useContentTypes'
import { FIELD_TYPES, MAX_FIELDS, nextOptionValue, usesChoices } from '@/lib/customFields'
import { pickErrorField, pickErrorMessage } from '@/lib/errorMessages'

/** 콘텐츠 칸 종류 — 게시판 칸에서 별점(리뷰형 게시판 전용)만 뺀다 */
const CONTENT_FIELD_TYPES = FIELD_TYPES.filter((t) => t.value !== 'RATING') as {
  value: ContentFieldType
  label: string
}[]

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,49}$/

interface DraftField {
  /** 화면 안에서만 쓰는 구분 값 */
  uid: string
  id?: string
  field_key: string
  label: string
  field_type: ContentFieldType
  is_required: boolean
  help_text: string
  placeholder: string
  options: FieldOption[]
  min: string
  max: string
}

let uidCounter = 0
const nextUid = () => `draft-${(uidCounter += 1)}`

const toDraft = (type: ContentType): DraftField[] =>
  type.fields.map((f) => ({
    uid: f.id,
    id: f.id,
    field_key: f.field_key,
    label: f.label,
    field_type: f.field_type,
    is_required: f.is_required,
    help_text: f.help_text,
    placeholder: f.placeholder,
    options: f.field_options.choices ?? [],
    min: f.field_options.min?.toString() ?? '',
    max: f.field_options.max?.toString() ?? '',
  }))

const numberOrNull = (text: string): number | null => (text.trim() === '' ? null : Number(text))

const toInput = (draft: DraftField): ContentFieldInput => ({
  ...(draft.id ? { id: draft.id } : draft.field_key ? { field_key: draft.field_key } : {}),
  label: draft.label.trim(),
  field_type: draft.field_type,
  is_required: draft.is_required,
  help_text: draft.help_text.trim(),
  placeholder: draft.placeholder.trim(),
  ...(usesChoices(draft.field_type) ? { options: draft.options } : {}),
  ...(draft.field_type === 'NUMBER'
    ? { min: numberOrNull(draft.min), max: numberOrNull(draft.max) }
    : {}),
})

/** 화면에서 먼저 막는 것 — 서버도 같은 규칙으로 다시 막는다 */
function draftError(draft: DraftField): string | null {
  if (!draft.label.trim()) return '칸 이름을 입력해 주세요.'
  if (!draft.id && draft.field_key && !KEY_PATTERN.test(draft.field_key))
    return '칸 키는 영문 소문자로 시작하고 영문 소문자 · 숫자 · _ 2~50자예요.'
  if (usesChoices(draft.field_type) && draft.options.length === 0)
    return '선택지를 하나 이상 넣어 주세요.'
  if (draft.options.some((o) => !o.label.trim())) return '비어 있는 선택지가 있어요.'
  return null
}

interface ContentFieldsEditorProps {
  type: ContentType
  editable: boolean
}

/** 유형의 칸 — 목록 전체를 한 번에 저장한다 (CM-03, 순서는 목록 순서) */
export function ContentFieldsEditor({ type, editable }: ContentFieldsEditorProps) {
  const save = useSaveContentFields()
  const [drafts, setDrafts] = useState<DraftField[]>(() => toDraft(type))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)

  const change = (uid: string, patch: Partial<DraftField>) => {
    setDrafts((list) => list.map((d) => (d.uid === uid ? { ...d, ...patch } : d)))
    setErrors((e) => {
      const { [uid]: _removed, ...rest } = e
      return rest
    })
    setDirty(true)
  }

  const move = (index: number, delta: number) => {
    setDrafts((list) => {
      const next = [...list]
      const [item] = next.splice(index, 1)
      next.splice(index + delta, 0, item)
      return next
    })
    setDirty(true)
  }

  const remove = (uid: string) => {
    setDrafts((list) => list.filter((d) => d.uid !== uid))
    setDirty(true)
  }

  const add = () => {
    setDrafts((list) => [
      ...list,
      {
        uid: nextUid(),
        field_key: '',
        label: '',
        field_type: 'TEXT',
        is_required: false,
        help_text: '',
        placeholder: '',
        options: [],
        min: '',
        max: '',
      },
    ])
    setDirty(true)
  }

  const submit = () => {
    const found: Record<string, string> = {}
    for (const draft of drafts) {
      const message = draftError(draft)
      if (message) found[draft.uid] = message
    }
    setErrors(found)
    if (Object.keys(found).length > 0) return
    save.mutate(
      { id: type.id, fields: drafts.map(toInput) },
      {
        onSuccess: () => {
          toast.success('칸을 저장했어요.')
          setDirty(false)
        },
        onError: (err) => {
          const message = pickErrorMessage(err, '칸을 저장하지 못했어요.')
          // fields.{순서}.{칸} → 그 줄에 표시
          const index = Number(pickErrorField(err)?.match(/^fields\.(\d+)/)?.[1] ?? NaN)
          const draft = Number.isNaN(index) ? undefined : drafts[index]
          if (draft) setErrors({ [draft.uid]: message })
          else toast.error(message)
        },
      }
    )
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">추가 칸</h2>
          <p className="text-xs text-slate-500">
            유형마다 더 받을 정보예요. 칸은 {MAX_FIELDS}개까지, 값이 있는 칸은 종류를 바꿀 수 없어요.
          </p>
        </div>
        {editable && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={add}
            disabled={drafts.length >= MAX_FIELDS}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />칸 추가
          </Button>
        )}
      </div>

      {drafts.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
          추가 칸이 없어요. 기본 칸만으로도 쓸 수 있어요.
        </p>
      ) : (
        <ol className="space-y-3" aria-label="추가 칸 목록">
          {drafts.map((draft, index) => (
            <FieldRow
              key={draft.uid}
              draft={draft}
              index={index}
              last={index === drafts.length - 1}
              editable={editable}
              error={errors[draft.uid]}
              onChange={(patch) => change(draft.uid, patch)}
              onMove={(delta) => move(index, delta)}
              onRemove={() => remove(draft.uid)}
            />
          ))}
        </ol>
      )}

      {editable && (
        <div className="flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-amber-600">저장하지 않은 변경이 있어요</span>}
          <Button type="button" disabled={!dirty} loading={save.isPending} onClick={submit}>
            칸 저장
          </Button>
        </div>
      )}
    </section>
  )
}

interface FieldRowProps {
  draft: DraftField
  index: number
  last: boolean
  editable: boolean
  error?: string
  onChange: (patch: Partial<DraftField>) => void
  onMove: (delta: number) => void
  onRemove: () => void
}

function FieldRow({ draft, index, last, editable, error, onChange, onMove, onRemove }: FieldRowProps) {
  const title = draft.label || `새 칸 ${index + 1}`
  return (
    <li
      className={`space-y-3 rounded-lg border p-4 ${error ? 'border-rose-300' : 'border-slate-200'}`}
      aria-label={title}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
        <Input
          label="칸 이름"
          value={draft.label}
          maxLength={50}
          disabled={!editable}
          onChange={(e) => onChange({ label: e.target.value })}
        />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">종류</span>
          <select
            value={draft.field_type}
            disabled={!editable}
            onChange={(e) => onChange({ field_type: e.target.value as ContentFieldType })}
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            {CONTENT_FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-1 pb-1">
          <Toggle
            label="필수"
            size="sm"
            checked={draft.is_required}
            disabled={!editable}
            onChange={(e) => onChange({ is_required: e.target.checked })}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {draft.id ? (
          <p className="text-xs text-slate-500">
            칸 키 <code className="rounded bg-slate-100 px-1">{draft.field_key}</code> (바꿀 수 없음)
          </p>
        ) : (
          <Input
            label="칸 키 (비우면 자동)"
            value={draft.field_key}
            maxLength={50}
            placeholder="예: price"
            disabled={!editable}
            onChange={(e) => onChange({ field_key: e.target.value.trim() })}
          />
        )}
        <Input
          label="안내 문구"
          value={draft.help_text}
          maxLength={200}
          disabled={!editable}
          onChange={(e) => onChange({ help_text: e.target.value })}
        />
      </div>

      {usesChoices(draft.field_type) && (
        <ChoiceEditor
          options={draft.options}
          editable={editable}
          onChange={(options) => onChange({ options })}
        />
      )}
      {draft.field_type === 'NUMBER' && (
        <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
          <Input
            label="최솟값"
            type="number"
            value={draft.min}
            disabled={!editable}
            onChange={(e) => onChange({ min: e.target.value })}
          />
          <Input
            label="최댓값"
            type="number"
            value={draft.max}
            disabled={!editable}
            onChange={(e) => onChange({ max: e.target.value })}
          />
        </div>
      )}

      {error && (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      )}

      {editable && (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            className="rounded p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
            aria-label={`${title} 위로`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
            aria-label={`${title} 아래로`}
            disabled={last}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            aria-label={`${title} 빼기`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </li>
  )
}

function ChoiceEditor({
  options,
  editable,
  onChange,
}: {
  options: FieldOption[]
  editable: boolean
  onChange: (options: FieldOption[]) => void
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-700">선택지</legend>
      {options.map((option, i) => (
        <div key={option.value} className="flex items-center gap-2">
          <input
            aria-label={`선택지 ${i + 1}`}
            value={option.label}
            maxLength={100}
            disabled={!editable}
            onChange={(e) =>
              onChange(options.map((o, j) => (j === i ? { ...o, label: e.target.value } : o)))
            }
            className="h-9 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
          />
          {editable && (
            <button
              type="button"
              className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              aria-label={`선택지 ${i + 1} 빼기`}
              onClick={() => onChange(options.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      {editable && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() =>
            onChange([...options, { value: nextOptionValue(options.map((o) => o.value)), label: '' }])
          }
        >
          선택지 추가
        </Button>
      )}
    </fieldset>
  )
}
