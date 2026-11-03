'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { selectEditingUi, useEditStore } from '@/lib/editStore'
import type { PublicSection } from '@/lib/publicSite.types'
import { itemString, parseList, replaceListItem, useFieldDraft } from './listDraft'

type Tag = 'strong' | 'span' | 'p' | 'h3' | 'h4'

interface Props {
  section: PublicSection
  editable: boolean
  /** 목록 칸 이름 (features · cards …) */
  field: string
  index: number
  /** 항목 안 글자 키 (name · name_en …) */
  itemKey: string
  as?: Tag
  className?: string
  lang?: string
  maxLength?: number
  /** 화면 읽기 프로그램용 이름 (예: '1번 기능 이름') */
  label?: string
}

/**
 * 목록 칸 안의 글자 인라인 편집 (T-125-C) — 기능 이름처럼 항목마다 있는 짧은 글자.
 * 눌러서 고치고 Enter · 바깥 누르기로 저장 대기, Esc 로 취소. 서식 없는 한 줄 글자만.
 * 그 항목만 바꾼 목록 전체를 저장 대기에 올린다 (listDraft). 편집 모드에서는 링크로 이동하지 않는다.
 */
export function TemplateListText({
  section,
  editable,
  field,
  index,
  itemKey,
  as: Tag = 'span',
  className,
  lang,
  maxLength,
  label,
}: Props) {
  const isEditing = useEditStore(selectEditingUi)
  const { value: raw } = useFieldDraft(section, field)
  const value = itemString(parseList(raw), index, itemKey)

  const [editing, setEditing] = useState(false)
  const [length, setLength] = useState(value.length)
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => setLength(value.length), [value])

  useEffect(() => {
    const el = ref.current
    if (!editing || !el) return
    el.focus()
    // 커서를 끝으로
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [editing])

  if (!editable || !isEditing) {
    return value ? (
      <Tag className={className} lang={lang}>
        {value}
      </Tag>
    ) : null
  }

  const commit = () => {
    const el = ref.current
    if (!el) return
    const text = el.innerText.replace(/\s*\n\s*/g, ' ').trim()
    const next = typeof maxLength === 'number' ? text.slice(0, maxLength) : text
    el.innerText = next
    setEditing(false)
    setLength(next.length)
    if (next !== value) replaceListItem(section, field, index, itemKey, next)
  }

  const cancel = () => {
    if (ref.current) ref.current.innerText = value
    setLength(value.length)
    setEditing(false)
  }

  const onClick = (e: MouseEvent) => {
    // 카드 · 기능 링크 안이어도 이동하지 않고 고치기
    e.preventDefault()
    e.stopPropagation()
    if (!editing) setEditing(true)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
      ref.current?.blur()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit()
      ref.current?.blur()
    }
  }

  const overLimit = typeof maxLength === 'number' && length > maxLength

  return (
    <Tag
      ref={ref as React.Ref<never>}
      data-editable="text"
      data-field={`${field}.${index}.${itemKey}`}
      data-section-id={section.id}
      className={[className, editing ? 'editing' : '', overLimit ? 'over-limit' : ''].filter(Boolean).join(' ')}
      lang={lang}
      role="textbox"
      aria-label={label ?? `${index + 1}번 항목`}
      tabIndex={0}
      contentEditable={editing}
      suppressContentEditableWarning
      onClick={onClick}
      onFocus={() => !editing && setEditing(true)}
      onBlur={() => editing && commit()}
      onInput={() => setLength(ref.current?.innerText.length ?? 0)}
      onKeyDown={onKeyDown}
      onPaste={(e) => {
        e.preventDefault()
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
      }}
    >
      {value}
    </Tag>
  )
}
