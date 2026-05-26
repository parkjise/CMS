import { forwardRef, InputHTMLAttributes, useId } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', id: externalId, ...props }, ref) => {
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
        <input
          {...props}
          ref={ref}
          id={id}
          aria-describedby={error || helperText ? descId : undefined}
          aria-invalid={!!error}
          className={[
            'w-full h-10 px-3 text-sm text-slate-900 bg-white',
            'border rounded-lg outline-none transition-colors duration-150',
            'placeholder:text-slate-400',
            'focus:ring-2 focus:ring-offset-0',
            error
              ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
              : 'border-slate-300 focus:border-blue-500 focus:ring-blue-200',
            'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
        />
        {(error || helperText) && (
          <p id={descId} className={`text-xs ${error ? 'text-red-500' : 'text-slate-500'}`}>
            {error ?? helperText}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
