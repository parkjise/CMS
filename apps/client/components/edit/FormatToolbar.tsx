'use client'

import { Bold, Eraser, Italic, Link2 } from 'lucide-react'
import { COLOR_OPTIONS, SIZE_OPTIONS, isSafeHref } from '@/lib/richText'

// 인라인 편집 미니 툴바 — [굵게] [기울임] [색상] [글자크기] [링크] (기획서 12.2, T-065-A)
// 버튼은 mousedown 기본 동작을 막아 편집 중인 글의 선택 · 포커스를 유지한다.

type ClassGroup = 'rt-c-' | 'rt-s-'

interface Props {
  target: React.RefObject<HTMLElement | null>
  /** 링크 주소 입력 창이 떠 있는 동안 blur 저장을 미루기 위한 신호 */
  onBusyChange: (busy: boolean) => void
  onChange: () => void
}

const selectionRange = (root: HTMLElement): Range | null => {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (range.collapsed || !root.contains(range.commonAncestorContainer)) return null
  return range
}

const unwrap = (el: Element) => {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}

/** 선택한 글에 테마 클래스 적용 — 같은 종류(색 · 크기)의 기존 클래스는 바꾼다. null 이면 기본으로 */
export function applyClass(root: HTMLElement, group: ClassGroup, className: string | null): boolean {
  const range = selectionRange(root)
  if (!range) return false
  const fragment = range.extractContents()
  fragment.querySelectorAll('span').forEach((span) => {
    Array.from(span.classList)
      .filter((c) => c.startsWith(group))
      .forEach((c) => span.classList.remove(c))
    if (span.classList.length === 0) unwrap(span)
  })
  let inserted: Node = fragment
  let wrapper: HTMLSpanElement | null = null
  if (className) {
    wrapper = document.createElement('span')
    wrapper.className = className
    wrapper.appendChild(fragment)
    inserted = wrapper
  }
  const last = inserted.lastChild ?? inserted
  range.insertNode(inserted)
  const sel = window.getSelection()
  const next = document.createRange()
  if (wrapper) next.selectNodeContents(wrapper)
  else next.setEndAfter(last)
  sel?.removeAllRanges()
  sel?.addRange(next)
  return true
}

const TAG_ALIASES: Record<'B' | 'I', string[]> = { B: ['B', 'STRONG'], I: ['I', 'EM'] }

/**
 * 굵게 · 기울임 켜고 끄기 — 브라우저 execCommand 는 원래 굵은 제목(h1)에서 굵게를 '해제'해
 * 저장할 수 없는 style 로 바꾸므로 직접 <b> · <i> 로 감싼다.
 * 선택이 이미 그 서식 안이거나 그 서식을 포함하면 해제한다.
 */
export function toggleInline(root: HTMLElement, tag: 'B' | 'I'): boolean {
  const range = selectionRange(root)
  if (!range) return false
  const names = TAG_ALIASES[tag]
  let node: Node | null = range.commonAncestorContainer
  while (node && node !== root) {
    if (node instanceof HTMLElement && names.includes(node.tagName)) {
      // 해제한 글을 다시 선택해 둔다 — 이어서 다른 서식을 누를 수 있게
      const first = node.firstChild
      const last = node.lastChild
      unwrap(node)
      if (first && last) {
        const next = document.createRange()
        next.setStartBefore(first)
        next.setEndAfter(last)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(next)
      }
      return true
    }
    node = node.parentNode
  }
  const fragment = range.extractContents()
  const existing = fragment.querySelectorAll(names.join(','))
  let inserted: Node = fragment
  let wrapper: HTMLElement | null = null
  if (existing.length > 0) {
    existing.forEach(unwrap)
  } else {
    wrapper = document.createElement(tag.toLowerCase())
    wrapper.appendChild(fragment)
    inserted = wrapper
  }
  const last = inserted.lastChild ?? inserted
  range.insertNode(inserted)
  const next = document.createRange()
  if (wrapper) next.selectNodeContents(wrapper)
  else next.setEndAfter(last)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(next)
  return true
}

/** 선택한 글의 서식을 모두 지운다 */
export function clearFormatting(root: HTMLElement): boolean {
  const range = selectionRange(root)
  if (!range) return false
  const text = document.createTextNode(range.toString())
  range.deleteContents()
  range.insertNode(text)
  return true
}

const BTN =
  'inline-flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs font-medium text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white'

export function FormatToolbar({ target, onBusyChange, onChange }: Props) {
  const keep = (e: React.MouseEvent) => e.preventDefault()

  const run = (action: (root: HTMLElement) => boolean | void) => {
    const root = target.current
    if (!root) return
    if (action(root) !== false) onChange()
  }

  const exec = (command: string, value?: string) =>
    run(() => document.execCommand(command, false, value))

  const addLink = () => {
    const root = target.current
    if (!root) return
    const range = selectionRange(root)
    if (!range) return
    const saved = range.cloneRange()
    onBusyChange(true)
    const input = window.prompt(
      '링크 주소를 입력하세요 (https://, tel:, mailto:) — 비우면 링크를 지웁니다',
      'https://',
    )
    onBusyChange(false)
    root.focus()
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(saved)
    if (input === null) return
    const href = input.trim()
    if (href === '' || href === 'https://') {
      exec('unlink')
      return
    }
    if (!isSafeHref(href)) {
      window.alert('https:// · tel: · mailto: 로 시작하는 주소만 쓸 수 있습니다.')
      return
    }
    exec('createLink', href)
  }

  return (
    <div
      role="toolbar"
      aria-label="글자 서식"
      data-format-toolbar
      onMouseDown={keep}
      className="absolute bottom-full left-0 z-50 mb-7 flex items-center gap-0.5 whitespace-nowrap rounded-md bg-[#1f2937] p-1 shadow-lg"
    >
      <button type="button" className={BTN} aria-label="굵게" title="굵게" onClick={() => run((root) => toggleInline(root, 'B'))}>
        <Bold size={14} />
      </button>
      <button type="button" className={BTN} aria-label="기울임" title="기울임" onClick={() => run((root) => toggleInline(root, 'I'))}>
        <Italic size={14} />
      </button>
      <span className="mx-1 h-4 w-px bg-white/30" aria-hidden="true" />
      {COLOR_OPTIONS.map((o) => (
        <button
          key={o.className}
          type="button"
          className={BTN}
          aria-label={`글자 색: ${o.label}`}
          title={o.label}
          onClick={() => run((root) => applyClass(root, 'rt-c-', o.className))}
        >
          <span className={`${o.className} text-sm font-bold`}>가</span>
        </button>
      ))}
      <button
        type="button"
        className={BTN}
        aria-label="글자 색: 기본"
        title="기본 색"
        onClick={() => run((root) => applyClass(root, 'rt-c-', null))}
      >
        기본색
      </button>
      <span className="mx-1 h-4 w-px bg-white/30" aria-hidden="true" />
      {SIZE_OPTIONS.map((o) => (
        <button
          key={o.className}
          type="button"
          className={BTN}
          aria-label={`글자 크기: ${o.label}`}
          title={o.label}
          onClick={() => run((root) => applyClass(root, 'rt-s-', o.className))}
        >
          {o.label}
        </button>
      ))}
      <button
        type="button"
        className={BTN}
        aria-label="글자 크기: 보통"
        title="보통 크기"
        onClick={() => run((root) => applyClass(root, 'rt-s-', null))}
      >
        보통
      </button>
      <span className="mx-1 h-4 w-px bg-white/30" aria-hidden="true" />
      <button type="button" className={BTN} aria-label="링크" title="링크" onClick={addLink}>
        <Link2 size={14} />
      </button>
      <button
        type="button"
        className={BTN}
        aria-label="서식 지우기"
        title="서식 지우기"
        onClick={() => run(clearFormatting)}
      >
        <Eraser size={14} />
      </button>
    </div>
  )
}
