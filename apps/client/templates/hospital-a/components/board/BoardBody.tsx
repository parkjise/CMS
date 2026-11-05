import type { BodyNode } from '@cms/types'
import { RichBody } from '../../../shared/RichBody'

/** 글 본문 — 스타일은 .board-view__content */
export function BoardBody({ blocks, className }: { blocks: BodyNode[]; className?: string }) {
  return (
    <div className={`board-view__content${className ? ` ${className}` : ''}`}>
      <RichBody nodes={blocks} />
    </div>
  )
}
