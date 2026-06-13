import { useState } from 'react'
import { Input } from '@cms/ui'
import { FormField } from './FormField'
import { SaveBar } from './HeroBannerForm'
import { strSetting } from './utils'
import type { SectionFormProps } from './types'

/**
 * 매핑되지 않은 섹션 타입을 위한 fallback. 기존 settings를 그대로 편집.
 */
export function GenericForm({ section, isSaving, onSubmit }: SectionFormProps) {
  const initial: Record<string, string> = Object.fromEntries(
    section.settings.map((s) => [s.field_key, s.field_value ?? ''])
  )
  const [values, setValues] = useState(initial)

  const handleSave = async () => {
    await onSubmit(
      Object.entries(values).map(([key, value]) => strSetting(key, value))
    )
  }

  if (section.settings.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          이 섹션은 아직 편집 가능한 항목이 없습니다.
        </div>
      </div>
    )
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        handleSave()
      }}
    >
      {Object.entries(values).map(([key, value]) => (
        <FormField key={key} label={key}>
          <Input
            value={value}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, [key]: e.target.value }))
            }
          />
        </FormField>
      ))}
      <SaveBar isSaving={isSaving} />
    </form>
  )
}
