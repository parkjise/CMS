import { InputHTMLAttributes, useId } from 'react'

interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string
  description?: string
  size?: 'sm' | 'md'
}

const trackSize = { sm: 'w-8 h-4', md: 'w-11 h-6' }
const thumbSize = {
  sm: 'w-3 h-3 translate-x-0.5 peer-checked:translate-x-4',
  md: 'w-4 h-4 translate-x-1 peer-checked:translate-x-6',
}

export function Toggle({
  label,
  description,
  size = 'md',
  className = '',
  id: externalId,
  ...props
}: ToggleProps) {
  const generatedId = useId()
  const id = externalId ?? generatedId

  return (
    <label
      htmlFor={id}
      className={[
        'inline-flex items-center gap-3 cursor-pointer',
        props.disabled ? 'opacity-50 cursor-not-allowed' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="relative shrink-0">
        <input
          {...props}
          id={id}
          type="checkbox"
          className="sr-only peer"
        />
        {/* Track */}
        <div
          className={[
            trackSize[size],
            'rounded-full transition-colors duration-200',
            'bg-slate-200 peer-checked:bg-blue-600',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-blue-600 peer-focus-visible:ring-offset-2',
          ].join(' ')}
        />
        {/* Thumb */}
        <div
          className={[
            thumbSize[size],
            'absolute top-1/2 -translate-y-1/2',
            'bg-white rounded-full shadow-sm',
            'transition-transform duration-200',
          ].join(' ')}
        />
      </div>
      {(label || description) && (
        <div className="flex flex-col">
          {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
          {description && <span className="text-xs text-slate-500">{description}</span>}
        </div>
      )}
    </label>
  )
}
