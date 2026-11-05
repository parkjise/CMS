import { type Control, Controller, type FieldErrors } from 'react-hook-form'
import type { BoardField } from '@cms/types'
import { Input, Textarea, Toggle } from '@cms/ui'
import { ImageUploadField } from '@/components/content/forms/ImageUploadField'
import type { CustomValues } from '@/lib/customFields'

interface CustomFieldInputsProps {
  fields: BoardField[]
  control: Control<CustomValues>
  errors: FieldErrors<CustomValues>
  /** 값을 고치면 그 칸의 오류를 지운다 */
  clearError?: (key: string) => void
}

const titleOf = (field: BoardField): string => (field.is_required ? `${field.label} (필수)` : field.label)

function Hint({ field, error }: { field: BoardField; error?: string }) {
  if (error) {
    return (
      <p role="alert" className="mt-1.5 text-sm text-red-600">
        {error}
      </p>
    )
  }
  return field.help_text ? <p className="mt-1.5 text-sm text-slate-500">{field.help_text}</p> : null
}

/** 칸 정의대로 그리는 입력칸 (BM-06) — 글쓰기 화면과 필드 빌더 미리보기가 같이 쓴다 */
export function CustomFieldInputs({ fields, control, errors, clearError }: CustomFieldInputsProps) {
  return (
    <>
      {fields.map((field) => (
        <Controller
          key={field.id}
          name={field.field_key}
          control={control}
          render={({ field: { value, onChange: setValue } }) => {
            const error = errors[field.field_key]?.message as string | undefined
            const onChange = (next: unknown) => {
              clearError?.(field.field_key)
              setValue(next)
            }
            switch (field.field_type) {
              case 'TEXT':
              case 'NUMBER':
              case 'DATE':
                return (
                  <Input
                    label={titleOf(field)}
                    type={field.field_type === 'TEXT' ? 'text' : field.field_type.toLowerCase()}
                    min={field.min ?? undefined}
                    max={field.max ?? undefined}
                    maxLength={field.field_type === 'TEXT' ? 200 : undefined}
                    placeholder={field.placeholder}
                    helperText={field.help_text || undefined}
                    error={error}
                    value={(value as string | number | null) ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                  />
                )
              case 'TEXTAREA':
                return (
                  <Textarea
                    label={titleOf(field)}
                    rows={4}
                    maxLength={5000}
                    placeholder={field.placeholder}
                    helperText={field.help_text || undefined}
                    error={error}
                    value={(value as string | null) ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                  />
                )
              case 'SELECT':
                return (
                  <div>
                    <label htmlFor={`field-${field.id}`} className="mb-1.5 block text-sm font-medium text-slate-700">
                      {titleOf(field)}
                    </label>
                    <select
                      id={`field-${field.id}`}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50"
                      value={(value as string | null) ?? ''}
                      onChange={(e) => onChange(e.target.value)}
                    >
                      <option value="">선택 안 함</option>
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Hint field={field} error={error} />
                  </div>
                )
              case 'MULTI_SELECT': {
                const picked = (value as string[] | null) ?? []
                return (
                  <fieldset>
                    <legend className="mb-1.5 text-sm font-medium text-slate-700">{titleOf(field)}</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {field.options.map((option) => (
                        <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={picked.includes(option.value)}
                            onChange={(e) =>
                              onChange(
                                e.target.checked
                                  ? [...picked, option.value]
                                  : picked.filter((v) => v !== option.value),
                              )
                            }
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                    <Hint field={field} error={error} />
                  </fieldset>
                )
              }
              case 'BOOLEAN':
                return (
                  <div>
                    <Toggle
                      label={titleOf(field)}
                      checked={value === true}
                      onChange={(e) => onChange(e.target.checked)}
                    />
                    <Hint field={field} error={error} />
                  </div>
                )
              case 'RATING':
                return (
                  <fieldset>
                    <legend className="mb-1.5 text-sm font-medium text-slate-700">{titleOf(field)}</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {[1, 2, 3, 4, 5].map((score) => (
                        <label key={score} className="flex items-center gap-1.5 text-sm text-slate-700">
                          <input
                            type="radio"
                            name={`field-${field.id}`}
                            checked={Number(value) === score}
                            onChange={() => onChange(score)}
                          />
                          {score}점
                        </label>
                      ))}
                      {!field.is_required && (
                        <label className="flex items-center gap-1.5 text-sm text-slate-500">
                          <input
                            type="radio"
                            name={`field-${field.id}`}
                            checked={!value}
                            onChange={() => onChange('')}
                          />
                          선택 안 함
                        </label>
                      )}
                    </div>
                    <Hint field={field} error={error} />
                  </fieldset>
                )
              case 'IMAGE':
                return (
                  <div>
                    <ImageUploadField
                      label={titleOf(field)}
                      context="board"
                      value={(value as string | null) ?? ''}
                      onChange={onChange}
                    />
                    <Hint field={field} error={error} />
                  </div>
                )
            }
          }}
        />
      ))}
    </>
  )
}
