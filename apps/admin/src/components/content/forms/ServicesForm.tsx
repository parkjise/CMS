import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Input, Textarea } from '@cms/ui'
import { FormField } from './FormField'
import { SaveBar } from './HeroBannerForm'
import { getJsonSetting, jsonSetting, strSetting } from './utils'
import type { SectionFormProps } from './types'

interface ServiceItem {
  name: string
  description: string
}

const SECTION_TITLE_MAX = 40

export function ServicesForm({ section, isSaving, onSubmit }: SectionFormProps) {
  const [title, setTitle] = useState(
    section.settings.find((s) => s.field_key === 'section_title')?.field_value ?? ''
  )
  const [items, setItems] = useState<ServiceItem[]>(
    getJsonSetting<ServiceItem[]>(section.settings, 'services_list', [])
  )

  const overLimit = title.length > SECTION_TITLE_MAX

  const addItem = () =>
    setItems([...items, { name: '', description: '' }])

  const updateItem = (idx: number, patch: Partial<ServiceItem>) =>
    setItems(items.map((item, i) => (i === idx ? { ...item, ...patch } : item)))

  const removeItem = (idx: number) =>
    setItems(items.filter((_, i) => i !== idx))

  const handleSave = async () => {
    await onSubmit([
      strSetting('section_title', title),
      jsonSetting('services_list', items),
    ])
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!overLimit) handleSave()
      }}
    >
      <FormField label="섹션 제목">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 진료 과목"
          maxLength={SECTION_TITLE_MAX + 10}
        />
      </FormField>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">서비스 항목</span>
          <Button type="button" variant="secondary" size="sm" onClick={addItem}>
            <Plus className="h-3.5 w-3.5" /> 항목 추가
          </Button>
        </div>

        {items.length === 0 && (
          <p className="rounded-md border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
            아직 등록된 서비스가 없습니다. 우측 상단 [항목 추가]를 눌러 시작하세요.
          </p>
        )}

        <ul className="space-y-3">
          {items.map((item, idx) => (
            <li
              key={idx}
              className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3"
            >
              <div className="flex items-center gap-2">
                <Input
                  value={item.name}
                  onChange={(e) => updateItem(idx, { name: e.target.value })}
                  placeholder="서비스 이름"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItem(idx)}
                  aria-label="삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Textarea
                value={item.description}
                onChange={(e) =>
                  updateItem(idx, { description: e.target.value })
                }
                placeholder="간단한 설명"
                rows={2}
              />
            </li>
          ))}
        </ul>
      </div>

      <SaveBar isSaving={isSaving} disabled={overLimit} />
    </form>
  )
}
