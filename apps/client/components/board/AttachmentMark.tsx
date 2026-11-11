import { Paperclip } from 'lucide-react'

/** 글 목록의 📎 — 첨부 파일이 있는 글 (T-197). 테마형 · 코드형 공통 */
export function AttachmentMark({
  className = 'ml-1 inline align-[-2px] opacity-60',
}: {
  className?: string
}) {
  return <Paperclip size={14} className={className} aria-label="첨부 파일" role="img" />
}
