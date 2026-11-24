import type { RichNode } from '@cms/types'
import type { DraftBlock } from '@/lib/aiAssist'

/** 본문에 넣는 방법 — 본문 끝에 붙이기 · 본문 바꾸기 (기획서 A-3) */
export type DraftMode = 'append' | 'replace'

/** 줄바꿈만 hardBreak 로 — 꺾쇠 · ** 같은 글자는 서식으로 읽지 않고 글자 그대로 둔다 */
const inline = (text: string): RichNode[] =>
  text
    .split('\n')
    .flatMap((line, i): RichNode[] => [
      ...(i > 0 ? [{ type: 'hardBreak' }] : []),
      ...(line ? [{ type: 'text', text: line }] : []),
    ])

/** AI 초안 본문 → 편집기 노드 (T-233-A) — HTML 을 거치지 않는다 (T-143 저장 규칙). 빈 칸은 뺀다 */
export function draftToNodes(blocks: DraftBlock[]): RichNode[] {
  return blocks.flatMap((block): RichNode[] => {
    if (block.type === 'ul') {
      const items = block.items.filter((item) => item.trim())
      if (!items.length) return []
      return [
        {
          type: 'bulletList',
          content: items.map((item) => ({
            type: 'listItem',
            content: [{ type: 'paragraph', content: inline(item) }],
          })),
        },
      ]
    }
    return block.text.trim() ? [{ type: 'paragraph', content: inline(block.text) }] : []
  })
}
