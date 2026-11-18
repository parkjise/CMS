import type { PublicBoard, PublicPostItem } from '@cms/types'
import { bodyPlainText } from '@/lib/bodyText'
import { buildFaqJsonLd, serializeJsonLd } from '@/lib/jsonLd'

interface FaqJsonLdProps {
  board: PublicBoard
  posts: PublicPostItem[]
}

/** FAQ 구조화 데이터 (T-221, 사이트 관리 AEO) — 이 화면에 펼쳐 보이는 질문 · 답변만 */
export function FaqJsonLd({ board, posts }: FaqJsonLdProps) {
  if (!board.faq_jsonld || board.board_type !== 'FAQ') return null
  const entries = posts
    .filter((post) => !post.is_secret)
    .map((post) => ({ question: post.title, answer: bodyPlainText(post.body ?? []) }))
    .filter((entry) => entry.answer)
  if (entries.length === 0) return null
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildFaqJsonLd(entries)) }}
    />
  )
}
