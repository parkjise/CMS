'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CopySuggestPopover } from '@/components/ai/CopySuggestPopover'
import { FormatToolbar } from '@/components/edit/FormatToolbar'
import { useEditStore } from '@/lib/editStore'
import {
  RICH_TEXT_VALUE_TYPE,
  richToPlainText,
  sanitizeRichHtml,
  serializeEditable,
  toEditableHtml,
} from '@/lib/richText'

type Tag = 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div'

interface Props {
  sectionId: string
  field: string
  initialValue: string
  maxLength?: number
  as?: Tag
  multiline?: boolean
  placeholder?: string
  className?: string
  /** 제목 연결(aria-labelledby)용 id · 언어 표시 — 코드형 템플릿 마크업 유지 (T-121) */
  id?: string
  lang?: string
  /** 저장된 값의 형식 — 'RICH_TEXT' 면 서식 HTML (T-065-A) */
  valueType?: string
  /** 미니 툴바(굵게 · 기울임 · 색 · 크기 · 링크) 사용 — 링크 안의 글자 · 연락처 칸은 끈다 */
  formatting?: boolean
}

export function EditableText({
  sectionId,
  field,
  initialValue,
  maxLength,
  as = 'span',
  multiline = false,
  placeholder,
  className,
  id,
  lang,
  valueType,
  formatting = false,
}: Props) {
  const isEditMode = useEditStore((s) => s.isEditMode)
  const isPreview = useEditStore((s) => s.isPreview)
  const pending = useEditStore((s) => s.pendingChanges[`${sectionId}:${field}`])
  const updateField = useEditStore((s) => s.updateField)

  // 편집 모드(미리보기 포함)에서는 저장 전 고친 값을 보여 준다 (T-065-B)
  const draft = isEditMode ? pending : undefined
  const value = draft ? draft.new_value : initialValue
  const rich = draft ? draft.format === 'rich' : valueType === RICH_TEXT_VALUE_TYPE
  // 서식 글 · 툴바 칸은 DOM 을 HTML 로 읽는다 (글자 수는 태그를 뺀 실제 글자)
  const structured = rich || formatting
  const initialLength = rich ? richToPlainText(value).length : value.length
  const plainInitial = rich ? richToPlainText(value) : value

  const [editing, setEditing] = useState(false)
  const [currentLength, setCurrentLength] = useState(initialLength)
  const ref = useRef<HTMLElement | null>(null)
  // 링크 주소 입력 창이 떠 있는 동안에는 blur 로 저장하지 않는다
  const toolbarBusy = useRef(false)

  useEffect(() => {
    setCurrentLength(initialLength)
  }, [initialLength])

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus()
      // 커서를 끝으로 이동
      const range = document.createRange()
      range.selectNodeContents(ref.current)
      range.collapse(false)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }, [editing])

  const Tag = as
  // 서식 글은 허용 태그만 다시 걸러 HTML 로, 일반 글자는 글자 그대로 (꺾쇠도 글자)
  // 객체를 값이 바뀔 때만 새로 만든다 — React 19 는 새 객체면 innerHTML 을 다시 써서
  // 편집 중 한 글자 칠 때마다 입력이 지워진다
  const content = useMemo(
    () =>
      rich
        ? { dangerouslySetInnerHTML: { __html: sanitizeRichHtml(value) } }
        : { children: value || placeholder },
    [rich, value, placeholder],
  )

  if (!isEditMode || isPreview) {
    return (
      <Tag
        data-editable="text"
        data-field={field}
        data-section-id={sectionId}
        data-rich-text={rich ? '' : undefined}
        className={className}
        id={id}
        lang={lang}
        {...content}
      />
    )
  }

  const overLimit =
    typeof maxLength === 'number' && currentLength > maxLength

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    // 편집 모드에서는 글 안의 링크로 이동하지 않는다
    if ((e.target as HTMLElement).closest('a')) e.preventDefault()
    if (!editing) setEditing(true)
  }

  const measure = () => {
    const el = ref.current
    if (!el) return
    setCurrentLength(
      structured ? serializeEditable(el, { multiline }).length : el.innerText.length,
    )
  }

  const commitStructured = (el: HTMLElement) => {
    const result = serializeEditable(el, { multiline, maxLength })
    setEditing(false)
    setCurrentLength(result.length)
    el.innerHTML = toEditableHtml(result.value, result.rich)
    if (result.value !== value || result.rich !== rich) {
      updateField(sectionId, field, result.value, initialValue, result.rich ? 'rich' : 'plain')
    }
  }

  const commit = () => {
    if (toolbarBusy.current) return
    if (structured && ref.current) {
      commitStructured(ref.current)
      return
    }
    const text = (ref.current?.innerText ?? ref.current?.textContent ?? '')
    const truncated =
      typeof maxLength === 'number' && text.length > maxLength
        ? text.slice(0, maxLength)
        : text
    setEditing(false)
    setCurrentLength(truncated.length)
    if (ref.current) ref.current.innerText = truncated
    if (truncated !== value) {
      updateField(sectionId, field, truncated, initialValue)
    }
  }

  const cancel = () => {
    if (ref.current) {
      if (rich) ref.current.innerHTML = sanitizeRichHtml(value)
      else ref.current.innerText = value
    }
    setCurrentLength(initialLength)
    setEditing(false)
  }

  const handleBlur = () => commit()

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
      ref.current?.blur()
      return
    }
    if (!multiline && e.key === 'Enter') {
      e.preventDefault()
      commit()
      ref.current?.blur()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  const applySuggestion = (suggestion: string) => {
    const truncated =
      typeof maxLength === 'number' && suggestion.length > maxLength
        ? suggestion.slice(0, maxLength)
        : suggestion
    if (ref.current) ref.current.innerText = truncated
    setCurrentLength(truncated.length)
    // AI 추천은 글자만 — 서식 글이었다면 일반 글자로 바뀐다
    if (truncated !== value || rich) {
      updateField(sectionId, field, truncated, initialValue, 'plain')
    }
  }

  return (
    <span className="relative inline-block">
      <Tag
        ref={ref as React.Ref<never>}
        data-editable="text"
        data-field={field}
        data-section-id={sectionId}
        id={id}
        lang={lang}
        contentEditable={editing}
        suppressContentEditableWarning
        onClick={handleClick}
        onInput={measure}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className={[
          className,
          editing ? 'editing' : '',
          overLimit ? 'over-limit' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-rich-text={rich ? '' : undefined}
        {...content}
      />
      {editing && formatting && (
        <FormatToolbar
          target={ref}
          onBusyChange={(busy) => {
            toolbarBusy.current = busy
          }}
          onChange={measure}
        />
      )}
      {editing && typeof maxLength === 'number' && (
        <span
          aria-hidden="true"
          className={[
            'pointer-events-none absolute -top-5 right-0 rounded bg-[var(--color-text-primary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-background)]',
            overLimit ? 'bg-[var(--color-danger)]' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {currentLength} / {maxLength}
        </span>
      )}
      {!editing && (
        <CopySuggestPopover
          sectionId={sectionId}
          field={field}
          currentValue={plainInitial}
          onApply={applySuggestion}
        />
      )}
    </span>
  )
}
