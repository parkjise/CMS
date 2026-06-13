import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Input } from '@cms/ui'
import { FormField } from './FormField'
import { SaveBar } from './HeroBannerForm'
import { getJsonSetting, getSetting, jsonSetting, strSetting } from './utils'
import type { SectionFormProps } from './types'

interface GalleryItem {
  image_url: string
  caption: string
}

export function GalleryForm({ section, isSaving, onSubmit }: SectionFormProps) {
  const [title, setTitle] = useState(getSetting(section.settings, 'section_title'))
  const [items, setItems] = useState<GalleryItem[]>(
    getJsonSetting<GalleryItem[]>(section.settings, 'gallery_items', [])
  )

  const addItem = () =>
    setItems([...items, { image_url: '', caption: '' }])

  const updateItem = (idx: number, patch: Partial<GalleryItem>) =>
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

  const removeItem = (idx: number) =>
    setItems(items.filter((_, i) => i !== idx))

  const handleSave = async () => {
    await onSubmit([
      strSetting('section_title', title),
      jsonSetting('gallery_items', items),
    ])
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        handleSave()
      }}
    >
      <FormField label="섹션 제목">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 시설 갤러리"
        />
      </FormField>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">갤러리 이미지</span>
          <Button type="button" variant="secondary" size="sm" onClick={addItem}>
            <Plus className="h-3.5 w-3.5" /> 이미지 추가
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          다중 파일 드래그앤드롭 업로드는 곧 제공됩니다. 지금은 URL을 직접 입력해주세요.
        </p>

        {items.length === 0 && (
          <p className="rounded-md border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
            등록된 이미지가 없습니다.
          </p>
        )}

        <ul className="space-y-3">
          {items.map((item, idx) => (
            <li
              key={idx}
              className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3"
            >
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.caption || '갤러리 미리보기'}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <span className="text-xs text-slate-300">미리보기</span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Input
                  type="url"
                  value={item.image_url}
                  onChange={(e) => updateItem(idx, { image_url: e.target.value })}
                  placeholder="이미지 URL"
                />
                <Input
                  value={item.caption}
                  onChange={(e) => updateItem(idx, { caption: e.target.value })}
                  placeholder="캡션 (선택)"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeItem(idx)}
                aria-label="삭제"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <SaveBar isSaving={isSaving} />
    </form>
  )
}
