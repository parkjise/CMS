'use client'

import { useEffect, useRef, useState } from 'react'
import { CopySuggestPopover } from '@/components/ai/CopySuggestPopover'
import { useEditStore } from '@/lib/editStore'

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
}: Props) {
  const isEditMode = useEditStore((s) => s.isEditMode)
  const updateField = useEditStore((s) => s.updateField)

  const [editing, setEditing] = useState(false)
  const [currentLength, setCurrentLength] = useState(initialValue.length)
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setCurrentLength(initialValue.length)
  }, [initialValue])

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

  if (!isEditMode) {
    return (
      <Tag
        data-editable="text"
        data-field={field}
        data-section-id={sectionId}
        className={className}
      >
        {initialValue || placeholder}
      </Tag>
    )
  }

  const overLimit =
    typeof maxLength === 'number' && currentLength > maxLength

  const handleClick = () => {
    if (!editing) setEditing(true)
  }

  const handleInput = (e: React.FormEvent<HTMLElement>) => {
    setCurrentLength(e.currentTarget.innerText.length)
  }

  const commit = () => {
    const text = (ref.current?.innerText ?? ref.current?.textContent ?? '')
    const truncated =
      typeof maxLength === 'number' && text.length > maxLength
        ? text.slice(0, maxLength)
        : text
    setEditing(false)
    setCurrentLength(truncated.length)
    if (ref.current) ref.current.innerText = truncated
    if (truncated !== initialValue) {
      updateField(sectionId, field, truncated, initialValue)
    }
  }

  const cancel = () => {
    if (ref.current) ref.current.innerText = initialValue
    setCurrentLength(initialValue.length)
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

  const applySuggestion = (value: string) => {
    const truncated =
      typeof maxLength === 'number' && value.length > maxLength
        ? value.slice(0, maxLength)
        : value
    if (ref.current) ref.current.innerText = truncated
    setCurrentLength(truncated.length)
    if (truncated !== initialValue) {
      updateField(sectionId, field, truncated, initialValue)
    }
  }

  return (
    <span className="relative inline-block">
      <Tag
        ref={ref as React.Ref<never>}
        data-editable="text"
        data-field={field}
        data-section-id={sectionId}
        contentEditable={editing}
        suppressContentEditableWarning
        onClick={handleClick}
        onInput={handleInput}
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
      >
        {initialValue || placeholder}
      </Tag>
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
          currentValue={initialValue}
          onApply={applySuggestion}
        />
      )}
    </span>
  )
}
