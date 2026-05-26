import { forwardRef, SelectHTMLAttributes, useId } from 'react'

interface DropdownOption {
  value: string
  label: string
  disabled?: boolean
}

interface DropdownProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  helperText?: string
  options: DropdownOption[]
  placeholder?: string
}

export const Dropdown = forwardRef<HTMLSelectElement, DropdownProps>(
  (
    {
      label,
      error,
      helperText,
      options,
      placeholder,
      className = '',
      id: externalId,
      ...props
    },
    ref
  ) => {
    const generatedId = useId()
    const id = externalId ?? generatedId
    const descId = `${id}-desc`

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-slate-700">
            {label}
            {props.required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            {...props}
            ref={ref}
            id={id}
            aria-describedby={error || helperText ? descId : undefined}
            aria-invalid={!!error}
            className={[
              'w-full h-10 pl-3 pr-9 text-sm text-slate-900 bg-white',
              'border rounded-lg outline-none appearance-none transition-colors duration-150',
              'focus:ring-2 focus:ring-offset-0',
              error
                ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                : 'border-slate-300 focus:border-blue-500 focus:ring-blue-200',
              'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed',
              className,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          {/* Chevron icon */}
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <svg
              className="w-4 h-4 text-slate-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>
        {(error || helperText) && (
          <p id={descId} className={`text-xs ${error ? 'text-red-500' : 'text-slate-500'}`}>
            {error ?? helperText}
          </p>
        )}
      </div>
    )
  }
)

Dropdown.displayName = 'Dropdown'
