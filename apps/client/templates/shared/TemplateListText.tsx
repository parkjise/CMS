'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { selectEditingUi, useEditStore } from '@/lib/editStore'
import type { PublicSection } from '@/lib/publicSite.types'
import { itemString, parseList, replaceListItem, useFieldDraft } from './listDraft'
import { RichLine } from './RichLine'

type Tag = 'strong' | 'span' | 'p' | 'h2' | 'h3' | 'h4' | 'li' | 'time'

interface Props {
  section: PublicSection
  editable: boolean
  /** 목록 칸 이름 (features · cards …) */
  field: string
  index: number
  /** 항목 안 글자 키 (name · title …) — 없으면 글자만 있는 목록의 항목 자체 (T-125-E) */
  itemKey?: string
  as?: Tag
  className?: string
  lang?: string
  maxLength?: number
  /** 화면 읽기 프로그램용 이름 (예: '1번 기능 이름') */
  label?: string
  /** 여러 줄 칸 — Enter 는 줄바꿈, 바깥을 누르면 저장 대기 (T-125-E) */
  multiline?: boolean
  /**
   * **굵게** · 줄바꿈 표기 칸 — 평소엔 RichLine 으로 굵게 그리고, 고칠 때는 표기 그대로(원문) (T-125-E).
   * (서버 컴포넌트에서 쓰므로 그리는 함수 대신 켜고 끄는 값으로 받는다)
   */
  boldMarks?: boolean
}

/** 고친 글 정리 — 한 줄 칸은 줄바꿈을 한 칸 띄움으로, 여러 줄 칸은 빈 줄을 하나까지만 */
const normalize = (text: string, multiline: boolean) =>
  multiline
    ? text
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : text.replace(/\s*\n\s*/g, ' ').trim()

/**
 * 목록 칸 안의 글자 인라인 편집 (T-125-C, T-125-E) — 카드 제목 · 기능 이름 · 강점 항목처럼 항목마다 있는 글자.
 * 눌러서 고치고 Enter(여러 줄 칸은 바깥 누르기)로 저장 대기, Esc 로 취소. 서식 없는 글자만.
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
  multiline = false,
  boldMarks = false,
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

  const shown = boldMarks ? <RichLine text={value} /> : value
  // 어느 칸인지 — 편집 글자(EditableText)처럼 방문자 화면에도 단다 (서버 · 첫 화면 같게)
  const dataField = itemKey === undefined ? `${field}.${index}` : `${field}.${index}.${itemKey}`

  if (!editable || !isEditing) {
    return value ? (
      <Tag className={className} lang={lang} data-field={dataField} data-section-id={section.id}>
        {shown}
      </Tag>
    ) : null
  }

  const commit = () => {
    const el = ref.current
    if (!el) return
    const text = normalize(el.innerText, multiline)
    const next = typeof maxLength === 'number' ? text.slice(0, maxLength) : text
    setEditing(false)
    setLength(next.length)
    if (next !== value) replaceListItem(section, field, index, itemKey, next)
  }

  const cancel = () => {
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
    } else if (e.key === 'Enter' && !multiline) {
      e.preventDefault()
      commit()
    }
  }

  const overLimit = typeof maxLength === 'number' && length > maxLength

  return (
    <Tag
      // 고치기 시작 · 끝낼 때 새로 그린다 — 사용자가 바꾼 DOM 을 React 가 맞추려다 꼬이지 않게
      key={editing ? 'editing' : `view:${value}`}
      ref={ref as React.Ref<never>}
      data-editable="text"
      data-field={dataField}
      data-section-id={section.id}
      className={[className, editing ? 'editing' : '', overLimit ? 'over-limit' : '', multiline && editing ? 'u-pre-line' : '']
        .filter(Boolean)
        .join(' ')}
      lang={lang}
      role="textbox"
      aria-label={label ?? `${index + 1}번 항목`}
      aria-multiline={multiline || undefined}
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
      {/* 고칠 때는 원문(표기 그대로), 평소엔 굵게 그린 결과 */}
      {editing ? value : shown}
    </Tag>
  )
}
