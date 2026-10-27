// 서식 있는 글(RICH_TEXT) — 인라인 편집 미니 툴바 (기획서 12.2, T-065-A)
// 서버(app/services/rich_text.py)가 저장 전에 허용 목록으로 정리한다.
// 여기서는 표시 직전에 한 번 더 거르고, 편집 중인 내용을 같은 형식의 HTML 로 바꾼다.

export const RICH_TEXT_VALUE_TYPE = 'RICH_TEXT'

export const COLOR_OPTIONS = [
  { className: 'rt-c-primary', label: '주 색상' },
  { className: 'rt-c-accent', label: '강조 색' },
  { className: 'rt-c-muted', label: '흐리게' },
] as const

export const SIZE_OPTIONS = [
  { className: 'rt-s-sm', label: '작게' },
  { className: 'rt-s-lg', label: '크게' },
] as const

const ALLOWED_CLASSES: ReadonlySet<string> = new Set([
  ...COLOR_OPTIONS.map((o) => o.className),
  ...SIZE_OPTIONS.map((o) => o.className),
])

/** 링크로 허용하는 주소 — http(s) · 메일 · 전화 · 사이트 안 경로 */
export const isSafeHref = (href: string): boolean =>
  /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(href.trim())

const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;')

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

const TAG_RE = /<(\/?)([a-zA-Z]+)((?:\s+[a-zA-Z-]+(?:="[^"<>]*")?)*)\s*\/?>/g
const ATTR_RE = /([a-zA-Z-]+)="([^"<>]*)"/g

const NORMALIZED_TAG: Record<string, string> = {
  b: 'b',
  strong: 'b',
  i: 'i',
  em: 'i',
  a: 'a',
  span: 'span',
}

const readAttrs = (raw: string): Record<string, string> => {
  const attrs: Record<string, string> = {}
  for (const m of raw.matchAll(ATTR_RE)) attrs[m[1].toLowerCase()] = decodeEntities(m[2])
  return attrs
}

const openTag = (tag: string, attrs: Record<string, string>): string | null => {
  if (tag === 'a') {
    const href = attrs.href ?? ''
    if (!isSafeHref(href)) return null
    return `<a href="${escapeAttr(href.trim())}" target="_blank" rel="noopener noreferrer nofollow">`
  }
  if (tag === 'span') {
    const classes = (attrs.class ?? '').split(/\s+/).filter((c) => ALLOWED_CLASSES.has(c))
    if (classes.length === 0) return null
    return `<span class="${classes.join(' ')}">`
  }
  return `<${tag}>`
}

/**
 * 표시용 정리 — 허용 태그만 남기고 나머지 꺾쇠는 모두 글자로 바꾼다 (서버 · 브라우저 공통).
 * 허용 태그도 정해진 속성만 다시 써서 내보낸다.
 */
export function sanitizeRichHtml(input: string): string {
  let out = ''
  let last = 0
  // 열린 태그 짝 — 버린 여는 태그의 닫는 태그도 버린다
  const stack: Array<string | null> = []
  for (const m of input.matchAll(TAG_RE)) {
    out += escapeText(decodeEntities(input.slice(last, m.index)))
    last = (m.index ?? 0) + m[0].length
    const closing = m[1] === '/'
    const name = m[2].toLowerCase()
    if (name === 'br') {
      if (!closing) out += '<br>'
      continue
    }
    const tag = NORMALIZED_TAG[name]
    if (!tag) continue
    if (closing) {
      const idx = stack.lastIndexOf(tag)
      const dropped = stack.lastIndexOf(`!${tag}`)
      if (idx >= 0 && idx >= dropped) {
        stack.splice(idx, 1)
        out += `</${tag}>`
      } else if (dropped >= 0) {
        stack.splice(dropped, 1)
      }
      continue
    }
    const open = openTag(tag, readAttrs(m[3]))
    if (open) {
      stack.push(tag)
      out += open
    } else {
      stack.push(`!${tag}`)
    }
  }
  out += escapeText(decodeEntities(input.slice(last)))
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const t = stack[i]
    if (t && !t.startsWith('!')) out += `</${t}>`
  }
  return out
}

/** 서식 글의 실제 글자 (줄바꿈 1자) — 글자 수 표시 · AI 추천 입력 */
export function richToPlainText(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''))
}

// ── 편집 중인 DOM → 저장할 값 ─────────────────────────────────────────

type RichNode =
  | { kind: 'text'; text: string }
  | { kind: 'br' }
  | { kind: 'el'; open: string; close: string; children: RichNode[] }

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI'])

const elementWrapper = (el: HTMLElement): { open: string; close: string } | null => {
  const tag = el.tagName
  if (tag === 'B' || tag === 'STRONG') return { open: '<b>', close: '</b>' }
  if (tag === 'I' || tag === 'EM') return { open: '<i>', close: '</i>' }
  if (tag === 'A') {
    const href = el.getAttribute('href') ?? ''
    if (!isSafeHref(href)) return null
    return {
      open: `<a href="${escapeAttr(href.trim())}" target="_blank" rel="noopener noreferrer nofollow">`,
      close: '</a>',
    }
  }
  if (tag === 'SPAN') {
    const classes = Array.from(el.classList).filter((c) => ALLOWED_CLASSES.has(c))
    // 브라우저 execCommand 가 만드는 style 굵게 · 기울임도 받아 준다
    if (classes.length > 0) return { open: `<span class="${classes.join(' ')}">`, close: '</span>' }
    const weight = el.style.fontWeight
    if (weight === 'bold' || Number(weight) >= 600) return { open: '<b>', close: '</b>' }
    if (el.style.fontStyle === 'italic') return { open: '<i>', close: '</i>' }
  }
  return null
}

const toNodes = (parent: Node, multiline: boolean): RichNode[] => {
  const nodes: RichNode[] = []
  parent.childNodes.forEach((child, index) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? ''
      const lines = multiline ? text.split('\n') : [text.replace(/\n/g, ' ')]
      lines.forEach((line, i) => {
        if (i > 0) nodes.push({ kind: 'br' })
        if (line) nodes.push({ kind: 'text', text: line })
      })
      return
    }
    if (!(child instanceof HTMLElement)) return
    if (child.tagName === 'BR') {
      // 줄 끝의 자리 표시 br(contentEditable)은 버린다
      if (multiline && index < parent.childNodes.length - 1) nodes.push({ kind: 'br' })
      return
    }
    const children = toNodes(child, multiline)
    if (BLOCK_TAGS.has(child.tagName)) {
      if (multiline && nodes.length > 0) nodes.push({ kind: 'br' })
      nodes.push(...children)
      return
    }
    const wrap = elementWrapper(child)
    if (wrap) nodes.push({ kind: 'el', ...wrap, children })
    else nodes.push(...children)
  })
  return nodes
}

const nodeLength = (n: RichNode): number =>
  n.kind === 'text' ? n.text.length : n.kind === 'br' ? 1 : n.children.reduce((s, c) => s + nodeLength(c), 0)

const truncateNodes = (nodes: RichNode[], limit: number): RichNode[] => {
  const out: RichNode[] = []
  let left = limit
  for (const n of nodes) {
    if (left <= 0) break
    const len = nodeLength(n)
    if (len <= left) {
      out.push(n)
      left -= len
    } else if (n.kind === 'text') {
      out.push({ kind: 'text', text: n.text.slice(0, left) })
      left = 0
    } else if (n.kind === 'el') {
      out.push({ ...n, children: truncateNodes(n.children, left) })
      left = 0
    }
  }
  return out
}

const hasFormatting = (nodes: RichNode[]): boolean =>
  nodes.some((n) => n.kind === 'el')

const renderHtml = (nodes: RichNode[]): string =>
  nodes
    .map((n) =>
      n.kind === 'text'
        ? escapeText(n.text)
        : n.kind === 'br'
          ? '<br>'
          : `${n.open}${renderHtml(n.children)}${n.close}`,
    )
    .join('')

const renderText = (nodes: RichNode[]): string =>
  nodes
    .map((n) => (n.kind === 'text' ? n.text : n.kind === 'br' ? '\n' : renderText(n.children)))
    .join('')

export interface SerializedText {
  /** 저장할 값 — 서식이 있으면 HTML, 없으면 글자 그대로 */
  value: string
  rich: boolean
  length: number
}

/** 편집 영역 내용을 저장할 값으로 — 서식이 하나도 없으면 일반 글자로 저장한다 */
export function serializeEditable(
  root: HTMLElement,
  options: { multiline?: boolean; maxLength?: number } = {},
): SerializedText {
  let nodes = toNodes(root, options.multiline ?? false)
  // 끝의 빈 줄 정리
  while (nodes.length > 0 && nodes[nodes.length - 1].kind === 'br') nodes = nodes.slice(0, -1)
  if (typeof options.maxLength === 'number') nodes = truncateNodes(nodes, options.maxLength)
  const rich = hasFormatting(nodes)
  const length = nodes.reduce((s, n) => s + nodeLength(n), 0)
  return { value: rich ? renderHtml(nodes) : renderText(nodes), rich, length }
}

/** 편집 영역에 넣을 HTML — 서식 글은 정리해서, 일반 글자는 글자로 */
export function toEditableHtml(value: string, rich: boolean): string {
  if (rich) return sanitizeRichHtml(value)
  return escapeText(value).replace(/\n/g, '<br>')
}
