import type { ReactNode } from 'react'

interface FormFieldProps {
  label: string
  htmlFor?: string
  hint?: string
  trailing?: ReactNode
  /** 홈페이지 편집 모드에서 서식을 넣은 글 — 여기서 고치면 서식이 지워진다는 안내 (T-065-A) */
  rich?: boolean
  children: ReactNode
}

export function FormField({
  label,
  htmlFor,
  hint,
  trailing,
  rich = false,
  children,
}: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium text-slate-700"
        >
          {label}
        </label>
        {trailing}
      </div>
      {children}
      {rich && (
        <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800" role="note">
          서식(굵게 · 색 · 링크 등)이 적용된 글입니다. 서식은 홈페이지 편집 모드에서 바꿀 수 있고,
          여기서 글자를 고치면 서식이 지워집니다.
        </p>
      )}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
