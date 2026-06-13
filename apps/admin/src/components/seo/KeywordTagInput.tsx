import { useState } from 'react'
import { X } from 'lucide-react'

interface KeywordTagInputProps {
  keywords: string[]
  onChange: (next: string[]) => void
  max?: number
}

export function KeywordTagInput({
  keywords,
  onChange,
  max = 10,
}: KeywordTagInputProps) {
  const [draft, setDraft] = useState('')

  const addKeyword = (raw: string) => {
    const value = raw.trim()
    if (!value) return
    if (keywords.includes(value)) return
    if (keywords.length >= max) return
    onChange([...keywords, value])
    setDraft('')
  }

  const removeKeyword = (idx: number) =>
    onChange(keywords.filter((_, i) => i !== idx))

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addKeyword(draft)
    } else if (e.key === 'Backspace' && !draft && keywords.length > 0) {
      e.preventDefault()
      removeKeyword(keywords.length - 1)
    }
  }

  return (
    <div className="rounded-md border border-slate-300 bg-white p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {keywords.map((kw, idx) => (
          <span
            key={`${kw}-${idx}`}
            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
          >
            {kw}
            <button
              type="button"
              onClick={() => removeKeyword(idx)}
              className="rounded-full hover:bg-blue-100"
              aria-label={`${kw} 삭제`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            keywords.length === 0
              ? '키워드 입력 후 엔터 (예: 강남 통증의학과)'
              : ''
          }
          className="min-w-[160px] flex-1 bg-transparent text-sm text-slate-900 outline-none"
        />
      </div>
      <p className="mt-1 px-1 text-xs text-slate-400">
        엔터/쉼표로 추가 · 백스페이스로 삭제 · 최대 {max}개
      </p>
    </div>
  )
}
