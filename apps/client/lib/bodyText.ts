import type { BodyNode, RichNode } from '@cms/types'

const INLINE = new Set(['text', 'hardBreak'])

const richText = (node: RichNode): string => {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  const children = node.content ?? []
  const inline = children.every((child) => INLINE.has(child.type))
  return children.map(richText).join(inline ? '' : '\n')
}

/** 글 본문 → 글자만 (T-221) — 구조화 데이터의 답변. 백엔드 seo.body_text 와 같은 규칙 */
export function bodyPlainText(nodes: BodyNode[]): string {
  const parts = nodes.flatMap((node): string[] => {
    if (node.type === 'p' && 'text' in node) return [String(node.text).replaceAll('**', '')]
    if (node.type === 'ul' && 'items' in node) return node.items.map(String)
    if (node.type === 'image') return []
    return [richText(node as RichNode)]
  })
  return parts
    .flatMap((part) => part.split('\n'))
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}
