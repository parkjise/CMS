import { useState } from 'react'
import { ColorPicker, FontSelector, Button, isValidHex } from '@cms/ui'

/**
 * CSS 커스터마이징 패널 (T-059).
 * ColorPicker·FontSelector로 색상/폰트를 조정하고, 오른쪽 미리보기에 즉시 반영한다.
 */
export interface CustomizeDefaults {
  primary: string
  accent: string
  font_heading: string
  font_body: string
}

interface CustomizePanelProps {
  /** 적용된 템플릿이 없으면 비활성 */
  disabled: boolean
  isSaving: boolean
  /** 현재 적용 템플릿 기준 기본값 (초기화 대상) */
  defaults: CustomizeDefaults
  onSave: (cssOverrides: Record<string, string>) => void
}

export function CustomizePanel({
  disabled,
  isSaving,
  defaults,
  onSave,
}: CustomizePanelProps) {
  const [primary, setPrimary] = useState(defaults.primary)
  const [accent, setAccent] = useState(defaults.accent)
  const [fontHeading, setFontHeading] = useState(defaults.font_heading)
  const [fontBody, setFontBody] = useState(defaults.font_body)

  const canSave =
    !disabled && !isSaving && isValidHex(primary) && isValidHex(accent)

  const handleReset = () => {
    setPrimary(defaults.primary)
    setAccent(defaults.accent)
    setFontHeading(defaults.font_heading)
    setFontBody(defaults.font_body)
  }

  const handleSave = () => {
    onSave({
      primary,
      accent,
      font_heading: fontHeading,
      font_body: fontBody,
    })
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          색상 · 폰트 조정
        </h2>
        <button
          type="button"
          onClick={handleReset}
          disabled={disabled}
          className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-slate-300"
        >
          기본값으로 초기화
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {disabled
          ? '먼저 템플릿을 적용하면 색상과 폰트를 조정할 수 있습니다.'
          : '변경 사항은 오른쪽 미리보기에 즉시 반영됩니다.'}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 컨트롤 */}
        <div className="space-y-4">
          <ColorPicker
            label="주요 색상"
            value={primary}
            onChange={setPrimary}
            disabled={disabled}
          />
          <ColorPicker
            label="강조 색상"
            value={accent}
            onChange={setAccent}
            disabled={disabled}
          />
          <FontSelector
            label="제목 폰트"
            value={fontHeading}
            onChange={setFontHeading}
            disabled={disabled}
          />
          <FontSelector
            label="본문 폰트"
            value={fontBody}
            onChange={setFontBody}
            disabled={disabled}
          />
        </div>

        {/* 실시간 미리보기 */}
        <div
          aria-label="커스터마이징 미리보기"
          className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-5"
        >
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            미리보기
          </span>
          <h3
            className="text-xl font-bold"
            style={{ fontFamily: fontHeading, color: isValidHex(primary) ? primary : undefined }}
          >
            우리 가게를 소개합니다
          </h3>
          <p className="text-sm text-slate-600" style={{ fontFamily: fontBody }}>
            본문 텍스트는 이렇게 보입니다. 방문해 주셔서 감사합니다.
          </p>
          <div className="flex gap-2">
            <span
              className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: isValidHex(primary) ? primary : '#999' }}
            >
              주요 버튼
            </span>
            <span
              className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: isValidHex(accent) ? accent : '#999' }}
            >
              강조
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={handleSave} disabled={!canSave}>
          {isSaving ? '저장 중…' : '커스터마이징 저장'}
        </Button>
      </div>
    </section>
  )
}
