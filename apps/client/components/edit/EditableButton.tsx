'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useEditStore } from '@/lib/editStore'
import { isSafeHref } from '@/lib/richText'
import {
  BUTTON_STYLE_LABELS,
  type ButtonStyle,
  parseButtonStyle,
  parseNewTab,
} from '@/lib/buttonStyle'

// 버튼 편집 팝업 — 문구 + 링크 주소를 한 번에 (기획서 12.4, T-065-B)
// 편집 모드에서 버튼을 누르면 이동하지 않고 팝업이 열린다. 저장은 상단 [저장] 일괄 저장으로.

interface Props {
  sectionId: string
  textField: string
  urlField: string
  initialText: string
  initialUrl: string
  maxLength?: number
  /** 공통 클래스 — 스타일별 클래스는 variantClassName */
  className?: string
  /** 버튼 스타일 · 새 창 열기 (T-088-A) — 둘 다 있을 때만 팝업에 노출 */
  styleField?: string
  newTabField?: string
  initialStyle?: ButtonStyle
  initialNewTab?: boolean
  variantClassName?: Record<ButtonStyle, string>
}

export const BUTTON_URL_HINT = 'https:// · tel: · mailto: 또는 /로 시작하는 사이트 안 경로'

export function EditableButton({
  sectionId,
  textField,
  urlField,
  initialText,
  initialUrl,
  maxLength = 20,
  className,
  styleField,
  newTabField,
  initialStyle = 'filled',
  initialNewTab = false,
  variantClassName,
}: Props) {
  const isEditMode = useEditStore((s) => s.isEditMode)
  const isPreview = useEditStore((s) => s.isPreview)
  const pendingText = useEditStore((s) => s.pendingChanges[`${sectionId}:${textField}`])
  const pendingUrl = useEditStore((s) => s.pendingChanges[`${sectionId}:${urlField}`])
  const pendingStyle = useEditStore((s) =>
    styleField ? s.pendingChanges[`${sectionId}:${styleField}`] : undefined,
  )
  const pendingNewTab = useEditStore((s) =>
    newTabField ? s.pendingChanges[`${sectionId}:${newTabField}`] : undefined,
  )
  const updateField = useEditStore((s) => s.updateField)

  // 편집 모드(미리보기 포함)에서는 저장 전 값을 보여 준다
  const text = isEditMode && pendingText ? pendingText.new_value : initialText
  const url = isEditMode && pendingUrl ? pendingUrl.new_value : initialUrl
  const buttonStyle =
    isEditMode && pendingStyle ? parseButtonStyle(pendingStyle.new_value) : initialStyle
  const newTab = isEditMode && pendingNewTab ? parseNewTab(pendingNewTab.new_value) : initialNewTab
  const editing = isEditMode && !isPreview
  const hasOptions = Boolean(styleField && newTabField)
  const buttonClass = [className, variantClassName?.[buttonStyle]].filter(Boolean).join(' ')
  // 새 창으로 열 때는 원래 페이지를 건드리지 못하게 (noopener)
  const newTabProps = newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}

  const [open, setOpen] = useState(false)
  const [draftText, setDraftText] = useState(text)
  const [draftUrl, setDraftUrl] = useState(url)
  const [draftStyle, setDraftStyle] = useState<ButtonStyle>(buttonStyle)
  const [draftNewTab, setDraftNewTab] = useState(newTab)
  const [error, setError] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const textInputId = useId()
  const urlInputId = useId()

  // 팝업 밖을 누르면 닫는다 (저장하지 않음)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!editing) {
    if (!text || !url) return null
    return (
      <a href={url} className={buttonClass} data-button-style={buttonStyle} {...newTabProps}>
        {text}
      </a>
    )
  }

  const openPopover = (e: React.MouseEvent) => {
    e.preventDefault()
    setDraftText(text)
    setDraftUrl(url)
    setDraftStyle(buttonStyle)
    setDraftNewTab(newTab)
    setError(null)
    setOpen(true)
  }

  const apply = () => {
    const nextText = draftText.trim()
    const nextUrl = draftUrl.trim()
    if (!nextText) {
      setError('버튼 문구를 입력해 주세요.')
      return
    }
    if (nextText.length > maxLength) {
      setError(`버튼 문구는 ${maxLength}자 이하여야 합니다.`)
      return
    }
    if (!nextUrl || !isSafeHref(nextUrl) || /[\s<>"'`]/.test(nextUrl)) {
      setError(`링크 주소는 ${BUTTON_URL_HINT}만 쓸 수 있습니다.`)
      return
    }
    if (nextText !== text) updateField(sectionId, textField, nextText, initialText)
    if (nextUrl !== url) updateField(sectionId, urlField, nextUrl, initialUrl)
    if (styleField && draftStyle !== buttonStyle) {
      updateField(sectionId, styleField, draftStyle, initialStyle)
    }
    if (newTabField && draftNewTab !== newTab) {
      updateField(sectionId, newTabField, String(draftNewTab), String(initialNewTab))
    }
    setOpen(false)
  }

  return (
    <span ref={wrapperRef} className="relative inline-block">
      <a
        href={url || '#'}
        onClick={openPopover}
        data-editable="button"
        data-section-id={sectionId}
        data-field={textField}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-button-style={buttonStyle}
        className={[
          buttonClass,
          'outline-dashed outline-2 outline-offset-4 outline-[color:var(--color-primary)]',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {text || '버튼 문구'}
      </a>
      {open && (
        <div
          role="dialog"
          aria-label="버튼 편집"
          className="absolute left-0 top-full z-50 mt-3 w-72 space-y-3 rounded-[var(--border-radius-card)] border border-[color:var(--color-border)] bg-[var(--color-background)] p-4 text-left text-sm text-[color:var(--color-text-primary)] shadow-lg"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'Enter') {
              e.preventDefault()
              apply()
            }
          }}
        >
          <div className="space-y-1">
            <label htmlFor={textInputId} className="flex justify-between text-xs font-medium">
              <span>버튼 문구</span>
              <span
                className={
                  draftText.trim().length > maxLength
                    ? 'text-[color:var(--color-danger)]'
                    : 'text-[color:var(--color-text-muted)]'
                }
              >
                {draftText.trim().length} / {maxLength}
              </span>
            </label>
            <input
              id={textInputId}
              autoFocus
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              className="w-full rounded-[var(--border-radius-base)] border border-[color:var(--color-border)] px-2 py-1.5"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={urlInputId} className="text-xs font-medium">
              링크 주소
            </label>
            <input
              id={urlInputId}
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="https://"
              className="w-full rounded-[var(--border-radius-base)] border border-[color:var(--color-border)] px-2 py-1.5"
            />
            <p className="text-[11px] text-[color:var(--color-text-muted)]">{BUTTON_URL_HINT}</p>
          </div>
          {hasOptions && (
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium">버튼 스타일</legend>
              <div className="flex gap-3">
                {(Object.keys(BUTTON_STYLE_LABELS) as ButtonStyle[]).map((key) => (
                  <label key={key} className="flex items-center gap-1 text-xs">
                    <input
                      type="radio"
                      name={`${sectionId}-button-style`}
                      value={key}
                      checked={draftStyle === key}
                      onChange={() => setDraftStyle(key)}
                    />
                    {BUTTON_STYLE_LABELS[key]}
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={draftNewTab}
                  onChange={(e) => setDraftNewTab(e.target.checked)}
                />
                새 창으로 열기
              </label>
            </fieldset>
          )}
          {error && (
            <p role="alert" className="text-xs text-[color:var(--color-danger)]">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-[var(--border-radius-base)] px-3 py-1.5 text-xs hover:bg-[var(--color-surface)]"
            >
              취소
            </button>
            <button
              type="button"
              onClick={apply}
              className="rounded-[var(--border-radius-base)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-on-primary)]"
            >
              적용
            </button>
          </div>
        </div>
      )}
    </span>
  )
}
