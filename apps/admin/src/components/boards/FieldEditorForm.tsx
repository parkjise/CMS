import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { ArrowRightLeft, Plus, Trash2 } from 'lucide-react'
import type { BoardField, FieldOption, FieldType } from '@cms/types'
import { Button, Input, Toggle, toast } from '@cms/ui'
import { ChoiceRemapDialog } from '@/components/boards/ChoiceRemapDialog'
import { FieldConvertDialog } from '@/components/boards/FieldConvertDialog'
import { CustomFieldInputs } from '@/components/boards/CustomFieldInputs'
import { type FieldInput, useCreateField, useUpdateField } from '@/hooks/useBoardFields'
import {
  type CustomValues,
  FIELD_TYPES,
  initialCustomValues,
  nextOptionValue,
  toCustomData,
  usesChoices,
  validateCustomValues,
} from '@/lib/customFields'
import { pickErrorMessage } from '@/lib/errorMessages'

interface FieldEditorFormProps {
  boardId: string
  /** 없으면 새 칸 */
  field?: BoardField
  onDone: () => void
}

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,49}$/

const DEFAULT_KEY = 'default_value'

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
  const [showInList, setShowInList] = useState(field?.show_in_list ?? false)
  const [errors, setErrors] = useState<{ label?: string; key?: string; options?: string; range?: string }>({})
  // 쓰고 있는 선택지 옮기기 (T-180) — removing 이면 옮긴 뒤 화면에서 뺀다
  const [remapping, setRemapping] = useState<{ option: FieldOption; removing: boolean } | null>(null)
  // 값이 있는 칸은 유형 바꾸기 창에서 글 값과 함께 바꾼다 (T-182)
  const [converting, setConverting] = useState(false)

  // 기본값 입력칸은 글쓰기 화면과 같은 칸으로 그린다 — 지금 고른 유형 · 선택지 그대로
  const defaultField: BoardField = {
    id: 'default-value',
    board_id: boardId,
    field_key: DEFAULT_KEY,
    label: '기본값',
    field_type: fieldType,
    is_required: false,
    is_visible: true,
    help_text: '새 글을 쓸 때 미리 채워집니다. 이미 쓴 글은 바뀌지 않습니다.',
    placeholder: '',
    default_value: field?.default_value ?? null,
    options,
    min: numberOrNull(min),
    max: numberOrNull(max),
    show_in_list: false,
    display_order: 0,
    deleted_at: null,
    value_count: 0,
  }
  const defaultForm = useForm<CustomValues>({ defaultValues: initialCustomValues([defaultField], null) })

  const changeType = (next: FieldType) => {
    setFieldType(next)
    // 다른 유형의 값은 쓸 수 없다
    defaultForm.reset(initialCustomValues([{ ...defaultField, field_type: next, default_value: null }], null))
  }

  const inUse = (field?.value_count ?? 0) > 0
  // 저장된 선택지만 글에서 쓰일 수 있다 — 유형을 바꾸는 중이면 세지 않는다
  const usedBy = (option: FieldOption) =>
    field && field.field_type === fieldType ? (field.choice_counts?.[option.value] ?? 0) : 0
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
    const defaultValues = defaultForm.getValues()
    const defaultError = validateCustomValues([defaultField], defaultValues, {
      publishing: false,
      first: false,
      stored: {},
    })[DEFAULT_KEY]
    if (defaultError) defaultForm.setError(DEFAULT_KEY, { message: defaultError })
    if (next.label || next.key || next.options || next.range || defaultError) return
    const payload: FieldInput = {
      label: label.trim(),
      field_type: fieldType,
      is_required: required,
      is_visible: visible,
      help_text: helpText.trim(),
      placeholder: placeholder.trim(),
      default_value: toCustomData([defaultField], defaultValues)[DEFAULT_KEY],
      show_in_list: showInList,
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
          onChange={(e) => changeType(e.target.value as FieldType)}
        >
          {FIELD_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        {inUse && field && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <p className="text-sm text-slate-500">
              이 칸에 값이 있는 글이 {field.value_count.toLocaleString()}개 있어 여기서는 유형을 바꿀 수
              없습니다. 글 값까지 함께 바꾸려면 [유형 바꾸기]를 눌러 주세요.
            </p>
            <Button type="button" variant="secondary" size="sm" onClick={() => setConverting(true)}>
              유형 바꾸기
            </Button>
          </div>
        )}
        {field && converting && (
          <FieldConvertDialog
            boardId={boardId}
            field={field}
            onClose={() => setConverting(false)}
            onConverted={() => {
              setConverting(false)
              // 칸 설정이 바뀌었으니 편집을 닫고 새로 읽은 칸으로 다시 연다
              onDone()
            }}
          />
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
              {usedBy(option) > 0 && (
                <>
                  <span className="shrink-0 text-xs text-slate-500">
                    글 {usedBy(option).toLocaleString()}개
                  </span>
                  <button
                    type="button"
                    aria-label={`선택지 ${index + 1} 다른 선택지로 옮기기`}
                    title="이 선택지를 쓴 글을 다른 선택지로 옮기기"
                    className="rounded p-2 text-slate-500 hover:bg-slate-100"
                    onClick={() => setRemapping({ option, removing: false })}
                  >
                    <ArrowRightLeft className="h-4 w-4" aria-hidden />
                  </button>
                </>
              )}
              <button
                type="button"
                aria-label={`선택지 ${index + 1} 지우기`}
                className="rounded p-2 text-slate-500 hover:bg-slate-100"
                onClick={() =>
                  usedBy(option) > 0
                    ? setRemapping({ option, removing: true })
                    : setOptions((list) => list.filter((o) => o.value !== option.value))
                }
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
      {field && remapping && (
        <ChoiceRemapDialog
          key={remapping.option.value}
          boardId={boardId}
          field={field}
          source={remapping.option}
          labels={Object.fromEntries(options.map((o) => [o.value, o.label.trim()]))}
          removing={remapping.removing}
          onClose={() => setRemapping(null)}
          onMoved={() => {
            if (remapping.removing)
              setOptions((list) => list.filter((o) => o.value !== remapping.option.value))
            setRemapping(null)
          }}
        />
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
      <Toggle
        label="글 목록에 표시"
        description="관리자의 글 관리 목록에 값을 보여 줍니다. 카드형 게시판은 홈페이지 카드에도 나옵니다 (홈페이지에 표시를 켠 칸만)."
        checked={showInList}
        onChange={(e) => setShowInList(e.target.checked)}
      />

      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer">고급 설정</summary>
        <div className="mt-3 space-y-3">
          <CustomFieldInputs
            key={fieldType}
            fields={[defaultField]}
            control={defaultForm.control}
            errors={defaultForm.formState.errors}
            clearError={(key) => defaultForm.clearErrors(key)}
          />
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
