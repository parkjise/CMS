'use client'

import { forwardRef } from 'react'

/** 방문자 회원 폼 공통 입력 요소 (T-113) */

export const inputClass =
  'w-full rounded-md border border-[color:var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[color:var(--color-text-primary)] outline-none transition focus:border-[color:var(--color-primary)] disabled:opacity-60 read-only:bg-[var(--color-surface)]'

export const primaryButtonClass =
  'w-full rounded-md bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-[color:var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50'

export const secondaryButtonClass =
  'shrink-0 rounded-md border border-[color:var(--color-border)] px-3 py-2.5 text-sm font-medium text-[color:var(--color-text-secondary)] transition hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-50'

interface FieldProps {
  id: string
  label: string
  required?: boolean
  error?: string
  hint?: React.ReactNode
  children: React.ReactNode
}

export const Field = ({ id, label, required, error, hint, children }: FieldProps) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium text-[color:var(--color-text-primary)]">
      {label}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
    {children}
    {error ? (
      <p id={`${id}-error`} role="alert" className="text-xs text-red-600">
        {error}
      </p>
    ) : (
      hint && <div className="text-xs text-[color:var(--color-text-muted)]">{hint}</div>
    )}
  </div>
)

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }

export const TextInput = forwardRef<HTMLInputElement, InputProps>(
  ({ invalid, className, id, ...props }, ref) => (
    <input
      ref={ref}
      id={id}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-error` : undefined}
      className={[inputClass, invalid ? 'border-red-400' : '', className ?? ''].join(' ')}
      {...props}
    />
  ),
)
TextInput.displayName = 'TextInput'

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: React.ReactNode
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, id, ...props }, ref) => (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-[color:var(--color-text-secondary)]">
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="h-4 w-4 accent-[var(--color-primary)]"
        {...props}
      />
      {label}
    </label>
  ),
)
Checkbox.displayName = 'Checkbox'

export const FormError = ({ message }: { message: string | null | undefined }) =>
  message ? (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  ) : null
