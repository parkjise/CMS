import { useState } from 'react'
import { Button } from '@cms/ui'

/**
 * CSS 커스터마이징 패널 (T-058 기본 버전).
 * T-059에서 packages/ui 의 ColorPicker·FontSelector + 실시간 미리보기로 고도화 예정.
 */
interface CustomizePanelProps {
  /** 적용된 템플릿이 없으면 비활성 */
  disabled: boolean
  isSaving: boolean
  onSave: (cssOverrides: Record<string, string>) => void
}

const FONT_OPTIONS = [
  'Pretendard',
  'Noto Sans KR',
  'Noto Serif KR',
  'Nanum Gothic',
]

export function CustomizePanel({
  disabled,
  isSaving,
  onSave,
}: CustomizePanelProps) {
  const [primary, setPrimary] = useState('#1a73e8')
  const [accent, setAccent] = useState('#1a73e8')
  const [fontHeading, setFontHeading] = useState(FONT_OPTIONS[0])

  const handleSave = () => {
    onSave({
      primary,
      accent,
      font_heading: fontHeading,
    })
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">색상 · 폰트 조정</h2>
      <p className="mt-1 text-sm text-slate-500">
        {disabled
          ? '먼저 템플릿을 적용하면 색상과 폰트를 조정할 수 있습니다.'
          : '브랜드에 맞게 주요 색상과 폰트를 변경하세요.'}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">주요 색상</span>
          <input
            type="color"
            aria-label="주요 색상"
            value={primary}
            disabled={disabled}
            onChange={(e) => setPrimary(e.target.value)}
            className="h-9 w-full cursor-pointer rounded border border-slate-200 disabled:cursor-not-allowed"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">강조 색상</span>
          <input
            type="color"
            aria-label="강조 색상"
            value={accent}
            disabled={disabled}
            onChange={(e) => setAccent(e.target.value)}
            className="h-9 w-full cursor-pointer rounded border border-slate-200 disabled:cursor-not-allowed"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">제목 폰트</span>
          <select
            aria-label="제목 폰트"
            value={fontHeading}
            disabled={disabled}
            onChange={(e) => setFontHeading(e.target.value)}
            className="h-9 w-full rounded border border-slate-200 px-2 disabled:cursor-not-allowed"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={handleSave} disabled={disabled || isSaving}>
          {isSaving ? '저장 중…' : '커스터마이징 저장'}
        </Button>
      </div>
    </section>
  )
}
