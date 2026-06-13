import type { ReactNode } from 'react'

interface FormFieldProps {
  label: string
  htmlFor?: string
  hint?: string
  trailing?: ReactNode
  children: ReactNode
}

export function FormField({
  label,
  htmlFor,
  hint,
  trailing,
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
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
