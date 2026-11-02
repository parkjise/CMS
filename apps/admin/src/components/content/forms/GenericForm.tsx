import { useState } from 'react'
import { Input } from '@cms/ui'
import { FormField } from './FormField'
import { SaveBar } from './HeroBannerForm'
import { ListField } from './ListField'
import { parseList } from './listValue'
import { getSetting, isRichSetting, strSetting } from './utils'
import type { SectionFormProps } from './types'
import { fieldLabel } from '@/lib/fieldLabels'

// 게시판 샘플 글은 목록 편집기로 보여 주지 않는다 (실제 글은 문의 · 게시판 관리에서)
const RAW_LIST_TYPES = new Set(['BOARD', 'NOTICE_LATEST'])
// 항목마다 늘 보여 줄 칸 — 슬라이드별 휴대폰용 사진 (T-037-E).
// 목록이 비어 있어도 새 슬라이드가 같은 칸으로 만들어지게 전체 칸을 적는다
const EXTRA_ITEM_KEYS: Record<string, string[]> = {
  slides: ['image_url', 'mobile_image_url', 'title', 'copy_primary', 'copy_secondary'],
}

/**
 * 매핑되지 않은 섹션 타입을 위한 fallback. 기존 settings를 그대로 편집.
 */
export function GenericForm({ section, isSaving, onSubmit }: SectionFormProps) {
  const initial: Record<string, string> = Object.fromEntries(
    section.settings.map((s) => [s.field_key, getSetting(section.settings, s.field_key)])
  )
  const [values, setValues] = useState(initial)

  // 목록 칸은 처음 값 기준으로 정한다 — 편집 중 잠깐 빈 목록이 돼도 편집기가 유지되게
  const [listKeys] = useState(
    () =>
      new Set(
        RAW_LIST_TYPES.has(section.section_type)
          ? []
          : Object.entries(initial)
              .filter(([, v]) => parseList(v) !== null)
              .map(([k]) => k)
      )
  )

  const handleSave = async () => {
    await onSubmit(
      Object.entries(values).map(([key, value]) =>
        // 목록 칸은 JSON 그대로 (T-037-E)
        listKeys.has(key)
          ? { field_key: key, field_value: value, value_type: 'JSON' }
          : strSetting(key, value)
      )
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
      {Object.entries(values).map(([key, value]) =>
        listKeys.has(key) ? (
          <ListField
            key={key}
            field={key}
            value={value}
            sectionId={section.id}
            extraKeys={EXTRA_ITEM_KEYS[key]}
            onChange={(json) => setValues((prev) => ({ ...prev, [key]: json }))}
          />
        ) : (
          <FormField key={key} label={fieldLabel(key)} rich={isRichSetting(section.settings, key)}>
            <Input
              aria-label={fieldLabel(key)}
              value={value}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [key]: e.target.value }))
              }
            />
          </FormField>
        )
      )}
      <SaveBar isSaving={isSaving} />
    </form>
  )
}
