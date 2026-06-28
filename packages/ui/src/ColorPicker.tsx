import { useId } from 'react'

interface ColorPickerProps {
  label?: string
  value: string
  onChange: (value: string) => void
  /** 빠른 선택용 색상 프리셋 (16진수) */
  presets?: string[]
  disabled?: boolean
}

const DEFAULT_PRESETS = [
  '#1a73e8',
  '#6366f1',
  '#16a34a',
  '#d97706',
  '#ec4899',
  '#1e3a5f',
  '#111827',
  '#ef4444',
]

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function isValidHex(value: string): boolean {
  return HEX_RE.test(value.trim())
}

/**
 * 색상 피커 (T-059): 네이티브 컬러 입력 + 16진수 텍스트 입력 + 프리셋 팔레트.
 */
export function ColorPicker({
  label,
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  disabled = false,
}: ColorPickerProps) {
  const id = useId()
  const valid = isValidHex(value)

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          aria-label={label ?? '색상 선택'}
          value={valid ? value : '#000000'}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 shrink-0 cursor-pointer rounded border border-slate-300 disabled:cursor-not-allowed"
        />
        <input
          type="text"
          aria-label={`${label ?? '색상'} 16진수 값`}
          value={value}
          disabled={disabled}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          className={[
            'h-9 w-28 rounded border px-2 font-mono text-sm uppercase outline-none',
            valid
              ? 'border-slate-300 focus:border-blue-500'
              : 'border-red-400 focus:border-red-400',
            'disabled:bg-slate-50 disabled:text-slate-400',
          ].join(' ')}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-label={`프리셋 색상 ${preset}`}
            title={preset}
            disabled={disabled}
            onClick={() => onChange(preset)}
            className={[
              'h-6 w-6 rounded-full border transition',
              value.toLowerCase() === preset.toLowerCase()
                ? 'border-slate-900 ring-2 ring-slate-300'
                : 'border-slate-200 hover:scale-110',
            ].join(' ')}
            style={{ backgroundColor: preset }}
          />
        ))}
      </div>

      {!valid && (
        <p className="text-xs text-red-500">
          올바른 16진수 색상(예: #1a73e8)을 입력하세요.
        </p>
      )}
    </div>
  )
}
