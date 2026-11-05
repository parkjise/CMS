import type { BodyNode, RichNode } from '@cms/types'

/** Tiptap 본문 ↔ 저장 값 (T-143) — 저장 값은 문서의 노드 목록, 검사는 서버 schemas/rich_body.py */

const textNode = (text: string, bold: boolean): RichNode => ({
  type: 'text',
  text,
  ...(bold ? { marks: [{ type: 'bold' }] } : {}),
})

/** 이전 문단 글자 — 줄바꿈 · **굵게** → 노드 */
function legacyInline(text: string): RichNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .flatMap((part) => {
      const bold = part.startsWith('**') && part.endsWith('**')
      const body = bold ? part.slice(2, -2) : part
      return body.split('\n').flatMap((line, i): RichNode[] => [
        ...(i > 0 ? [{ type: 'hardBreak' }] : []),
        ...(line ? [textNode(line, bold)] : []),
      ])
    })
}

/** 편집기에 넣을 문서 — 기존 글(p · ul · image)은 여기서 바꾼다. 저장하면 새 형식이 된다 */
export function toEditorDoc(body: BodyNode[]): RichNode {
  const content = body.map((node): RichNode => {
    if (node.type === 'p' && 'text' in node) {
      return { type: 'paragraph', content: legacyInline(node.text ?? '') }
    }
    if (node.type === 'ul' && 'items' in node) {
      return {
        type: 'bulletList',
        content: node.items.map((item) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: legacyInline(item) }],
        })),
      }
    }
    if (node.type === 'image' && 'src' in node) {
      return { type: 'image', attrs: { src: node.src, alt: node.alt } }
    }
    return node as RichNode
  })
  return { type: 'doc', content }
}

const isEmptyParagraph = (node: RichNode): boolean =>
  node.type === 'paragraph' && !node.content?.length

/** 저장할 본문 — 앞뒤 빈 줄은 뺀다. 글이 없으면 빈 목록 */
export function fromEditorDoc(doc: RichNode): RichNode[] {
  const nodes = [...(doc.content ?? [])]
  while (nodes.length && isEmptyParagraph(nodes[nodes.length - 1])) nodes.pop()
  while (nodes.length && isEmptyParagraph(nodes[0])) nodes.shift()
  return nodes
}

const SAFE_LINK = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i

/** 링크 주소 — 도메인만 적으면 https 를 붙인다. 위험한 주소는 null */
export function normalizeLink(input: string): string | null {
  const href = input.trim()
  if (!href || /^https?:\/\/$/i.test(href)) return null
  if (SAFE_LINK.test(href)) return href
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null
  return `https://${href}`
}
