import { useId, useState } from 'react'
import { X } from 'lucide-react'

const TAG_MAX = 30
const MAX_TAGS = 20

/** 이름 비교 — 띄어쓰기 · 대소문자 무시 (서버와 같은 규칙) */
const sameName = (name: string) => name.replace(/\s+/g, '').toLowerCase()

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  /** 이미 있는 태그 이름 — 입력 추천 */
  suggestions: string[]
  disabled?: boolean
}

/** 태그 — Enter · 쉼표로 더하고, 없는 이름은 저장할 때 서버가 만든다 (CM-05) */
export function TagInput({ value, onChange, suggestions, disabled }: TagInputProps) {
  const listId = useId()
  const [text, setText] = useState('')

  const add = (raw: string) => {
    const name = raw.trim().slice(0, TAG_MAX)
    setText('')
    if (!name || value.length >= MAX_TAGS) return
    if (value.some((t) => sameName(t) === sameName(name))) return
    // 있는 태그와 같은 이름이면 그 표기로
    const existing = suggestions.find((s) => sameName(s) === sameName(name))
    onChange([...value, existing ?? name])
  }

  return (
    <div>
      <label htmlFor={`${listId}-input`} className="mb-1 block text-sm font-medium text-slate-700">
        태그
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white p-2">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
          >
            #{tag}
            {!disabled && (
              <button
                type="button"
                aria-label={`태그 ${tag} 빼기`}
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            id={`${listId}-input`}
            list={listId}
            value={text}
            maxLength={TAG_MAX}
            placeholder={value.length ? '' : '입력 후 Enter'}
            onChange={(e) => {
              const next = e.target.value
              if (next.endsWith(',')) add(next.slice(0, -1))
              else setText(next)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                add(text)
              } else if (e.key === 'Backspace' && !text && value.length) {
                onChange(value.slice(0, -1))
              }
            }}
            onBlur={() => text.trim() && add(text)}
            className="min-w-24 flex-1 border-0 p-0.5 text-sm outline-none"
          />
        )}
      </div>
      <datalist id={listId}>
        {suggestions
          .filter((s) => !value.some((t) => sameName(t) === sameName(s)))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
      <p className="mt-1 text-xs text-slate-500">Enter 나 쉼표로 더해요. {MAX_TAGS}개까지.</p>
    </div>
  )
}
