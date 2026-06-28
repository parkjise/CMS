import { useId } from 'react'

interface FontSelectorProps {
  label?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/** 지원 한국어 웹폰트 목록 */
export const KOREAN_WEB_FONTS = [
  'Pretendard',
  'Noto Sans KR',
  'Noto Serif KR',
  'Nanum Gothic',
  'Nanum Myeongjo',
  'Spoqa Han Sans Neo',
  'IBM Plex Sans KR',
]

/**
 * 폰트 선택기 (T-059): 한국어 웹폰트 목록을 각 폰트로 미리보기하며 선택.
 */
export function FontSelector({
  label,
  value,
  onChange,
  disabled = false,
}: FontSelectorProps) {
  const id = useId()

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <select
        id={id}
        aria-label={label ?? '폰트 선택'}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded border border-slate-300 px-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
        style={{ fontFamily: value }}
      >
        {KOREAN_WEB_FONTS.map((font) => (
          <option key={font} value={font} style={{ fontFamily: font }}>
            {font}
          </option>
        ))}
      </select>
      <p
        className="text-sm text-slate-500"
        style={{ fontFamily: value }}
        aria-hidden
      >
        가나다라 ABCD 1234
      </p>
    </div>
  )
}
