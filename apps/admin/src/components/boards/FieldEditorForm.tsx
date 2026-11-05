import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { BoardField, FieldOption, FieldType } from '@cms/types'
import { Button, Input, Toggle, toast } from '@cms/ui'
import { type FieldInput, useCreateField, useUpdateField } from '@/hooks/useBoardFields'
import { FIELD_TYPES, nextOptionValue, usesChoices } from '@/lib/customFields'
import { pickErrorMessage } from '@/lib/errorMessages'

interface FieldEditorFormProps {
  boardId: string
  /** 없으면 새 칸 */
  field?: BoardField
  onDone: () => void
}

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,49}$/

const numberOrNull = (text: string): number | null => (text.trim() === '' ? null : Number(text))

/** 칸 하나 설정 — 저장하면 바로 반영된다 (BM-04) */
export function FieldEditorForm({ boardId, field, onDone }: FieldEditorFormProps) {
  const createField = useCreateField(boardId)
  const updateField = useUpdateField(boardId)
  const [label, setLabel] = useState(field?.label ?? '')
  const [fieldType, setFieldType] = useState<FieldType>(field?.field_type ?? 'TEXT')
  const [fieldKey, setFieldKey] = useState('')
  const [required, setRequired] = useState(field?.is_required ?? false)
  const [visible, setVisible] = useState(field?.is_visible ?? true)
  const [helpText, setHelpText] = useState(field?.help_text ?? '')
  const [placeholder, setPlaceholder] = useState(field?.placeholder ?? '')
  const [options, setOptions] = useState<FieldOption[]>(field?.options ?? [])
  const [min, setMin] = useState(field?.min?.toString() ?? '')
  const [max, setMax] = useState(field?.max?.toString() ?? '')
  const [errors, setErrors] = useState<{ label?: string; key?: string; options?: string; range?: string }>({})

  const inUse = (field?.value_count ?? 0) > 0
  const saving = createField.isPending || updateField.isPending

  const addOption = () =>
    setOptions((list) => [...list, { value: nextOptionValue(list.map((o) => o.value)), label: '' }])

  const save = async () => {
    const low = numberOrNull(min)
    const high = numberOrNull(max)
    const cleaned = options.map((o) => ({ ...o, label: o.label.trim() }))
    const next = {
      label: label.trim() ? undefined : '칸 이름을 입력해주세요.',
      key: fieldKey && !KEY_PATTERN.test(fieldKey) ? '영문 소문자로 시작하고 영문 소문자 · 숫자 · 밑줄만 쓸 수 있습니다.' : undefined,
      options:
        usesChoices(fieldType) && (cleaned.length === 0 || cleaned.some((o) => !o.label))
          ? '선택지 이름을 하나 이상 입력해주세요. 빈 줄은 지워 주세요.'
          : undefined,
      range: low !== null && high !== null && low > high ? '최솟값은 최댓값보다 클 수 없습니다.' : undefined,
    }
    setErrors(next)
    if (next.label || next.key || next.options || next.range) return
    const payload: FieldInput = {
      label: label.trim(),
      field_type: fieldType,
      is_required: required,
      is_visible: visible,
      help_text: helpText.trim(),
      placeholder: placeholder.trim(),
      ...(usesChoices(fieldType) ? { options: cleaned } : {}),
      ...(fieldType === 'NUMBER' ? { min: low, max: high } : {}),
    }
    try {
      if (field) await updateField.mutateAsync({ id: field.id, payload })
      else await createField.mutateAsync({ ...payload, field_key: fieldKey || undefined })
      toast.success('저장했습니다.')
      onDone()
    } catch (error) {
      toast.error(pickErrorMessage(error, '저장하지 못했습니다.'))
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
      <Input
        label="칸 이름"
        required
        maxLength={50}
        value={label}
        error={errors.label}
        placeholder="예: 방문 날짜"
        onChange={(e) => setLabel(e.target.value)}
      />
      <div>
        <label htmlFor="field-type" className="mb-1.5 block text-sm font-medium text-slate-700">
          유형
        </label>
        <select
          id="field-type"
          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"
          value={fieldType}
          disabled={inUse}
          onChange={(e) => setFieldType(e.target.value as FieldType)}
        >
          {FIELD_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        {inUse && (
          <p className="mt-1.5 text-sm text-slate-500">
            이 칸에 값이 있는 글이 {field?.value_count.toLocaleString()}개 있어 유형을 바꿀 수 없습니다.
          </p>
        )}
      </div>

      {usesChoices(fieldType) && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">선택지</legend>
          {options.map((option, index) => (
            <div key={option.value} className="flex items-center gap-2">
              <input
                aria-label={`선택지 ${index + 1}`}
                maxLength={100}
                className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                value={option.label}
                onChange={(e) =>
                  setOptions((list) =>
                    list.map((o) => (o.value === option.value ? { ...o, label: e.target.value } : o)),
                  )
                }
              />
              <button
                type="button"
                aria-label={`선택지 ${index + 1} 지우기`}
                className="rounded p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setOptions((list) => list.filter((o) => o.value !== option.value))}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={addOption}>
            <Plus className="h-4 w-4" aria-hidden />
            선택지 추가
          </Button>
          {errors.options && <p role="alert" className="text-sm text-red-600">{errors.options}</p>}
        </fieldset>
      )}

      {fieldType === 'NUMBER' && (
        <div className="grid grid-cols-2 gap-3">
          <Input label="최솟값" type="number" value={min} onChange={(e) => setMin(e.target.value)} />
          <Input label="최댓값" type="number" value={max} error={errors.range} onChange={(e) => setMax(e.target.value)} />
        </div>
      )}

      <Toggle
        label="필수"
        description="글을 처음 공개할 때 꼭 입력해야 합니다. 이미 공개한 글은 그대로 고칠 수 있습니다."
        checked={required}
        onChange={(e) => setRequired(e.target.checked)}
      />
      <Toggle
        label="홈페이지에 표시"
        description="끄면 관리자 화면에서만 씁니다."
        checked={visible}
        onChange={(e) => setVisible(e.target.checked)}
      />

      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer">고급 설정</summary>
        <div className="mt-3 space-y-3">
          <Input
            label="안내 문구"
            maxLength={200}
            value={helpText}
            helperText="입력칸 아래에 보입니다."
            onChange={(e) => setHelpText(e.target.value)}
          />
          <Input
            label="입력칸 예시 글자"
            maxLength={100}
            value={placeholder}
            onChange={(e) => setPlaceholder(e.target.value)}
          />
          {field ? (
            <p>
              칸 이름(영문): <code>{field.field_key}</code> — 바꿀 수 없습니다.
            </p>
          ) : (
            <Input
              label="칸 이름 (영문)"
              maxLength={50}
              value={fieldKey}
              error={errors.key}
              helperText="비워 두면 자동으로 만듭니다. 만든 뒤에는 바꿀 수 없습니다."
              onChange={(e) => setFieldKey(e.target.value)}
            />
          )}
        </div>
      </details>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          취소
        </Button>
        <Button type="button" loading={saving} onClick={save}>
          {field ? '칸 저장' : '칸 추가'}
        </Button>
      </div>
    </div>
  )
}
