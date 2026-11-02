import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button, Input, Textarea } from '@cms/ui'
import { FormField } from './FormField'
import { ImageUploadField } from './ImageUploadField'
import { fieldLabel } from '@/lib/fieldLabels'
import { type ListItem as Item, parseList } from './listValue'

// 목록 칸 편집기 — 슬라이드 · 카드 · 갤러리 · 영상 등 JSON 목록을 사람이 쓰는 화면으로 (T-037-E)
// 저장 형식은 그대로 JSON (홈페이지 렌더링 · 데이터 변경 없음)

type Scalar = string | number | boolean | null

const LONG_TEXT = new Set(['description', 'text', 'body', 'message', 'answer'])
const isImageKey = (key: string) =>
  key.endsWith('image_url') || key === 'thumb_url' || key === 'icon_url'

const emptyLike = (v: unknown): unknown =>
  typeof v === 'boolean' ? false : Array.isArray(v) ? [] : v !== null && typeof v === 'object' ? {} : ''

interface ListFieldProps {
  field: string
  value: string
  onChange: (json: string) => void
  sectionId: string
  /** 항목마다 늘 보여 줄 칸 (예: 슬라이드의 휴대폰용 사진) */
  extraKeys?: string[]
}

export function ListField({ field, value, onChange, sectionId, extraKeys = [] }: ListFieldProps) {
  const list = parseList(value) ?? []
  const isText = list.length > 0 && typeof list[0] === 'string'
  const emit = (next: unknown[]) => onChange(JSON.stringify(next))

  const move = (i: number, d: -1 | 1) => {
    const next = [...list] as unknown[]
    const [item] = next.splice(i, 1)
    next.splice(i + d, 0, item)
    emit(next)
  }
  const remove = (i: number) => emit((list as unknown[]).filter((_, j) => j !== i))

  const keys = isText
    ? []
    : [...new Set([...(list as Item[]).flatMap((it) => Object.keys(it)), ...extraKeys])]
  const add = () => {
    if (isText || list.length === 0) {
      // 빈 목록 — 늘 보일 칸(extraKeys)이 있으면 그 칸으로, 없으면 글자 목록으로 시작
      emit([
        ...(list as unknown[]),
        isText || keys.length === 0 ? '' : Object.fromEntries(keys.map((k) => [k, ''])),
      ])
      return
    }
    const first = (list as Item[])[0]
    emit([...(list as Item[]), Object.fromEntries(keys.map((k) => [k, emptyLike(first[k])]))])
  }

  const label = fieldLabel(field)

  return (
    <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
      <legend className="px-1 text-sm font-medium text-slate-700">
        {label} <span className="text-xs font-normal text-slate-500">({list.length}개)</span>
      </legend>
      <ol className="space-y-3">
        {list.map((item, i) => (
          <li key={i} className="rounded-md border border-slate-100 bg-slate-50 p-3" aria-label={`${label} ${i + 1}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">
                {label} {i + 1}
              </span>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" aria-label={`${label} ${i + 1} 위로`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`${label} ${i + 1} 아래로`}
                  disabled={i === list.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" aria-label={`${label} ${i + 1} 삭제`} onClick={() => remove(i)}>
                  <Trash2 className="h-4 w-4 text-rose-500" />
                </Button>
              </div>
            </div>
            {typeof item === 'string' ? (
              <Input
                aria-label={`${label} ${i + 1} 내용`}
                value={item}
                onChange={(e) => emit((list as string[]).map((v, j) => (j === i ? e.target.value : v)))}
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {keys.map((key) => (
                  <ItemField
                    key={key}
                    name={key}
                    value={(item as Item)[key]}
                    sectionId={sectionId}
                    prefix={`${label} ${i + 1}`}
                    onChange={(v) =>
                      emit((list as Item[]).map((it, j) => (j === i ? { ...it, [key]: v } : it)))
                    }
                  />
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      <Button type="button" variant="secondary" onClick={add}>
        <Plus className="mr-1 h-4 w-4" /> {label} 추가
      </Button>
    </fieldset>
  )
}

interface ItemFieldProps {
  name: string
  value: unknown
  sectionId: string
  prefix: string
  onChange: (v: unknown) => void
}

function ItemField({ name, value, sectionId, prefix, onChange }: ItemFieldProps) {
  const label = fieldLabel(name)
  const aria = `${prefix} ${label}`
  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={value} aria-label={aria} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    )
  }
  if (value !== null && typeof value === 'object') {
    // 목록 안의 목록 (예: 연혁 월별 내용) — 글자(JSON)로
    return (
      <FormField label={`${label} (JSON)`}>
        <Textarea
          aria-label={aria}
          rows={3}
          defaultValue={JSON.stringify(value)}
          onBlur={(e) => {
            try {
              onChange(JSON.parse(e.target.value))
            } catch {
              /* 잘못된 JSON 은 반영하지 않는다 */
            }
          }}
        />
      </FormField>
    )
  }
  const text = value == null ? '' : String(value as Scalar)
  if (isImageKey(name)) {
    return (
      <div className="md:col-span-2">
        <ImageUploadField label={`${prefix} ${label}`} context="gallery" sectionId={sectionId} value={text} onChange={onChange} />
      </div>
    )
  }
  if (LONG_TEXT.has(name)) {
    return (
      <div className="md:col-span-2">
        <FormField label={label}>
          <Textarea aria-label={aria} rows={3} value={text} onChange={(e) => onChange(e.target.value)} />
        </FormField>
      </div>
    )
  }
  return (
    <FormField label={label}>
      <Input aria-label={aria} value={text} onChange={(e) => onChange(typeof value === 'number' ? Number(e.target.value) : e.target.value)} />
    </FormField>
  )
}
