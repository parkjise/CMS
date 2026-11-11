import { useRef, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import type { PostAttachment } from '@cms/types'
import { Button, toast } from '@cms/ui'
import { useUploadAttachment } from '@/hooks/useBoards'
import { pickErrorMessage } from '@/lib/errorMessages'
import { formatBytes } from '@/lib/imageFile'

export const MAX_ATTACHMENTS = 5
const ACCEPT = '.pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.jpg,.jpeg,.png,.gif'

interface PostAttachmentsFieldProps {
  boardId: string
  value: PostAttachment[]
  onChange: (next: PostAttachment[]) => void
  /** 비밀글 · 회원만 읽는 게시판이면 이유 — 새로 붙일 수 없다 */
  blockedReason?: string
}

/** 글 첨부 파일 (T-194) — 고르면 바로 올리고, 글을 저장해야 붙는다 */
export function PostAttachmentsField({
  boardId,
  value,
  onChange,
  blockedReason,
}: PostAttachmentsFieldProps) {
  const input = useRef<HTMLInputElement>(null)
  const upload = useUploadAttachment(boardId)
  const [uploading, setUploading] = useState(0)
  const room = MAX_ATTACHMENTS - value.length

  const addFiles = async (files: File[]) => {
    if (files.length > room) toast.error(`파일은 ${MAX_ATTACHMENTS}개까지 붙일 수 있어요.`)
    let next = value
    for (const file of files.slice(0, Math.max(room, 0))) {
      setUploading((count) => count + 1)
      try {
        next = [...next, await upload.mutateAsync(file)]
        onChange(next)
      } catch (error) {
        toast.error(`${file.name}: ${pickErrorMessage(error, '올리지 못했습니다.')}`)
      } finally {
        setUploading((count) => count - 1)
      }
    }
  }

  return (
    <fieldset className="rounded-lg border border-slate-200 bg-white p-4">
      <legend className="px-1 text-sm font-medium text-slate-700">첨부 파일</legend>
      {value.length > 0 && (
        <ul className="mb-3 divide-y divide-slate-100 rounded-md border border-slate-100">
          {value.map((file) => (
            <li key={file.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <Paperclip className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <a
                href={file.url}
                className="min-w-0 truncate text-slate-800 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {file.name}
              </a>
              <span className="shrink-0 text-xs text-slate-400">{formatBytes(file.size)}</span>
              <button
                type="button"
                className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label={`${file.name} 빼기`}
                onClick={() => onChange(value.filter((item) => item.id !== file.id))}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {blockedReason ? (
        <p className="text-xs text-amber-700">{blockedReason}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            aria-label="첨부할 파일"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ''
              void addFiles(files)
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={uploading > 0}
            disabled={room <= 0}
            onClick={() => input.current?.click()}
          >
            파일 올리기
          </Button>
          <p className="text-xs text-slate-500">
            PDF · 한글 · 워드 · 엑셀 · 파워포인트 · ZIP · 사진, 하나에 20MB · 최대 {MAX_ATTACHMENTS}
            개. 홈페이지 글 아래에서 원래 이름으로 내려받아요.
          </p>
        </div>
      )}
    </fieldset>
  )
}
