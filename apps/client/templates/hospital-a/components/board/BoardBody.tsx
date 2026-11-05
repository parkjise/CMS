import type { BodyBlock } from '@cms/types'
import { RichLine } from '../sub/RichText'

/** 글 본문 블록 — p(줄바꿈 · 굵게) · ul · image. HTML 을 그대로 넣지 않는다 */
export function BoardBody({ blocks, className }: { blocks: BodyBlock[]; className?: string }) {
  return (
    <div className={`board-view__content${className ? ` ${className}` : ''}`}>
      {blocks.map((block, i) => {
        if (block.type === 'image') {
          return (
            <figure key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element -- 글 본문 이미지 */}
              <img src={block.src} alt={block.alt} />
            </figure>
          )
        }
        if (block.type === 'ul') {
          return (
            <ul key={i}>
              {block.items.map((li, n) => (
                <li key={n}>{li}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i}>
            <RichLine text={block.text} />
          </p>
        )
      })}
    </div>
  )
}
